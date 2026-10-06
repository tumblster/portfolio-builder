// Prueba de humo de la API, el acceso, el studio, la landing y la página pública (v2 · M4-rev r2). No gasta saldo: nunca llega a Apify ni a Groq.
// Úsala en tu compu, no contra producción (crea datos de prueba en .data/).
// 1) npm run dev   2) en otra terminal: npm run smoke

import { createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const KEY = process.env.CREATOR_ACCESS_KEY;

if (!KEY) {
  console.error("✘ Falta CREATOR_ACCESS_KEY en .env.local");
  process.exit(1);
}

let failures = 0;
function check(ok, label, detail) {
  console.log(`${ok ? "✔" : "✘"} ${label}`);
  if (!ok) {
    failures += 1;
    if (detail !== undefined) console.log(`   ${JSON.stringify(detail)}`);
  }
}

async function call(method, path, { json, form, withKey = true } = {}) {
  const headers = {};
  if (withKey) headers["x-creator-key"] = KEY;
  if (json !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
  });
  const data = (res.headers.get("content-type") ?? "").includes("application/json") ? await res.json() : null;
  return { status: res.status, data, headers: res.headers };
}

/** Píldoras de nicho de la página: [{ href, label, current }]. */
function pills(html) {
  return [...html.matchAll(/<a([^>]*class="pf-pill"[^>]*)>([^<]*)<\/a>/g)].map(([, attrs, label]) => ({
    href: attrs.match(/href="([^"]*)"/)?.[1] ?? "",
    label,
    current: /aria-current="page"/.test(attrs),
  }));
}

/** Nichos filtrables de la página (las reglas CSS del filtro), sin "todo": los links /p/<slug>/<nicho> que funcionan. */
function filterNiches(html) {
  return [...new Set([...html.matchAll(/\.pf\[data-pf-filter="([a-z0-9-]+)"\]/g)].map((m) => m[1]))].filter((n) => n !== "todo");
}
/** Nicho activo de la página (atributo del marco de la plantilla). */
const activeNiche = (html) => html.match(/class="pf"[^>]*data-pf-filter="([a-z0-9-]+)"|data-pf-filter="([a-z0-9-]+)"[^>]*class="pf"/)?.slice(1).find(Boolean) ?? null;
/** Las dos vistas del portafolio público (7.3): el panel "Contenido" (antes «Sobre mí») y el del Media Kit. */
function panelsOf(html) {
  const about = html.indexOf('id="pf-panel-about"');
  const kit = html.indexOf('id="pf-panel-kit"');
  return { about: about >= 0 && kit > about ? html.slice(about, kit) : "", kit: kit >= 0 ? html.slice(kit) : "" };
}

/** Todo el CSS que carga una página (para revisar reglas de diseño). */
async function cssOf(pageHtml) {
  let css = "";
  for (const href of [...pageHtml.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1])) {
    css += await (await fetch(new URL(href.replace(/&amp;/g, "&"), BASE))).text();
  }
  return css;
}

/** Piezas de la página: { id → "todo belleza" }. */
function pieceViews(html) {
  return Object.fromEntries([...html.matchAll(/data-pf-piece="([^"]+)" data-pf-show="([^"]+)"/g)].map(([, id, views]) => [id, views]));
}

// ── Fixtures en .data/ (solo con almacenamiento local, el de desarrollo) ──
const LOCAL_DATA = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase() !== "blob" && /localhost|127\.0\.0\.1/.test(BASE);
const fixturePath = (slug) => path.join(process.cwd(), ".data", "portfolios", `${slug}.json`);
async function writeFixture(slug, doc) {
  await mkdir(path.dirname(fixturePath(slug)), { recursive: true });
  await writeFile(fixturePath(slug), JSON.stringify(doc, null, 2));
}

/** Un portafolio importado de Instagram, como lo guardaría la importación (v1: sin nichos propios ni servicios). */
function fixtureDoc({ slug, version, image, niches, pieceNiches }) {
  const now = new Date().toISOString();
  const post = (n, extra) => ({
    id: `post-${n}`,
    shortCode: `C${n}abc`,
    url: `https://www.instagram.com/p/C${n}abc/`,
    type: "image",
    caption: `Publicación ${n}`,
    hashtags: [],
    takenAt: now,
    likesCount: 900 + n * 100,
    commentsCount: 40,
    viewsCount: null,
    isPinned: false,
    image,
    ...extra,
  });
  const posts = [post(1, { type: "video", viewsCount: 12400 }), post(2, { type: "video", viewsCount: 8000 }), post(3), post(4)];
  const titles = ["Rutina express", "Mi ciudad en 30 segundos", "Detrás de cámaras"];
  return {
    schemaVersion: version,
    slug,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    source: "instagram",
    instagram: {
      source: "apify/instagram-scraper",
      scrapedAt: now,
      username: "valen.fixture",
      profileUrl: "https://www.instagram.com/valen.fixture/",
      fullName: "Valentina Fixture",
      biography: "Creadora UGC en Lima.",
      externalUrl: null,
      followersCount: 48200,
      followsCount: 300,
      postsCount: 120,
      isVerified: false,
      isBusinessAccount: true,
      businessCategory: null,
      profilePhoto: image,
      posts,
    },
    generated: {
      provider: "groq",
      model: "fixture",
      generatedAt: now,
      valueProp: "Videos que se sienten reales y venden.",
      pieces: titles.map((title, n) => ({ sourcePostId: `post-${n + 1}`, title, niche: pieceNiches[n] })),
      ...(niches ? { niches, services: [{ title: "Reels y TikToks", description: "Guion, grabación y edición." }] } : {}),
    },
    manual: {},
    pieces: titles.map((title, n) => ({
      id: `pieza-${n + 1}`,
      origin: "instagram",
      title,
      niche: pieceNiches[n],
      image,
      video: null,
      sourcePostId: `post-${n + 1}`,
    })),
  };
}

// PNG de 1×1 px para probar la subida sin archivos externos.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

try {
  console.log(`Probando ${BASE}\n`);

  // ── Portafolios e imágenes ──
  const denied = await call("POST", "/api/portfolios", { json: {}, withKey: false });
  check(denied.status === 401, "Sin clave, la API responde 401", denied);

  const form = new FormData();
  form.append("file", new Blob([PNG_1PX], { type: "image/png" }), "prueba.png");
  const upload = await call("POST", "/api/media", { form });
  const image = upload.data?.image;
  check(upload.status === 201 && image?.url?.endsWith(".webp"), "Sube una imagen y la guarda como WebP", upload.data);

  const media = await fetch(BASE + image.url);
  check(
    media.status === 200 && media.headers.get("content-type") === "image/webp",
    `La imagen se sirve en ${image.url}`,
  );
  check((media.headers.get("cache-control") ?? "").includes("immutable"), "La imagen se cachea como inmutable");

  const name = `Prueba ${Date.now().toString(36)}`;
  const chipsSlugForMagic = "lol-no-existe";
  const draft = {
    name,
    bio: "Creo contenido UGC de skincare y viajes.",
    photo: image,
    valueProp: "",
    contact: { instagram: "@prueba.ugc", whatsapp: "+51 987 654 321", email: "hola@prueba.pe" },
    services: [{ title: "Videos UGC para anuncios", description: "Piezas verticales para pauta." }],
    pieces: [
      { title: "Rutina de noche", niche: "belleza", image },
      { title: "Un día conmigo", niche: "lifestyle", image },
      { title: "Reel en Cusco", niche: "viajes", videoUrl: "https://www.tiktok.com/@prueba/video/7400000000000000000" },
    ],
  };

  const created = await call("POST", "/api/portfolios", { json: draft });
  const slug = created.data?.portfolio?.slug;
  check(created.status === 201 && Boolean(slug), `Crea el portafolio → ${created.data?.url}`, created.data);
  check(created.data?.portfolio?.schemaVersion === 2, "Se guarda con el esquema v2", created.data?.portfolio?.schemaVersion);
  check(
    created.data?.resolved?.niches?.map((niche) => niche.slug).join() === "belleza,lifestyle,viajes",
    "Un portafolio creado a mano usa los nichos de siempre (Belleza, Lifestyle, Viajes)",
    created.data?.resolved?.niches,
  );
  check(created.data?.resolved?.services?.[0]?.title === "Videos UGC para anuncios", "Guarda los servicios del formulario manual", created.data?.resolved?.services);

  const twin = await call("POST", "/api/portfolios", { json: draft });
  check(twin.data?.portfolio?.slug === `${slug}-2`, `Con el mismo nombre el link no choca → /p/${twin.data?.portfolio?.slug}`);

  const read = await call("GET", `/api/portfolios/${slug}`);
  check(read.status === 200 && read.data?.resolved?.name === name, "Lee el portafolio guardado", read.data);
  check(read.data?.resolved?.contact?.instagram === "prueba.ugc", "Guarda el usuario de Instagram sin @");
  check(read.data?.resolved?.contact?.whatsapp === "+51987654321", "Normaliza el WhatsApp");
  check(read.data?.portfolio?.pieces?.[2]?.video?.platform === "tiktok", "Reconoce el link de TikTok");
  const ids = read.data?.portfolio?.pieces?.map((piece) => piece.id) ?? [];

  // Visita la página pública (general y una de nicho) antes de editar, para que queden en caché.
  await fetch(`${BASE}/p/${slug}`);
  await fetch(`${BASE}/p/${slug}/belleza`);

  const edited = await call("PATCH", `/api/portfolios/${slug}`, {
    json: { revision: 1, manual: { ...read.data.portfolio.manual, valueProp: "Videos que venden sin parecer anuncio." } },
  });
  check(edited.status === 200 && edited.data?.portfolio?.revision === 2, "Guarda un cambio y sube la revisión a 2", edited.data);

  const stale = await call("PATCH", `/api/portfolios/${slug}`, {
    json: { revision: 1, manual: read.data.portfolio.manual },
  });
  check(stale.status === 409, "No deja guardar encima de una versión vieja (409)", stale.data);
  // Spec 11.12: tarjetas propias, título + link o descripción; un link se muestra como link.
  const beforeServices = (await call("GET", `/api/portfolios/${slug}`)).data.portfolio;
  const withServices = await call("PATCH", `/api/portfolios/${slug}`, {
    json: {
      revision: beforeServices.revision,
      manual: {
        ...beforeServices.manual,
        services: [
          { title: "Tarifas", description: "supercreador.tech/tarifas" },
          { title: "Videos UGC para anuncios", description: "Piezas verticales para pauta." },
        ],
      },
    },
  });
  check(withServices.status === 200 && withServices.data?.resolved?.services?.[0]?.title === "Tarifas", "Servicios: el orden de las tarjetas se guarda tal cual", withServices.data);
  // Ajuste 7: foto propia para el banner del hero.
  const beforeCover = (await call("GET", `/api/portfolios/${slug}`)).data.portfolio;
  const covered = await call("PATCH", `/api/portfolios/${slug}`, {
    json: { revision: beforeCover.revision, manual: { ...beforeCover.manual, cover: image } },
  });
  check(
    covered.status === 200 && covered.data?.resolved?.cover?.url === image?.url,
    "Banner del hero: se guarda una foto propia (manual.cover)",
    covered.data,
  );

  // ── Página pública (sin clave): plantilla Creator ──
  const publicPage = await fetch(`${BASE}/p/${slug}`);
  const html = await publicPage.text();
  const text = html.replace(/<!-- -->/g, "");
  check(publicPage.status === 200 && html.includes(name), `La página pública abre sin clave → /p/${slug}`, publicPage.status);
  check(/<meta name="robots" content="noindex, nofollow"/.test(html), "La página pública no aparece en buscadores (noindex)");
  check(html.includes('<meta name="theme-color" content="#faf7f2"'), "La barra del navegador toma el crema de la página (theme-color)");
  check(html.includes('data-template="creator"') && html.includes('data-pf-filter="todo"'), 'Se dibuja con la plantilla Creator, en "Todo"');
  check(text.includes(`Hola, soy ${name}.`), "El titular presenta a la creadora");
  check(text.includes("UGC Creator") && !/Creadora UGC|Creador UGC/.test(text), "Eyebrow neutral: «UGC Creator» (sin adivinar género)");
  check(text.includes("Contenido destacado") && !text.includes("Trabajo seleccionado"), "La sección se llama «Contenido destacado»");
  check(
    html.includes(`alt="Portada de ${name}"`) && html.includes(encodeURIComponent(image.url).slice(0, 20)) ,
    "El banner del hero usa la foto propia (ajuste 7)",
  );
  check(
    /<a[^>]*href="https:\/\/supercreador\.tech\/tarifas"[^>]*>supercreador\.tech\/tarifas/.test(html) && html.includes("Piezas verticales para pauta."),
    "Servicios: el segundo campo es link (si es un link) o descripción",
  );

  // ── Spec 11.8: magic link (sin registro), alcance de UN portafolio, 30 días ──
  const magic = await call("POST", `/api/portfolios/${slug}/magic-link`, { json: { email: "creadora@ejemplo.com" } });
  check(magic.status === 200 && magic.data?.sent === "mock", `Magic link: se envía (sin SMTP aquí: modo mock, el link queda en los logs) → ${magic.data?.sent}`, magic.data);
  const magicBadEmail = await call("POST", `/api/portfolios/${slug}/magic-link`, { json: { email: "no-es-correo" } });
  check(magicBadEmail.status === 400, "Magic link: pide un correo válido", magicBadEmail.data);
  const magicSecret = createHmac("sha256", KEY).update("portfolio-builder/magic-link/v1").digest("hex");
  const tokenFor = (target, expires) => {
    const payload = Buffer.from(JSON.stringify({ s: target, e: expires, v: 1 })).toString("base64url");
    return `${payload}.${createHmac("sha256", magicSecret).update(payload).digest("base64url")}`;
  };
  const opened = await fetch(new URL(`/m/${tokenFor(slug, Date.now() + 29 * 24 * 3600 * 1000)}`, BASE), { redirect: "manual" });
  const ownerCookie = (opened.headers.get("set-cookie") ?? "").match(/sc_portfolio=[^;]+/)?.[0] ?? "";
  check(
    opened.status === 303 && (opened.headers.get("location") ?? "").endsWith(`/editar/${slug}`) && ownerCookie,
    "Magic link: abrirlo lleva al editor de ESE portafolio y deja su acceso",
  );
  const asOwner = (target) => fetch(new URL(`/api/portfolios/${target}`, BASE), { headers: { cookie: ownerCookie } });
  const ownOk = await asOwner(slug);
  const otherNo = await asOwner(chipsSlugForMagic ?? "otro-portafolio");
  check(ownOk.status === 200 && otherNo.status === 401, `Magic link: sirve solo para su portafolio (el suyo ${ownOk.status}, otro ${otherNo.status})`);
  const expired = await fetch(new URL(`/m/${tokenFor(slug, Date.now() - 1000)}`, BASE), { redirect: "manual" });
  check(expired.status === 303 && (expired.headers.get("location") ?? "").includes("/acceso?enlace=vencido"), "Magic link vencido: a /acceso con aviso");
  const forged = await fetch(new URL(`/m/${tokenFor(slug, Date.now() + 1000).slice(0, -3)}abc`, BASE), { redirect: "manual" });
  check(forged.status === 303 && (forged.headers.get("location") ?? "").includes("enlace=vencido"), "Magic link con la firma alterada: no da acceso");

  // ── 11.9 / 12.7 / 12.9: aperturas con vistas (1 por IP por día), ?ref= y página ──
  const openAs = (ip, body) =>
    fetch(new URL(`/api/portfolios/${slug}/open`, BASE), {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  const v1 = await openAs("203.0.113.1", { ref: "qr", path: "/" });
  const v2 = await openAs("203.0.113.1", { ref: "qr", path: "/" });
  const v3 = await openAs("203.0.113.2", { ref: "whatsapp", path: "/viajes" });
  const repeat = await openAs("203.0.113.9", { seen: true });
  const openRecord = JSON.parse(await readFile(path.join(process.cwd(), ".data", "opens", `${slug}.json`), "utf8").catch(() => "null"));
  check(
    v1.views === 1 && v2.views === 1 && v3.views === 2 && repeat.views === 2 && openRecord?.lastOpenedAt,
    `12.7: vistas públicas, 1 por persona por día (${v1.views} → ${v2.views} → ${v3.views}); repetir en la sesión no suma`,
  );
  check(
    openRecord?.refs?.qr === 2 && openRecord?.refs?.whatsapp === 1 && openRecord?.paths?.["/viajes"] === 1 &&
      !JSON.stringify(openRecord).includes("203.0.113"),
    "12.9: tracking propio de ?ref= (qr, whatsapp) y página visitada, sin guardar IPs",
    { refs: openRecord?.refs, paths: openRecord?.paths },
  );
  for (let n = 3; n <= 10; n += 1) await openAs(`198.51.100.${n}`, { path: "/" });
  const afterMilestone = JSON.parse(await readFile(path.join(process.cwd(), ".data", "opens", `${slug}.json`), "utf8"));
  check(afterMilestone.views === 10 && afterMilestone.milestones?.includes(10), "12.8: el hito de 10 vistas queda registrado (y se avisa por correo al dueño)");
  check(
    (await readFile(path.join(process.cwd(), ".data", "owners", `${slug}.json`), "utf8").then(JSON.parse).catch(() => null))?.email === "creadora@ejemplo.com",
    "12.1: el correo ES la cuenta: queda guardado al pedir el magic link",
  );
  const account = await call("POST", "/api/account/magic-link", { json: { email: "creadora@ejemplo.com" }, withKey: false });
  const accountBad = await call("POST", "/api/account/magic-link", { json: { email: "x" }, withKey: false });
  check(account.status === 200 && account.data?.ok && accountBad.status === 400, "12.1: entrar solo con el correo (magic link, sin contraseña)");

  // ── 11.9: archivado por inactividad (no borrado), avisos y reactivación ──
  const inactive = await call("POST", "/api/portfolios", { json: { ...draft, name: `Inactiva ${Date.now().toString(36)}` } });
  const warned = await call("POST", "/api/portfolios", { json: { ...draft, name: `Avisada ${Date.now().toString(36)}` } });
  const fresh = await call("POST", "/api/portfolios", { json: { ...draft, name: `Nueva ${Date.now().toString(36)}` } });
  const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
  const inactiveSlug = inactive.data?.portfolio?.slug;
  const warnedSlug = warned.data?.portfolio?.slug;
  const freshSlug = fresh.data?.portfolio?.slug;
  await mkdir(path.join(process.cwd(), ".data", "opens"), { recursive: true });
  for (const [target, days] of [[inactiveSlug, 40], [warnedSlug, 25]]) {
    const doc = JSON.parse(await readFile(fixturePath(target), "utf8"));
    await writeFile(fixturePath(target), JSON.stringify({ ...doc, createdAt: daysAgo(days), updatedAt: daysAgo(days) }));
    await writeFile(path.join(process.cwd(), ".data", "opens", `${target}.json`), JSON.stringify({ trackingSince: daysAgo(days), lastOpenedAt: daysAgo(days) }));
  }
  await call("POST", `/api/portfolios/${warnedSlug}/magic-link`, { json: { email: "avisada@ejemplo.com" } });
  const cronNoKey = await call("GET", "/api/cron/cleanup", { withKey: false });
  check(cronNoKey.status === 401, "Archivado: el cron no corre sin CRON_SECRET (o la clave)");
  const dry = await call("GET", "/api/cron/cleanup?dry=1");
  check(
    dry.status === 200 && dry.data?.dryRun && dry.data.archived.includes(inactiveSlug) && dry.data.notified.d7.includes(warnedSlug) &&
      (await call("GET", `/api/portfolios/${inactiveSlug}`)).data?.portfolio?.archivedAt == null,
    "Archivado en seco (?dry=1): dice qué archivaría y a quién avisaría, sin tocar nada",
    dry.data,
  );
  const run = await call("GET", "/api/cron/cleanup");
  const archivedPage = await fetch(new URL(`/p/${inactiveSlug}`, BASE));
  const archivedHtml = await archivedPage.text();
  const kept = await fetch(new URL(`/p/${freshSlug}`, BASE));
  const warnedRecord = JSON.parse(await readFile(path.join(process.cwd(), ".data", "opens", `${warnedSlug}.json`), "utf8"));
  check(
    run.status === 200 && run.data.archived.includes(inactiveSlug) && !run.data.archived.includes(freshSlug) && run.data.startedTracking.includes(freshSlug) &&
      kept.status === 200 && (await call("GET", `/api/portfolios/${inactiveSlug}`)).data?.portfolio?.archivedAt,
    "11.9: a los 30 días sin actividad se ARCHIVA (los datos quedan); uno sin registro empieza a contar hoy",
    run.data,
  );
  check(
    run.data.notified.d7.includes(warnedSlug) && run.data.notified.ig.includes(warnedSlug) && warnedRecord.notices?.d7 && warnedRecord.notices?.ig,
    "11.9 / 12.2: aviso por correo 7 días antes (y el único intento por Instagram de la última semana)",
    warnedRecord.notices,
  );
  check(
    /data-archived/.test(archivedHtml) && /data-expression="pensativa"/.test(archivedHtml) && archivedHtml.includes("No disponible temporalmente") &&
      /Contacta a soporte/.test(archivedHtml) && /noindex/.test(archivedHtml),
    "12.3: el link archivado muestra a Chispa pensativa, «No disponible temporalmente. Contacta a soporte» y el formulario",
  );
  const reactivated = await call("POST", `/api/portfolios/${inactiveSlug}/reactivate`);
  const backHtml = await (await fetch(new URL(`/p/${inactiveSlug}`, BASE))).text();
  check(reactivated.status === 200 && !/data-archived/.test(backHtml) && /data-pf-bar/.test(backHtml), "11.9: se reactiva con 1 clic y vuelve a estar en línea");
  check(html.includes("Videos que venden sin parecer anuncio."), "Muestra al instante el cambio recién guardado (el caché se invalida)");
  check(html.includes("https://www.tiktok.com/@prueba/video/"), "La pieza de video conoce su original");
  // Ajuste 5 (spec 3.1): reels en línea con facade. Sin iframes ni JS de las plataformas en la carga inicial.
  check(
    /data-inline-reel="tiktok"/.test(html) && /<button[^>]*class="reel-hit"[^>]*aria-label="Ver «[^"]+»"/.test(html) && !/<iframe/i.test(html),
    "Reels en línea: tap o clic abre el video ahí mismo; la carga inicial no trae ningún iframe (facade)",
  );
  // Ronda 6 · 13.2: en el portafolio público el video se abre en el overlay (un diálogo), no sobre la miniatura.
  check(
    /data-inline-reel="tiktok"[^>]*data-reel-mode="overlay"/.test(html) && /<button[^>]*class="reel-hit"[^>]*aria-haspopup="dialog"/.test(html),
    "13.2: en el portafolio público el video se abre en el overlay (diálogo a pantalla completa)",
  );
  const embed = await import(new URL("../lib/portfolio/embed.ts", import.meta.url));
  // Los reels van a /reel/{code}/embed/ (experimento 01/10 de lib/portfolio/embed.ts); los posts, a /p/{code}/embed/.
  const embeds = [
    ["instagram", "https://www.instagram.com/reel/C9xYz123/", "https://www.instagram.com/reel/C9xYz123/embed/"],
    ["instagram", "https://www.instagram.com/p/C9xYz123/", "https://www.instagram.com/p/C9xYz123/embed/"],
    ["tiktok", "https://www.tiktok.com/@prueba/video/7312345678901234567", "https://www.tiktok.com/player/v1/7312345678901234567?"],
    ["youtube", "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?"],
  ];
  check(
    embeds.every(([platform, url, prefix]) => embed.embedFor({ platform, url })?.src.startsWith(prefix)) &&
      embed.embedFor({ platform: "instagram", url: "https://www.instagram.com/prueba/" }) === null,
    "Reels en línea: cada link va a su embed oficial (Instagram, TikTok, YouTube); lo que no es un video, no",
  );
  check(
    embeds.every(([platform, url]) => {
      const e = embed.embedFor({ platform, url });
      return e && e.autoplay === false && !/autoplay=1|mute=1/.test(e.src);
    }),
    "Reels en línea: sin autoplay en ninguna plataforma (play manual, también en TikTok y YouTube)",
  );
  // Ronda 6 · 13.3 / 13.23.3: la cadena del carrusel.
  const carouselChain = embed.carouselEmbedFor({ platform: "instagram", url: "https://www.instagram.com/p/C1abc_9/?img_index=2" });
  check(
    JSON.stringify(carouselChain?.srcs) ===
      JSON.stringify(["https://www.instagram.com/p/C1abc_9/embed/", "https://www.instagram.com/reel/C1abc_9/embed/"]) &&
      carouselChain?.postUrl === "https://www.instagram.com/p/C1abc_9/" && carouselChain?.autoplay === false &&
      embed.carouselEmbedFor({ platform: "tiktok", url: "https://www.tiktok.com/@prueba/video/1" }) === null &&
      embed.carouselEmbedFor({ platform: "instagram", url: "https://example.com/p/C1abc/" }) === null,
    "13.3: carrusel → /p/{code}/embed/, luego /reel/{code}/embed/; si no carga, su portada + «Ver carrusel en Instagram»",
    carouselChain,
  );
  check(html.includes("Formas de colaborar") && html.includes("Videos UGC para anuncios"), "Muestra los servicios");
  check(html.includes('href="mailto:hola@prueba.pe"') && html.includes("Hablemos"), 'Cierra con "Hablemos" y el correo a la vista');
  check(!/sugerid[oa]s por la IA/i.test(html), "Sin textos sobre la herramienta ni la IA en la página");
  const fontPreloads = (html.match(/<link[^>]*as="font"[^>]*>/g) ?? []).length;
  check(fontPreloads === 1, `La página pública precarga una sola fuente (DM Sans): ${fontPreloads}`);

  // Ronda 30/09 · 7.3: el selector de nichos es para quien crea (studio); la marca no lo ve. Los links por nicho siguen.
  check(pills(html).length === 0, "La marca no ve el selector de nichos en la página pública (queda en el studio)", pills(html));
  check(
    filterNiches(html).join() === "belleza,lifestyle,viajes" && activeNiche(html) === "todo",
    'Los nichos siguen filtrando por link: "Todo" y uno por nicho (belleza, lifestyle, viajes)',
    filterNiches(html),
  );
  const views = panelsOf(html);
  // Spec 11.6: header ÚNICO en 2 filas: [foto] | «Contenido | Media kit» | Hablemos; abajo, chips de nichos (sin «Todo»).
  const bar = html.match(/<header[^>]*data-pf-bar[\s\S]*?<\/header>/)?.[0] ?? "";
  const barChips = [...bar.matchAll(/data-pf-chip="([a-z0-9-]+)"/g)].map((m) => m[1]);
  check(
    /class="pf-bar__avatar"/.test(bar) &&
      /role="tablist"[^>]*class="pf-seg"/.test(bar) && />Contenido<\/button>/.test(bar) && />Media kit<\/button>/.test(bar) &&
      barChips.length > 0 && barChips.every((chip) => filterNiches(html).includes(chip)) &&
      !barChips.includes("media-kit") && !barChips.includes("todo") && !/>Todo</.test(bar) &&
      /class="pf-bar__cta"[^>]*href="(#pf-page-contacto|https:\/\/wa\.me\/\d+\?text=[^"]+)"[^>]*>Hablemos/.test(bar) &&
      !bar.replace(/<[^>]+>/g, " ").includes(name) &&
      (html.match(/data-pf-bar/g) ?? []).length === 1,
    `Header único: foto | Contenido · Media kit | Hablemos; chips: ${barChips.join(" · ")} (sin nombre ni «Todo»)`,
    bar.slice(0, 300),
  );
  check(
    views.about && views.kit && /id="pf-panel-kit"[^>]*hidden/.test(html) && /id="pf-tab-content"[^>]*aria-selected="true"/.test(bar) &&
      !/aria-current="page"/.test(bar),
    "Por defecto: Contenido, sin chip elegido (se ve todo); el Media kit a un toque (link directo: #media-kit)",
  );
  const publicCss = await cssOf(html);
  check(
    /\.pf-chip\[aria-current=("?)page\1\]\s*\{[^}]*background:\s*(transparent|0 0|none)[;}]/.test(publicCss) &&
      /\.pf-views\[data-view=("?)kit\1\] \.pf-bar__row2\s*\{[^}]*grid-template-rows:\s*0fr/.test(publicCss) &&
      /\.pf-views \.pf-nav,\s*\.pf-views \.ed-top\s*\{\s*display:\s*none/.test(publicCss) &&
      /\.pf-bar__chips\[data-scrolled\]\s*\{[^}]*mask-image:\s*linear-gradient\(90deg,\s*(transparent|#0000)/.test(publicCss),
    "Header: el chip elegido va solo trazado; en Media kit la fila de chips se colapsa; fundido a la izquierda",
  );
  check(/<a[^>]*href="https:\/\/wa\.me\/\?text=[^"]+"[^>]*data-pf-share/.test(html), "12.4: «Compartir por WhatsApp» en el portafolio publicado");
  check(
    views.about && !/pf-stats|Engagement Rate|Seguidores en Instagram/.test(views.about),
    "La vista Contenido no muestra métricas",
  );
  const shown = pieceViews(html);
  check(
    ids.length === 3 && ids.every((id) => shown[id]) && shown[ids[0]] === "todo belleza" && shown[ids[2]] === "todo viajes",
    "Llegan todas las piezas, cada una marcada con su nicho (filtro sin recargar)",
    shown,
  );
  check(html.includes('[data-pf-filter="viajes"]'), "La regla CSS del filtro viene en la página (no hace falta pedir nada al filtrar)");

  // ── Links por nicho ──
  const viajes = await fetch(`${BASE}/p/${slug}/viajes`);
  const viajesHtml = await viajes.text();
  check(viajes.status === 200 && viajesHtml.includes('data-pf-filter="viajes"'), "El link de un nicho abre ya filtrado → /p/…/viajes");
  check(activeNiche(viajesHtml) === "viajes" && pills(viajesHtml).length === 0, "En /viajes, la página ya viene filtrada");
  const viajesBar = viajesHtml.match(/<header[^>]*data-pf-bar[\s\S]*?<\/header>/)?.[0] ?? "";
  check(
    new RegExp(`<a[^>]*href="/p/${slug}"[^>]*aria-current="page"[^>]*data-pf-chip="viajes"`).test(viajesBar),
    "En /viajes, su chip queda elegido y tocarlo vuelve a todo",
  );
  check(/<title>[^<]*— Viajes<\/title>/.test(viajesHtml), "El título de la pestaña nombra el nicho");
  check(/<meta name="robots" content="noindex, nofollow"/.test(viajesHtml), "El link de nicho tampoco se indexa");
  const belleza = await (await fetch(`${BASE}/p/${slug}/belleza`)).text();
  check(belleza.includes("Videos que venden sin parecer anuncio."), "El link de un nicho también muestra al instante lo recién guardado");
  const badNiche = await fetch(`${BASE}/p/${slug}/moda`);
  check(badNiche.status === 404, "Un nicho que el portafolio no tiene responde 404");
  const todoNiche = await fetch(`${BASE}/p/${slug}/todo`);
  check(todoNiche.status === 404, '"/todo" no es un nicho (la versión general es /p/<slug>)');

  // Un nicho que se queda sin piezas: su link sigue abriendo, mostrando todo, y sale de las píldoras.
  const current = (await call("GET", `/api/portfolios/${slug}`)).data.portfolio;
  const withoutLifestyle = current.pieces.map((piece) => ({
    id: piece.id,
    title: piece.title,
    niche: piece.niche === "lifestyle" ? null : piece.niche,
    image: piece.image,
    videoUrl: piece.video?.url ?? null,
  }));
  const regrouped = await call("PATCH", `/api/portfolios/${slug}`, { json: { revision: current.revision, pieces: withoutLifestyle } });
  check(regrouped.status === 200, "Cambiar el nicho de una pieza se guarda", regrouped.data);
  const lifestyle = await fetch(`${BASE}/p/${slug}/lifestyle`);
  const lifestyleHtml = await lifestyle.text();
  check(
    lifestyle.status === 200 && lifestyleHtml.includes('data-pf-filter="todo"') && !filterNiches(lifestyleHtml).includes("lifestyle"),
    "Un nicho sin piezas conserva su link (muestra todo) y deja de ser filtrable",
  );

  const missingPage = await fetch(`${BASE}/p/este-link-no-existe`);
  const missingHtml = await missingPage.text();
  check(missingPage.status === 404 && missingHtml.includes("No encontramos este portafolio"), "Un link inexistente responde 404 en español");

  // ── Validaciones del servidor ──
  const invalid = await call("POST", "/api/portfolios", { json: { ...draft, pieces: draft.pieces.slice(0, 2) } });
  const issue = invalid.data?.error?.issues?.[0];
  check(invalid.status === 400 && issue?.path === "pieces", `Valida en el servidor: "${issue?.message}"`, invalid.data);

  const unknownNiche = await call("POST", "/api/portfolios", {
    json: { ...draft, pieces: [{ ...draft.pieces[0], niche: "fitness" }, ...draft.pieces.slice(1)] },
  });
  check(
    unknownNiche.status === 400 && unknownNiche.data?.error?.issues?.some((i) => i.path === "pieces.0.niche"),
    `Una pieza no puede usar un nicho que el portafolio no tiene: "${unknownNiche.data?.error?.issues?.[0]?.message}"`,
    unknownNiche.data,
  );
  const tooManyServices = await call("POST", "/api/portfolios", {
    json: { ...draft, services: Array.from({ length: 5 }, (_, n) => ({ title: `Servicio ${n + 1}` })) },
  });
  check(
    tooManyServices.status === 400 && tooManyServices.data?.error?.issues?.some((i) => i.path === "services"),
    `Hasta 4 servicios: "${tooManyServices.data?.error?.issues?.[0]?.message}"`,
    tooManyServices.data,
  );

  const missing = await call("GET", "/api/portfolios/este-link-no-existe");
  check(missing.status === 404, "Un link que no existe responde 404");

  // ── Compatibilidad: un JSON de la v1 y uno de la v2 con nichos propios (solo con almacenamiento local) ──
  let customSlug = null;
  if (LOCAL_DATA) {
    const stamp = Date.now().toString(36);
    const v1Slug = `fixture-v1-${stamp}`;
    await writeFixture(v1Slug, fixtureDoc({ slug: v1Slug, version: 1, image, niches: null, pieceNiches: ["belleza", "viajes", null] }));
    const v1 = await fetch(`${BASE}/p/${v1Slug}`);
    const v1Html = await v1.text();
    check(v1.status === 200 && v1Html.includes("Valentina Fixture"), "Un portafolio guardado en la v1 sigue abriendo");
    // Ronda 30/09 · 7.3: las cifras de Instagram viven en el MEDIA KIT; la vista Contenido no muestra métricas.
    const v1Views = panelsOf(v1Html);
    check(
      /48,2\s?mil/.test(v1Views.kit) && v1Views.kit.includes("Seguidores") && v1Views.kit.includes("Interacciones promedio"),
      "Sus cifras reales de Instagram (seguidores e interacciones promedio) están en el Media Kit",
    );
    check(
      /12,4\s?mil vistas/.test(v1Views.about) && !/Seguidores en Instagram|Engagement Rate/.test(v1Views.about),
      "Contenido muestra las vistas de cada pieza (ajuste 10), pero no las cifras del perfil ni el ER",
    );
    const v1Belleza = await fetch(`${BASE}/p/${v1Slug}/belleza`);
    check(v1Belleza.status === 200, "Sus links de la v1 por nicho siguen abriendo (/belleza)");
    const v1Read = await call("GET", `/api/portfolios/${v1Slug}`);
    const v1Patch = await call("PATCH", `/api/portfolios/${v1Slug}`, { json: { revision: 1, manual: v1Read.data.portfolio.manual } });
    const stored = JSON.parse(await readFile(fixturePath(v1Slug), "utf8"));
    check(v1Patch.status === 200 && stored.schemaVersion === 2, "Al editarlo se guarda como v2 sin perder nada", stored.schemaVersion);

    customSlug = `fixture-v2-${stamp}`;
    await writeFixture(
      customSlug,
      fixtureDoc({
        slug: customSlug,
        version: 2,
        image,
        niches: [
          { slug: "fitness", label: "Fitness" },
          { slug: "cocina-saludable", label: "Cocina saludable" },
        ],
        pieceNiches: ["fitness", "cocina-saludable", null],
      }),
    );
    const custom = await fetch(`${BASE}/p/${customSlug}/cocina-saludable`);
    const customHtml = await custom.text();
    check(
      custom.status === 200 && filterNiches(customHtml).join() === "fitness,cocina-saludable",
      "Nichos propios detectados por la IA: sus links (/cocina-saludable) filtran",
      filterNiches(customHtml),
    );
    check(activeNiche(customHtml) === "cocina-saludable", "El link del nicho propio abre ya filtrado");
    const customBelleza = await fetch(`${BASE}/p/${customSlug}/belleza`);
    check(customBelleza.status === 404, "Con nichos propios, los de la v1 no existen (/belleza → 404)");

    // Ronda 6 · 13.3: un carrusel de Instagram en el portafolio público se abre en el overlay (facade: sin iframe al cargar).
    const carouselSlug = `fixture-carrusel-${stamp}`;
    const carouselDoc = fixtureDoc({ slug: carouselSlug, version: 2, image, niches: null, pieceNiches: [null, null, null] });
    carouselDoc.instagram.posts[2] = { ...carouselDoc.instagram.posts[2], type: "carousel" };
    await writeFixture(carouselSlug, carouselDoc);
    const carouselHtml = await (await fetch(`${BASE}/p/${carouselSlug}`)).text();
    check(
      /data-inline-reel="instagram"[^>]*data-reel-mode="overlay"[^>]*data-reel-carousel/.test(carouselHtml) &&
        /<button[^>]*class="reel-hit"[^>]*aria-label="Ver «Detrás de cámaras»"[^>]*aria-haspopup="dialog"/.test(carouselHtml) &&
        !/<iframe/i.test(carouselHtml),
      "13.3: el carrusel del portafolio público se abre en el overlay (la carga inicial no trae iframes)",
    );
  } else {
    console.log("· Se saltan las pruebas con JSON de la v1/v2: el almacenamiento no es local (.data/).");
  }

  // ── Acceso con la clave (cookie de sesión) ──
  const wrongLogin = await call("POST", "/api/session", { json: { key: "clave-equivocada" }, withKey: false });
  check(wrongLogin.status === 401, "Una clave equivocada no entra (401)", wrongLogin.data);

  const login = await call("POST", "/api/session", { json: { key: KEY }, withKey: false });
  const setCookie = login.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  check(
    login.status === 200 && cookie.startsWith("sc_creator=") && /httponly/i.test(setCookie),
    "La clave correcta abre la sesión (cookie HttpOnly)",
    setCookie,
  );

  // v2 · M4: "/" es la landing pública; crear vive en /crear.
  const withoutSession = await fetch(BASE + "/crear", { redirect: "manual" });
  check(
    withoutSession.status === 307 && (withoutSession.headers.get("location") ?? "").includes("/acceso?next=/crear"),
    "Sin sesión, la pantalla de creación (/crear) lleva a /acceso y vuelve después",
    withoutSession.status,
  );
  const withSession = await fetch(BASE + "/crear", { headers: { cookie }, redirect: "manual" });
  const createHtml = await withSession.text();
  check(withSession.status === 200 && createHtml.includes("De Instagram a portafolio"), "Con sesión, se abre la pantalla de creación", withSession.status);
  const accessWithSession = await fetch(BASE + "/acceso", { headers: { cookie }, redirect: "manual" });
  check(
    accessWithSession.status === 307 && accessWithSession.headers.get("location")?.endsWith("/crear"),
    "Con sesión, /acceso lleva directo a crear",
    accessWithSession.headers.get("location"),
  );

  // ── Landing "/" (v2 · M4-rev r2): hero → roadmap de producto → cierre con captura de correo ──
  const landing = await fetch(BASE + "/", { redirect: "manual" });
  const landingHtml = await landing.text();
  const visible = landingHtml.replace(/<(script|style|title)[^>]*>[\s\S]*?<\/\1>/g, " ");
  // El logo de Instagram (r3 · 1) se lee como la palabra, igual que para un lector de pantalla (aria-label).
  const textOf = (html) =>
    html
      .replace(/<span[^>]*role="img"[^>]*aria-label="Instagram"[^>]*>\s*<\/span>/g, "Instagram")
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  check(landing.status === 200, "La landing abre sin sesión (/)", landing.status);
  check(/<meta name="robots" content="noindex, nofollow"/.test(landingHtml), "La landing sigue fuera de los buscadores (noindex)");
  const sections = [...visible.matchAll(/<section[^>]*>/g)].map((m) => m[0]);
  check(
    sections.length === 3 && /data-hero/.test(sections[0]) && /id="como-funciona"/.test(sections[1]) && /id="piloto"/.test(sections[2]),
    "La landing queda en 3 bloques: hero, roadmap (#como-funciona) y el cierre del piloto",
    sections,
  );
  check(
    !/Hecho para creadoras UGC de|Cuatro plantillas|la cifra que miran las marcas|href="#plantillas"/.test(visible),
    "Sin las secciones quitadas: tira de nichos, plantillas y bloque del Engagement Rate",
  );
  check(
    /<header class="[^"]*\bfixed\b/.test(landingHtml) && ["#como-funciona", "#piloto"].every((href) => landingHtml.includes(`href="${href}"`)),
    "Navegación fija con Roadmap y Piloto",
  );
  const h1 = textOf(landingHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  const heroSub = textOf(landingHtml.match(/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
  const heroCopy = visible.match(/<div class="landing-hero__copy([^"]*)">\s*(<[a-z0-9]+)/);
  check(
    h1 === "Dale superpoderes a tu marca personal" && (landingHtml.match(/<h1/g) ?? []).length === 1 &&
      heroSub === "Convierte tu Instagram en un portafolio web profesional, listo para enviar a las marcas" &&
      heroCopy?.[2] === "<h1" && !visible.includes("Empieza por aquí"),
    `Hero con el copy aprobado, sin eyebrow ("${h1}")`,
    { h1, heroSub, first: heroCopy?.[2] },
  );
  const h1Html = visible.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0] ?? "";
  check(
    /<h1[^>]*class="[^"]*\blanding-h1\b/.test(visible) &&
      (visible.match(/landing-tmj/g) ?? []).length === 1 &&
      /<span[^>]*class="[^"]*\blanding-tmj\b[^"]*"[^>]*>superpoderes/.test(h1Html),
    "El H1 va en Inter Tight y TMJ solo en \"superpoderes\"",
  );
  check(
    /\btext-center\b/.test(heroCopy?.[1] ?? "") && /\bmd:text-left\b/.test(heroCopy?.[1] ?? ""),
    "Hero: el stack de texto va centrado en el celular y a la izquierda desde tablet",
  );
  const heroSubHtml = landingHtml.match(/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
  check(
    /<span[^>]*role="img"[^>]*aria-label="Instagram"[^>]*class="instagram-logo"/.test(heroSubHtml) &&
      !/Instagram/.test(heroSubHtml.replace(/<span[^>]*aria-label="Instagram"[^>]*>\s*<\/span>/g, "")),
    "Instagram va con su logo oficial (con aria-label) en vez de la palabra",
  );
  const electricSpan = visible.match(/<span[^>]*data-electric[^>]*>/)?.[0] ?? "";
  // Ajuste 1: electricidad real en Brasa. 7 fotogramas de rayos (desplazamiento de punto medio) que se turnan en ráfagas.
  const electricHtml = visible.slice(visible.indexOf("data-electric"), visible.indexOf("</h1>"));
  const arcFrames = electricHtml.match(/<svg[^>]*class="electric-arcs__frame electric-arcs__frame--\d"[^>]*aria-hidden="true"/g) ?? [];
  const arcPaths = [...electricHtml.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  check(
    /\belectric-word\b/.test(electricSpan) &&
      /whitespace-nowrap/.test(electricSpan) &&
      arcFrames.length === 7 &&
      arcPaths.length >= 42 &&
      arcPaths.every((d) => (d.match(/L/g) ?? []).length >= 8) &&
      /vector-effect="non-scaling-stroke"/.test(electricHtml) &&
      /@keyframes arc-f0/.test(landingHtml) &&
      /animation:arc-f0 4620ms/.test(landingHtml) &&
      !/<style/.test(landingHtml.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? "<style") &&
      !/<img|<image|\.png|\.gif/.test(electricHtml),
    `"superpoderes": electricidad en Brasa, ${arcFrames.length} fotogramas de rayos quebrados (${arcPaths.length} trazos), sin imágenes ni partir la palabra`,
  );
  check(
    [...visible.matchAll(/<a([^>]*)>¿Tienes un código\? Accede aquí<\/a>/g)].some((m) => /href="\/acceso"/.test(m[1])) &&
      [...visible.matchAll(/<a([^>]*)>Acceso<\/a>/g)].some((m) => /href="\/acceso"/.test(m[1]) && /data-nav-access/.test(m[1])),
    "Acceso: «¿Tienes un código? Accede aquí» bajo el botón del hero y «Acceso» en el navbar (a /acceso)",
  );
  const morph = visible.match(/<div[^>]*data-hero-morph[\s\S]*?<\/div><\/div><\/div>/)?.[0] ?? visible;
  const morphStates = [...visible.matchAll(/class="hero-morph__layer"[^>]*data-state="([a-z]+):([a-z]+)"/g)].map((m) => [m[1], m[2]]);
  check(
    morphStates.length >= 4 &&
      new Set(morphStates.map(([template]) => template)).size === 4 &&
      morphStates.every(([template, palette]) => ["creator", "bio", "minimal", "editorial"].includes(template) && ["crema", "terracota", "salvia", "rosa", "grafito"].includes(palette)) &&
      /<div[^>]*class="hero-morph"[^>]*role="img"[^>]*aria-label="[^"]+"/.test(morph),
    `Hero: el mock muta entre las 4 plantillas y paletas reales (${morphStates.map((s) => s.join("/")).join(", ")})`,
  );
  check(
    !/data-brush-underline/.test(visible) && (visible.match(/data-electric/g) ?? []).length === 1 && /web profesional, listo/.test(visible),
    "\"profesional\" va sin efectos y ya no hay subrayados de pincel",
  );
  const hero = landingHtml.slice(landingHtml.indexOf("<h1"), landingHtml.indexOf("data-hero-mascot"));
  check(
    (hero.match(/rounded-full bg-ink/g) ?? []).length === 1 && hero.includes("Ver el roadmap") && /href="#piloto"/.test(hero),
    "Hero: un solo botón sólido (lleva a la captura del piloto) y \"Ver el roadmap ›\" como link",
  );
  // Chispa: la de los dientes (carcajada) en el hero y las 5 del recorrido al bajar.
  const heroMascot = visible.match(/data-hero-mascot[^>]*>\s*<svg[^>]*>/)?.[0] ?? "";
  check(/data-expression="carcajada"/.test(heroMascot), "Chispa en el hero: la carcajada (el grin con dientes)", heroMascot.slice(0, 120));
  const traveler = visible.match(/<div[^>]*data-mascot-traveler[\s\S]*?<\/div>/)?.[0] ?? "";
  const travelerFaces = [...traveler.matchAll(/data-face="(\w+)"/g)].map((m) => m[1]);
  const zones = [...visible.matchAll(/data-mascot-zone="(\w+)"/g)].map((m) => m[1]);
  const order = ["guino", "sorprendida", "picara", "estrella", "carcajada"];
  check(
    JSON.stringify(travelerFaces) === JSON.stringify(order) && JSON.stringify(zones) === JSON.stringify(order),
    `Al bajar, la carita viajera cambia de expresión por tramo: ${zones.join(" → ")}`,
    { travelerFaces, zones },
  );
  check(
    /<div[^>]*class="mascot-traveler"[^>]*aria-hidden="true"/.test(visible) &&
      !/mascot-companion/.test(landingHtml) &&
      (visible.match(/data-mascot-target/g) ?? []).length === 1 &&
      /<footer[\s\S]*data-mascot-target[\s\S]*<\/footer>/.test(visible),
    "Sin la burbuja de antes: una sola carita viajera (decorativa) que aterriza en el logo del footer",
  );
  const cssLinks = [...landingHtml.matchAll(/<link[^>]+href="([^"]+\.css[^"]*)"/g)].map((m) => m[1]);
  let landingCss = "";
  const landingSheets = [];
  for (const href of cssLinks) {
    const sheetUrl = new URL(href, BASE).toString();
    const text = await (await fetch(sheetUrl)).text();
    landingSheets.push([sheetUrl, text]);
    landingCss += text;
  }
  const mascotCss = [
    ...(landingCss.replace(/@(keyframes|media)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "").match(/[^{}]*\.mascot[^{}]*\{[^{}]*\}/g) ?? []),
    ...(landingCss.match(/@(?:keyframes|media)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []).filter((block) => block.includes("mascot")),
  ].join("");
  // Solo las caras (data-mascot="…"), no el logo del footer (data-mascot-target).
  const mascotSvgs = [...visible.matchAll(/<svg[^>]*\sdata-mascot="[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  const mascotBytes = mascotSvgs.reduce((sum, svg) => sum + Buffer.byteLength(svg), 0) + Buffer.byteLength(mascotCss);
  check(
    // 11 KB (antes 10): la viajera lleva su propia carcajada (no un <use> del hero) para dejar de "respirar" y
    // calzar exacto con el logo del footer.
    mascotSvgs.length === 6 && mascotBytes < 11_000,
    `Chispa pesa ${(mascotBytes / 1024).toFixed(1)} KB (${mascotBytes} B) en la página: ${mascotSvgs.length} caras (hero + 5 de la viajera) y su CSS (< 11 KB)`,
  );
  check(
    /prefers-reduced-motion:\s*reduce\)\s*\{\s*\.mascot-traveler\s*\{\s*display:\s*none/.test(landingCss.replace(/\s+/g, " ")) &&
      /prefers-reduced-motion:\s*no-preference/.test(mascotCss) && /\.electric-arcs__frame--0\s*\{\s*opacity:\s*1/.test(landingCss.replace(/\s+/g, " ")) &&
      /--arc:\s*#fc3300/i.test(landingCss) &&
      /prefers-reduced-motion:no-preference\)\{@keyframes arc-f0/.test(landingHtml) && /hero-morph/.test(landingCss) &&
      /prefers-reduced-motion:\s*reduce\)\s*\{\s*\.hero-morph__layer:not\(:first-child\)\s*\{\s*display:\s*none/.test(landingCss.replace(/\s+/g, " ")),
    "Con \"reducir movimiento\" todo queda quieto: sin viajera, sin parpadeo, rayos y carrusel sin animar",
  );
  const assetOf = (selector) => {
    for (const [sheetUrl, text] of landingSheets) {
      const rule = text.match(new RegExp(`${selector}[^{]*\\{[^}]*url\\(([^)]+\\.png)\\)`))?.[1]?.replace(/["']/g, "");
      if (rule) return new URL(rule, sheetUrl).toString();
    }
    return null;
  };
  for (const [selector, label, maxBytes] of [["\\.instagram-logo", "El logo de Instagram", 15_000]]) {
    const url = assetOf(selector);
    const png = url ? await fetch(url) : null;
    const bytes = png?.ok ? (await png.arrayBuffer()).byteLength : 0;
    check(
      png?.ok && /image\/png/.test(png.headers.get("content-type") ?? "") && bytes > 0 && bytes < maxBytes,
      `${label}: PNG incluido en el build y servido (${(bytes / 1024).toFixed(1)} KB, < ${maxBytes / 1000} KB)`,
      url,
    );
  }
  const roadmap = visible.slice(visible.indexOf('id="como-funciona"'), visible.indexOf('id="piloto"'));
  check(
    /For you page/i.test(roadmap) &&
      textOf(roadmap.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "") === "Estamos construyendo herramientas para ti" &&
      [
        ["Portfolio Builder", "Disponible ahora"],
        ["Tablero de oportunidades", "En construcción"],
        ["Tarifar sin fricción", "Próximo"],
      ].every(([name, status]) => roadmap.includes(name) && roadmap.includes(`data-roadmap-status="${status}"`)) &&
      (roadmap.match(/<li[^>]*data-mascot-zone/g) ?? []).length === 3 &&
      /<a[^>]*href="\/crear"[^>]*>Probarlo<\/a>/.test(roadmap) &&
      (roadmap.match(/<button[^>]*disabled=""[^>]*>Próximamente<\/button>/g) ?? []).length === 2,
    "Roadmap: 3 herramientas con su estado; solo Portfolio Builder se puede probar (/crear)",
  );
  check(
    /<a[^>]*href="#piloto"[^>]*data-pilot-float[^>]*>Únete al programa piloto<\/a>/.test(visible) && /\.pilot-float\s*\{[^}]*z-index:\s*20/.test(landingCss),
    "Botón flotante del piloto (lleva a #piloto, por debajo de la carita viajera)",
  );
  check(
    /<form[^>]*data-pilot-form/.test(visible) && /type="email"/.test(visible) && /Únete al programa piloto/.test(visible),
    "Cierre: captura de correo del programa piloto",
  );
  const accessPage = await fetch(BASE + "/acceso", { redirect: "manual" });
  const accessHtml = await accessPage.text();
  check(
    accessPage.status === 200 &&
      /class="[^"]*\blanding\b/.test(accessHtml) &&
      /<header class="[^"]*\bfixed\b/.test(accessHtml) &&
      /<footer/.test(accessHtml) &&
      /id="clave"/.test(accessHtml) &&
      /landing-btn-3d/.test(accessHtml) &&
      /data-expression="sonriente"/.test(accessHtml),
    "/acceso usa el sistema de la landing: su header y footer, Chispa y el botón 3D",
  );

  // API del programa piloto (pública)
  const pilot = (json) => call("POST", "/api/piloto", { json, withKey: false });
  const badEmail = await pilot({ email: "no-es-un-correo" });
  check(badEmail.status === 400, `Piloto: un correo inválido se rechaza: "${badEmail.data?.error?.issues?.[0]?.message}"`);
  const pilotEmail = `smoke.${Date.now()}@ejemplo.com`;
  check(
    /--landing-ember:\s*var\(--color-ink\)/.test(landingCss) && /\.landing-ember\s*\{[^}]*background:\s*var\(--landing-ember\)/.test(landingCss),
    "La tarjeta «Únete al programa piloto» es negra (la tinta), no vino",
  );
  const joined = await pilot({ email: `  ${pilotEmail.toUpperCase()} ` });
  const again = await pilot({ email: pilotEmail });
  check(joined.status === 201 && again.status === 200 && again.data?.alreadySignedUp === true, "Piloto: anotarse guarda el correo (201) y repetirlo no duplica (200)", { joined, again });
  const bot = await pilot({ email: `bot.${Date.now()}@ejemplo.com`, website: "spam.example" });
  check(bot.status === 200 && bot.data?.alreadySignedUp === undefined, "Piloto: la trampa para bots responde igual pero no guarda");
  if (LOCAL_DATA) {
    const { createHash } = await import("node:crypto");
    const id = createHash("sha256").update(pilotEmail).digest("hex").slice(0, 32);
    const saved = JSON.parse(await readFile(path.join(process.cwd(), ".data", "pilot-signups", `${id}.json`), "utf8").catch(() => "null"));
    check(saved?.email === pilotEmail && saved?.source === "landing", "Piloto: el correo queda en pilot-signups/ (normalizado, en minúsculas)", saved);
    // 8.4: sin Sheet configurado en este entorno, el submit va al MODO MOCK, claramente marcado.
    const sheetConfigured = Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
    const row = JSON.parse(await readFile(path.join(process.cwd(), ".data", "pilot-sheet-mock", `${id}.json`), "utf8").catch(() => "null"));
    check(
      sheetConfigured
        ? joined.data?.sink === "sheet"
        : joined.data?.sink === "mock" && joined.headers?.get?.("x-pilot-sink") !== "sheet" && row?.email === pilotEmail && row?.mock === true && /MODO MOCK/.test(row?.note ?? ""),
      sheetConfigured
        ? "Piloto → Google Sheets: el correo llegó al Sheet (sink «sheet»; verifica la fila con npm run test:sheet)"
        : "Piloto → Google Sheets en MODO MOCK (sin Sheet configurado): la fila queda en pilot-sheet-mock/, marcada como mock",
      { sink: joined.data?.sink, row },
    );
  }

  // Chispa: las 6 expresiones en un lienzo cuadrado común, centradas por su tinta, con aire y a la misma escala.
  // Se leen del componente y se mide la caja real de cada trazo (muestreando las curvas, no sus puntos de control).
  const mascotSrc = await readFile(path.join(process.cwd(), "components", "mascot", "chispa.tsx"), "utf8");
  const SIZE = Number(mascotSrc.match(/export const MASCOT_SIZE = (\d+);/)?.[1]);
  const faces = [...mascotSrc.matchAll(/  (\w+): \{\n    eyes: \[(.*?)\],\n    mouth: "(.*?)",\n    nose: "(.*?)",\n    rest: "(.*?)",\n  \},/gs)].map(
    ([, name, eyes, mouth, nose, rest]) => ({ name, paths: [...[...eyes.matchAll(/"(.*?)"/g)].map((m) => m[1]), mouth, rest], nose }),
  );
  const pathBox = (d) => {
    const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g) ?? [];
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const add = (px, py) => {
      box[0] = Math.min(box[0], px); box[1] = Math.min(box[1], py); box[2] = Math.max(box[2], px); box[3] = Math.max(box[3], py);
    };
    let i = 0, x = 0, y = 0, sx = 0, sy = 0, cmd = "";
    const num = () => Number(tokens[i++]);
    while (i < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[i])) {
        cmd = tokens[i++];
        if (cmd === "z" || cmd === "Z") [x, y] = [sx, sy];
        continue;
      }
      if (cmd === "M") { x = num(); y = num(); [sx, sy] = [x, y]; add(x, y); }
      else if (cmd === "l") { x += num(); y += num(); add(x, y); }
      else if (cmd === "c") {
        const [a, b, c, e, f, g] = [num(), num(), num(), num(), num(), num()];
        const P = [[x, y], [x + a, y + b], [x + c, y + e], [x + f, y + g]];
        for (let t = 0; t <= 1.0001; t += 0.02) {
          const u = 1 - t, w = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3];
          add(w.reduce((s, k, j) => s + k * P[j][0], 0), w.reduce((s, k, j) => s + k * P[j][1], 0));
        }
        [x, y] = P[3];
      } else i++;
    }
    return box;
  };
  const union = (boxes) => [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
  check(faces.length === 7 && SIZE > 0, `Chispa: las 7 expresiones (con la pensativa del 12.3) comparten un lienzo cuadrado de ${SIZE} unidades`, faces.map((f) => f.name));
  const noses = [];
  for (const face of faces) {
    const noseBox = pathBox(face.nose);
    const [x0, y0, x1, y1] = union([...face.paths.map(pathBox), noseBox]);
    const pad = [x0, SIZE - x1, y0, SIZE - y1].map((v) => (100 * v) / SIZE);
    const off = [(x0 + x1) / 2 - SIZE / 2, (y0 + y1) / 2 - SIZE / 2];
    noses.push({ name: face.name, w: noseBox[2] - noseBox[0], h: noseBox[3] - noseBox[1] });
    const fmt = (v) => v.toFixed(1).replace(".", ",");
    check(
      Math.min(...pad) >= 10 && Math.max(...off.map(Math.abs)) <= 1.5,
      `Chispa ${face.name}: aire ${pad.map(fmt).join(" / ")} % (izq/der/arr/abj) · desvío del centro ${off.map(fmt).join(", ")} u`,
      { pad, off },
    );
  }
  const spread = (key) => Math.max(...noses.map((n) => n[key])) - Math.min(...noses.map((n) => n[key]));
  check(
    spread("w") <= 3 && spread("h") <= 3,
    `Chispa: misma escala en las 6 (la nariz mide ${noses.map((n) => `${n.w.toFixed(0)}×${n.h.toFixed(0)}`).join(", ")} u)`,
    noses,
  );

  // ── Marca: la sonrisa de la carcajada, sola (header, footer, favicon, avatar) ──
  const smile = mascotSrc.match(/  carcajada: \{\n    eyes: \[.*?\],\n    mouth: "(.*?)",/s)?.[1] ?? "";
  const smileOuter = (smile.match(/M[^M]*/g) ?? []).sort((a, b) => b.length - a.length)[0] ?? "";
  const marks = [...visible.matchAll(/<svg[^>]*data-brand-mark[^>]*>([\s\S]*?)<\/svg>/g)];
  check(
    marks.length === 2 && marks.every((m) => m[1] === `<path d="${smile}"></path>` && /fill="currentColor"/.test(m[0]) && /text-ink/.test(m[0])) &&
      !/<circle cx="12" cy="13" r="9"/.test(visible),
    "La marca (header y footer) es la sonrisa de la carcajada con el mismo path, en tinta; se fue el símbolo circular",
    marks.map((m) => m[0].slice(0, 80)),
  );
  // El nombre va en un span: bajo 400 px el header lo oculta a la vista (sigue para lectores de pantalla), el footer no.
  const lockups = [...visible.matchAll(/<a[^>]*href="\/"[^>]*>(<svg[^>]*data-brand-mark[\s\S]*?<\/svg>)<span( class="([^"]*)")?>Supercreador<\/span><\/a>/g)];
  check(
    lockups.length === 2 &&
      lockups.every((m) => /h-\[30px\]/.test(m[1])) &&
      /max-\[399px\]:sr-only/.test(lockups[0][3] ?? "") &&
      !lockups[1][2],
    "Lockup: marca de 30 px + wordmark \"Supercreador\" (en el header, solo la sonrisa bajo 400 px; el footer siempre completo)",
  );
  const iconLink = landingHtml.match(/<link rel="icon" href="([^"]+)"[^>]*type="image\/svg\+xml"/);
  const iconRes = iconLink ? await fetch(new URL(iconLink[1], BASE)) : null;
  const iconSvg = iconRes ? await iconRes.text() : "";
  const iconPath = iconSvg.match(/<path[^>]*d="([^"]+)"/)?.[1] ?? "";
  const vb = (iconSvg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 0 0").split(/\s+/).map(Number);
  const [ix0, iy0, ix1, iy1] = pathBox(iconPath);
  const clear = Math.min(ix0 - vb[0], vb[0] + vb[2] - ix1, iy0 - vb[1], vb[1] + vb[3] - iy1);
  check(
    iconRes?.status === 200 && /fill="#f5f5e7"/.test(iconSvg) && /fill="#0e110b"/.test(iconSvg) && vb[2] === vb[3] &&
      iconPath.includes(smileOuter) && (iconPath.match(/M/g) ?? []).length === 6,
    "Favicon (app/icon.svg): la sonrisa en tinta sobre crema, cuadrado; curva exterior idéntica e interior simplificado a 3 líneas (4 dientes)",
  );
  check(clear >= 53, `Favicon: espacio de seguridad de al menos un diente alrededor de la sonrisa (${clear.toFixed(1)} u; diente central 54 u)`);
  const apple = landingHtml.match(/<link rel="apple-touch-icon" href="([^"]+)"/);
  const applePng = apple ? Buffer.from(await (await fetch(new URL(apple[1], BASE))).arrayBuffer()) : Buffer.alloc(0);
  check(
    applePng.length > 24 && applePng.readUInt32BE(16) === 180 && applePng.readUInt32BE(20) === 180,
    `Avatar de la marca (app/apple-icon.png): 180 × 180 px`,
  );

  const landingFontLinks = landingHtml.match(/<link[^>]+as="font"[^>]*>/g) ?? [];
  check(
    landingFontLinks.length === 3 && landingFontLinks.some((link) => /TMJ/.test(link)) && !/--font-anton|studio min-h-dvh/.test(visible),
    `La landing precarga solo sus 3 fuentes (Inter, Inter Tight del H1 y TMJ de "superpoderes": ${landingFontLinks.length}) y no el sistema del studio`,
  );

  // Contraste de los tokens del studio, leídos del CSS que se sirve.
  const cssHrefs = [...landingHtml.matchAll(/<link[^>]+href="([^"]+\.css[^"]*)"/g)].map((m) => m[1]);
  let css = "";
  for (const href of cssHrefs) css += await (await fetch(new URL(href, BASE))).text();
  const token = (name) => {
    const hex = css.match(new RegExp(`--color-${name}:\\s*#([0-9a-f]{6}|[0-9a-f]{3})\\b`, "i"))?.[1]?.toLowerCase();
    if (!hex) return undefined;
    return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`; // el CSS minificado acorta #ffffff a #fff
  };
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const pairs = [
    ["ink", "cream"], ["ink", "paper"], ["ink", "sand"], ["ink", "highlight"],
    ["muted", "cream"], ["muted", "paper"], ["muted", "sand"], ["muted", "highlight"],
    ["accent-ink", "cream"], ["accent-ink", "paper"], ["accent-ink", "highlight"],
    ["success", "cream"], ["success", "paper"], ["success", "highlight"],
    ["cream", "ink"], ["sand", "ink"],
  ];
  const measured = pairs.map(([text, on]) => ({ text, on, ratio: token(text) && token(on) ? ratio(token(text), token(on)) : 0 }));
  const low = measured.filter((pair) => pair.ratio < 7);
  check(
    low.length === 0 && token("accent") === "#fc3300",
    `Studio: los ${pairs.length} pares de texto del sistema llegan a 7:1 (mínimo ${Math.min(...measured.map((p) => p.ratio)).toFixed(2)}:1)`,
    low,
  );
  check(ratio(token("accent") ?? "#000000", token("cream") ?? "#000000") >= 3, "El acento #FC3300 se usa como gráfico y foco (≥ 3:1 sobre crema)");

  const newForm = await fetch(BASE + "/crear/manual", { headers: { cookie } });
  check(newForm.status === 200, "Con sesión, se abre el formulario manual", newForm.status);
  const editPage = await fetch(`${BASE}/editar/${slug}`, { headers: { cookie } });
  check(editPage.status === 200 && (await editPage.text()).includes(name), `Con sesión, se abre el editor → /editar/${slug}`, editPage.status);
  if (customSlug) {
    const customEditor = await (await fetch(`${BASE}/editar/${customSlug}`, { headers: { cookie } })).text();
    check(
      customEditor.includes(`/p/${customSlug}/cocina-saludable`) && customEditor.includes("Cocina saludable"),
      "El editor muestra los links de los nichos propios del portafolio",
    );
  }
  const editMissing = await fetch(`${BASE}/editar/este-link-no-existe`, { headers: { cookie } });
  check(editMissing.status === 404, "Editar un portafolio que no existe responde 404", editMissing.status);

  // ── Portadas de video: solo validaciones, no sale a YouTube ni a TikTok ──
  const coverWithoutKey = await call("POST", "/api/video-cover", { json: { url: "https://youtu.be/x" }, withKey: false });
  check(coverWithoutKey.status === 401, "Buscar portada sin clave responde 401");
  const coverInvalid = await call("POST", "/api/video-cover", { json: { url: "https://vimeo.com/123" } });
  check(coverInvalid.status === 400, `Rechaza links que no son de TikTok, Instagram o YouTube: "${coverInvalid.data?.error?.message}"`);
  const coverInstagram = await call("POST", "/api/video-cover", { json: { url: "https://www.instagram.com/reel/C9xYz/" } });
  check(coverInstagram.status === 422, `Instagram: pide subir la portada a mano: "${coverInstagram.data?.error?.message}"`);

  // ── Importar desde Instagram: solo validaciones, no llega a Apify ──
  const importWithoutKey = await call("POST", "/api/import", { json: { instagram: "valen.ugc" }, withKey: false });
  check(importWithoutKey.status === 401, "Importar sin clave responde 401");

  const postLink = await call("POST", "/api/import", { json: { instagram: "https://www.instagram.com/p/C9xYz123/" } });
  check(
    postLink.status === 400 && /publicación/.test(postLink.data?.error?.message ?? ""),
    `Rechaza el link de una publicación: "${postLink.data?.error?.message}"`,
    postLink.data,
  );

  // ── v2 · M2: paletas, plantillas, confirmación de nichos y Engagement Rate ──
  const orange = await (await import("sharp")).default({
    create: { width: 64, height: 64, channels: 3, background: "#c2410c" },
  }).png().toBuffer();
  const colorForm = new FormData();
  colorForm.append("file", new Blob([orange], { type: "image/png" }), "naranja.png");
  const colorUpload = await call("POST", "/api/media", { form: colorForm });
  const colorImage = colorUpload.data?.image;
  const swatch = colorImage?.swatch ?? "";
  const [sr, sg, sb] = [1, 3, 5].map((i) => parseInt(swatch.slice(i, i + 2), 16));
  check(
    /^#[0-9a-f]{6}$/.test(swatch) && sr > sg && sg > sb,
    `Al subir una foto se guarda su color dominante para la paleta "de su foto" (${swatch})`,
    colorUpload.data,
  );

  const pageOf = async (slug, niche = "") => {
    const res = await fetch(`${BASE}/p/${slug}${niche ? `/${niche}` : ""}`);
    return { status: res.status, html: await res.text() };
  };
  const themeColor = (html) => html.match(/<meta name="theme-color" content="([^"]+)"/)?.[1];

  const minimalCreate = await call("POST", "/api/portfolios", {
    json: {
      name: "Prueba Minimal",
      design: { template: "minimal", palette: "salvia" },
      pieces: [1, 2, 3].map((n) => ({ title: `Pieza ${n}`, image: colorImage })),
    },
  });
  const minimalSlug = minimalCreate.data?.portfolio?.slug;
  check(
    minimalCreate.status === 201 && minimalCreate.data?.portfolio?.design?.template === "minimal",
    "Crear a mano guarda la plantilla y la paleta elegidas",
    minimalCreate.data,
  );
  if (minimalSlug) {
    const { html } = await pageOf(minimalSlug);
    check(
      html.includes('data-template="minimal"') && html.includes("--pf-bg:#f5f7f2") && themeColor(html) === "#f5f7f2",
      "La página se dibuja con Minimal y la paleta Salvia (fondo y barra del navegador)",
    );
  }
  const badTemplate = await call("POST", "/api/portfolios", {
    json: { name: "X", design: { template: "revista", palette: "crema" }, pieces: [1, 2, 3].map((n) => ({ title: `P${n}`, image })) },
  });
  check(
    badTemplate.status === 400 && badTemplate.data?.error?.issues?.[0]?.path === "design.template",
    `Rechaza una plantilla que no existe: "${badTemplate.data?.error?.issues?.[0]?.message}"`,
    badTemplate.data,
  );

  if (LOCAL_DATA) {
    // Borrador como el que deja /api/import (sin pasar por Apify ni Groq).
    const aiNiches = [
      { slug: "lifestyle", label: "Lifestyle" },
      { slug: "fitness", label: "Fitness" },
      { slug: "cocina-saludable", label: "Cocina saludable" },
    ];
    const base = fixtureDoc({ slug: "borrador", version: 2, image: colorImage, niches: aiNiches, pieceNiches: ["lifestyle", "fitness", "cocina-saludable"] });
    const writeDraft = async (extra = {}) => {
      const id = randomUUID();
      const file = path.join(process.cwd(), ".data", "drafts", `${id}.json`);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(
        file,
        JSON.stringify({
          id,
          createdAt: new Date().toISOString(),
          username: `draft.fixture.${Date.now()}`,
          snapshot: base.instagram,
          generated: base.generated,
          pieces: base.pieces,
          warnings: [],
          claim: null,
          ...extra,
        }),
      );
      return id;
    };
    const confirm = (json) => call("POST", "/api/import/confirm", { json });

    // El creador corrige a la IA: "Lifestyle" → "Negocios", desmarca "Cocina saludable" y agrega "Finanzas personales".
    const draftId = await writeDraft();
    const confirmInput = {
      draftId,
      niches: [{ label: "Negocios" }, { label: "Fitness" }, { label: "Finanzas personales" }],
      pieceNiches: { "pieza-1": "negocios", "pieza-2": "finanzas-personales" },
      design: { template: "bio", palette: "auto" },
    };
    const confirmed = await confirm(confirmInput);
    const resolvedDraft = confirmed.data?.resolved;
    const draftSlug = confirmed.data?.slug;
    check(confirmed.status === 201 && draftSlug, "Generar desde la importación crea el portafolio (201)", confirmed.data);
    check(
      JSON.stringify(resolvedDraft?.niches?.map((n) => n.slug)) === JSON.stringify(["negocios", "fitness", "finanzas-personales"]),
      "Los nichos confirmados (renombrado, desmarcado y agregado) mandan sobre los de la IA",
      resolvedDraft?.niches,
    );
    check(
      JSON.stringify(resolvedDraft?.pieces?.map((p) => p.niche)) === JSON.stringify(["negocios", "finanzas-personales", null]),
      "Cada pieza queda en el nicho que eligió el creador; la del nicho desmarcado va a Todo",
      resolvedDraft?.pieces?.map((p) => p.niche),
    );
    const er = resolvedDraft?.engagementRate;
    check(
      er?.basis === "views" && er?.sample === 2 && Math.abs(er?.rate - 2180 / 20400) < 1e-9 && er?.interactions?.join() === "likes,comments",
      "El Engagement Rate es (me gusta + comentarios) ÷ vistas de los reels, con su base",
      er,
    );
    check(
      resolvedDraft?.design?.template === "bio" && resolvedDraft?.design?.palette === "auto",
      "Se guarda la plantilla y la paleta elegidas antes de generar",
    );
    const stored = await call("GET", `/api/portfolios/${draftSlug}`);
    const doc = stored.data?.portfolio;
    check(
      doc?.manual?.niches?.length === 3 && doc?.generated?.niches?.[0]?.slug === "lifestyle" && doc?.insights?.engagementRate?.rate > 0,
      "El documento guarda los nichos confirmados, conserva la sugerencia de la IA y el ER como dato",
      doc && { manual: doc.manual.niches, generated: doc.generated?.niches, insights: doc.insights },
    );

    const again = await confirm(confirmInput);
    check(again.status === 200 && again.data?.slug === draftSlug, "Confirmar dos veces devuelve el mismo portafolio (no duplica)", again.data);

    const bioPage = await pageOf(draftSlug);
    check(
      bioPage.html.includes('data-template="bio"') && filterNiches(bioPage.html).join() === "negocios,finanzas-personales",
      "La página usa Bio y sus nichos salen de los confirmados (los que tienen piezas)",
      filterNiches(bioPage.html),
    );
    const bioViews = panelsOf(bioPage.html);
    // Spec 11.15: en Bio la portada propia se ve completa (contain) con un relleno desenfocado: sin recorte.
    const bioCss = await cssOf(bioPage.html);
    check(
      /\.bio-mesh--photo \.bio-mesh__photo\s*\{\s*object-fit:\s*contain/.test(bioCss) && /\.bio-mesh--photo \.bio-mesh__fill\s*\{[^}]*object-fit:\s*cover/.test(bioCss),
      "Bio: la foto de portada se ve completa (sin recorte), con un relleno desenfocado",
    );
    check(
      /10,7\s%/.test(bioViews.kit) && bioViews.kit.includes("Engagement Rate") && bioViews.kit.includes("(me gusta + comentarios) ÷ vistas · 2 reels") &&
        !bioViews.about.includes("Engagement Rate"),
      "El ER (10,7 %) vive en el MEDIA KIT, con su base etiquetada, y no en Contenido",
    );
    const kitMetrics = [...bioViews.kit.matchAll(/data-metric="([a-zA-Z]+)"/g)].map((m) => m[1]);
    check(
      JSON.stringify(kitMetrics) === JSON.stringify(["followers", "avgInteractions", "engagementRate"]) &&
        /48,2\s?mil/.test(bioViews.kit) && bioViews.kit.includes("Interacciones promedio"),
      "Media Kit: Seguidores (48,2 mil), Interacciones promedio y ER, en ese orden",
      kitMetrics,
    );
    check(
      /data-media-kit/.test(bioViews.kit) && bioViews.kit.includes("Plataformas") && bioViews.kit.includes("Piezas destacadas") &&
        bioViews.kit.includes("Sobre mí") && /data-mk-contact[^>]*>Trabaja conmigo|Trabaja conmigo/.test(bioViews.kit),
      "Media Kit: cabecera, plataformas, piezas destacadas, Sobre mí y «Trabaja conmigo»",
    );
    const autoBg = bioPage.html.match(/--pf-bg:(#[0-9a-f]{6})/)?.[1];
    check(
      autoBg && autoBg !== "#faf7f2" && themeColor(bioPage.html) === autoBg,
      `La paleta "de su foto" sale del color de la foto y pinta también la barra del navegador (${autoBg})`,
    );
    const deep = await pageOf(draftSlug, "finanzas-personales");
    check(
      deep.status === 200 && activeNiche(deep.html) === "finanzas-personales",
      "El nicho agregado por el creador tiene su propio link",
    );
    const dropped = await pageOf(draftSlug, "cocina-saludable");
    check(dropped.status === 404, "El nicho que el creador desmarcó no tiene página (404)", dropped.status);

    // Cambiar el diseño después no pierde datos.
    const before = await call("GET", `/api/portfolios/${draftSlug}`);
    const redesign = await call("PATCH", `/api/portfolios/${draftSlug}`, {
      json: { revision: before.data.portfolio.revision, design: { template: "editorial", palette: "grafito" } },
    });
    const after = redesign.data?.portfolio;
    const keep = (d) => JSON.stringify({ m: d?.manual, p: d?.pieces, g: d?.generated, i: d?.instagram, s: d?.insights });
    check(
      redesign.status === 200 && after?.design?.template === "editorial" && keep(after) === keep(before.data.portfolio),
      "Cambiar plantilla y paleta no toca ningún otro dato",
      redesign.data,
    );
    const edPage = await pageOf(draftSlug);
    check(
      edPage.html.includes('data-template="editorial"') && themeColor(edPage.html) === "#0e0e0e" && /10,7\s%/.test(edPage.html),
      "Editorial se ve oscura (barra del navegador incluida) y mantiene el ER",
    );
    const badDesign = await call("PATCH", `/api/portfolios/${draftSlug}`, {
      json: { revision: after?.revision, design: { template: "editorial", palette: "neon" } },
    });
    check(badDesign.status === 400, `Rechaza una paleta que no existe: "${badDesign.data?.error?.issues?.[0]?.message}"`);
    const editorHtml = await (await fetch(`${BASE}/editar/${draftSlug}`, { headers: { cookie } })).text();
    check(editorHtml.includes('data-testid="editor-design"') && editorHtml.includes('data-template-option="bio"'), "El editor ofrece cambiar plantilla y paleta");

    // Errores al confirmar.
    const strayId = await writeDraft();
    const stray = await confirm({ ...confirmInput, draftId: strayId, pieceNiches: { "pieza-1": "moda" } });
    check(
      stray.status === 400 && stray.data?.error?.issues?.[0]?.path === "pieceNiches.pieza-1",
      `Una pieza no puede apuntar a un nicho que no se confirmó: "${stray.data?.error?.issues?.[0]?.message}"`,
      stray.data,
    );
    const tooMany = await confirm({ ...confirmInput, draftId: strayId, niches: ["A", "B", "C", "D"].map((label) => ({ label })) });
    check(tooMany.status === 400, `No acepta más de 3 nichos: "${tooMany.data?.error?.issues?.[0]?.message}"`);
    const reserved = await confirm({ ...confirmInput, draftId: strayId, niches: [{ label: "Todo" }], pieceNiches: {} });
    check(
      reserved.status === 400 && reserved.data?.error?.issues?.[0]?.path === "niches.0.label",
      `Un nicho no puede llamarse "Todo": "${reserved.data?.error?.issues?.[0]?.message}"`,
    );
    const noDraft = await confirm({ ...confirmInput, draftId: randomUUID() });
    check(noDraft.status === 404, `Un borrador que no existe responde 404: "${noDraft.data?.error?.message}"`);
    const oldId = await writeDraft({ createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() });
    const old = await confirm({ ...confirmInput, draftId: oldId });
    check(old.status === 410, `Un borrador de hace más de 24 h pide volver a importar (410): "${old.data?.error?.message}"`);
    const noKey = await call("POST", "/api/import/confirm", { json: confirmInput, withKey: false });
    check(noKey.status === 401, "Generar sin clave responde 401");

    // ── Ronda 30/09 · 7.1: chips. Piezas elegidas en orden, incluida una "De tu perfil" que la IA no eligió ──
    const { createHash } = await import("node:crypto");
    const chipsId = await writeDraft();
    const profileId = `ig-${createHash("sha256").update(`${chipsId}:post-4`).digest("hex").slice(0, 24)}`;
    const pending = await call("GET", `/api/import/status?draftId=${chipsId}`);
    check(pending.status === 200 && pending.data?.state === "pending", "Estado consultable: un borrador sin confirmar está «pending»", pending.data);
    const tooFew = await confirm({ draftId: chipsId, niches: [{ label: "Fitness" }], selection: [{ id: "pieza-1", niche: null }], design: confirmInput.design });
    check(tooFew.status === 400 && tooFew.data?.error?.issues?.[0]?.path === "selection", `Chips: pide al menos 3 piezas: "${tooFew.data?.error?.issues?.[0]?.message}"`);
    const noServices = await confirm({
      draftId: chipsId,
      niches: [{ label: "Fitness" }],
      selection: [{ id: "pieza-1", niche: null }, { id: "pieza-2", niche: null }, { id: "pieza-3", niche: null }],
      design: confirmInput.design,
    });
    check(
      noServices.status === 400 && noServices.data?.error?.issues?.[0]?.path === "services",
      `11.12: el paso de Servicios es obligatorio antes de generar: "${noServices.data?.error?.issues?.[0]?.message}"`,
    );
    // 13.4: agregar por link acepta solo TikTok; Instagram queda oculto, con un mensaje amable y sin jerga técnica.
    const badLink = await call("POST", "/api/import/link", { json: { draftId: chipsId, url: "https://example.com/algo" } });
    const igLink = await call("POST", "/api/import/link", { json: { draftId: chipsId, url: "https://www.instagram.com/p/C1abc/" } });
    const jargon = /\b(token|oembed|api)\b|\bMeta\b/i;
    check(
      badLink.status === 400 && badLink.data?.error?.message === "Por ahora puedes agregar por link solo videos de TikTok." &&
        igLink.status === 400 && igLink.data?.error?.message === "Los links de Instagram estarán disponibles pronto." &&
        ![badLink, igLink].some((r) => jargon.test(r.data?.error?.message ?? "")),
      "13.4: «Agregar por link» acepta solo TikTok; un link de Instagram responde «Los links de Instagram estarán disponibles pronto.» (sin jerga)",
      { badLink: badLink.data, igLink: igLink.data },
    );
    const chips = await confirm({
      draftId: chipsId,
      niches: [{ label: "Fitness" }, { label: "Viajes" }],
      selection: [
        { id: profileId, niche: "viajes" },
        { id: "pieza-3", niche: "fitness" },
        { id: "pieza-1", niche: null },
      ],
      design: { template: "creator", palette: "crema" },
      services: [{ title: "Videos UGC para anuncios", description: "supercreador.tech/tarifas" }],
    });
    const chipPieces = chips.data?.resolved?.pieces ?? [];
    check(
      chips.status === 201 &&
        JSON.stringify(chipPieces.map((piece) => piece.sourcePostId)) === JSON.stringify(["post-4", "post-3", "post-1"]) &&
        chipPieces[0]?.title === "Publicación 4" &&
        JSON.stringify(chipPieces.map((piece) => piece.niche)) === JSON.stringify(["viajes", "fitness", null]),
      "Chips: las piezas quedan en el orden elegido, con su nicho, incluida una «De tu perfil»",
      chipPieces.map((piece) => [piece.sourcePostId, piece.niche]),
    );
    check(
      JSON.stringify(chips.data?.resolved?.services?.map((service) => service.title)) === JSON.stringify(["Videos UGC para anuncios"]),
      "Servicios: solo las tarjetas del creador (nada de las que propuso la IA)",
      chips.data?.resolved?.services,
    );
    const done = await call("GET", `/api/import/status?draftId=${chipsId}`);
    check(done.data?.state === "done" && done.data?.slug === chips.data?.slug, "Estado consultable: el borrador confirmado queda «done» con su link", done.data);

    // ── 7.4: el 409 ya no es eterno ──
    const busyId = await writeDraft({ claim: { at: new Date().toISOString(), slug: null } });
    const busy = await confirm({ ...confirmInput, draftId: busyId });
    const retryAtMs = Date.parse(busy.data?.error?.retryAt ?? "");
    check(
      busy.status === 409 && retryAtMs > Date.now() && retryAtMs - Date.now() <= 76_000,
      `409 solo mientras otra petición genera, con un retryAt acotado (≤ 75 s): ${busy.data?.error?.retryAt}`,
      busy.data,
    );
    const generating = await call("GET", `/api/import/status?draftId=${busyId}`);
    check(generating.data?.state === "generating", "Estado consultable: «generating» mientras dura el candado", generating.data);
    // Un candado que quedó colgado (la ejecución murió) y una generación que lanza una excepción: estado FALLIDO.
    const stuckId = await writeDraft({
      claim: { at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), slug: null },
      pieces: base.pieces.slice(0, 2), // el portafolio necesita 3 piezas: createPortfolio falla
    });
    const stuckInput = { draftId: stuckId, niches: confirmInput.niches, pieceNiches: {}, design: confirmInput.design };
    const firstFail = await confirm(stuckInput);
    check(
      firstFail.status === 500 && firstFail.data?.error?.code === "generation_failed" && firstFail.data?.error?.message,
      `Si la generación lanza una excepción: error terminal, no 409 → "${firstFail.data?.error?.message}"`,
      firstFail.data,
    );
    const failedStatus = await call("GET", `/api/import/status?draftId=${stuckId}`);
    check(
      failedStatus.data?.state === "failed" && failedStatus.data?.failure?.code === "create_failed" && failedStatus.data?.failure?.at,
      "Estado consultable: el borrador queda «failed» con su causa y hora",
      failedStatus.data,
    );
    const againFail = await confirm(stuckInput);
    check(
      againFail.status === 500 && againFail.data?.error?.code === "generation_failed",
      "Reintentar sin pedirlo no vuelve al 409: sigue siendo el error terminal",
      againFail.data,
    );
    const explicitRetry = await confirm({ ...stuckInput, retry: true });
    check(
      explicitRetry.status === 500 && explicitRetry.data?.error?.code === "generation_failed" && Date.parse(explicitRetry.data?.error?.failedAt) > Date.parse(failedStatus.data?.failure?.at),
      "«Inténtalo de nuevo» (retry) hace otro intento real y, si vuelve a fallar, registra el nuevo fallo",
      explicitRetry.data,
    );
    // El cliente: con un 409 eterno, la misma política de components/import-review.tsx corta con un error < 60 s.
    const policy = await import(new URL("../lib/import/confirm-retry.ts", import.meta.url));
    let clock = 0;
    let attempt = 0;
    const requestMs = 1_500; // cada respuesta 409 tarda esto
    for (;;) {
      clock += requestMs;
      const delay = policy.nextConfirmRetry(attempt, 0, clock, Date.now() + 10 * 60 * 1000);
      if (delay === null) break;
      clock += delay;
      attempt += 1;
    }
    check(
      clock < 60_000 && attempt <= policy.CONFIRM_RETRY_DELAYS_MS.length && policy.CONFIRM_DEADLINE_MS < 60_000,
      `Cliente ante un 409 eterno: ${attempt} reintentos y error terminal a los ${(clock / 1000).toFixed(1)} s (< 60 s)`,
    );
    check(
      policy.confirmRequestTimeout(0, policy.CONFIRM_DEADLINE_MS) === 0 && policy.confirmRequestTimeout(0, 0) <= policy.CONFIRM_DEADLINE_MS,
      "Cliente: ninguna petición colgada pasa el plazo global (se corta)",
    );

    // ── Spec 10.1: round-trip de escritura condicional en el almacenamiento del servidor (disco en CI; Blob si BASE
    //    apunta a un deployment): leer → escribir con el etag leído → leer → el etag viejo se rechaza. ──
    const roundtrip = await call("GET", "/api/import/health?roundtrip=1");
    const rt = roundtrip.data?.checks?.roundtrip;
    check(
      roundtrip.status === 200 && rt?.ok === true && rt.steps.read && rt.steps.conditionalWrite && rt.steps.readBack && rt.steps.staleRejected,
      `Almacenamiento (${rt?.driver}): leer → escritura condicional → leer funciona y un etag viejo se rechaza`,
      roundtrip.data?.checks,
    );
    if (roundtrip.data?.checks?.blobEtags) {
      const blobEtags = roundtrip.data.checks.blobEtags;
      check(blobEtags.writeWithHeadEtag === "ok" && blobEtags.staleWriteRejected, "Blob: ifMatch con el etag canónico (head) funciona", blobEtags);
    }

    // ── Spec 10.2 · ronda 6 13.3: en la grilla TODA pieza abre un visor (la misma regla que usa la grilla). ──
    const { viewerFor } = await import(new URL("../lib/import/piece-viewer.ts", import.meta.url));
    const { embedFor: embedOf } = await import(new URL("../lib/portfolio/embed.ts", import.meta.url));
    const hasEmbed = (video) => embedOf(video) !== null;
    const img = { url: "/media/x.webp" };
    const viewers = [
      viewerFor({ video: { platform: "instagram", url: "https://www.instagram.com/reel/C1abc/" }, image: img }, hasEmbed),
      viewerFor({ video: null, image: img }, hasEmbed),
      viewerFor({ video: { platform: "instagram", url: "https://www.instagram.com/prueba/" }, image: img }, hasEmbed),
      viewerFor({ video: null, image: img, kind: "carousel", postUrl: "https://www.instagram.com/p/C1abc/" }, hasEmbed),
    ];
    check(
      JSON.stringify(viewers) === JSON.stringify(["reel", "image", "image", "carousel"]),
      "«Tus últimos 12 contenidos»: toda pieza abre visor (reel y carrusel en el overlay; foto o video sin embed → visor de imagen)",
      viewers,
    );
  } else {
    console.log("· (se omiten las pruebas del borrador de importación: no es almacenamiento local)");
  }

  // ── Ronda 6 · pieza 1: 13.4, 13.5, 13.21 y 13.22, revisados en el código (sin navegador) ──
  const source = (...parts) => readFile(path.join(process.cwd(), ...parts), "utf8");
  const pickersSrc = await source("components", "import", "confirm-pickers.tsx");
  const linkSourcesSrc = await source("lib", "import", "link-sources.ts");
  const linkSection = pickersSrc.slice(pickersSrc.indexOf("data-add-by-link-section"), pickersSrc.indexOf("data-profile-grid"));
  check(
    linkSection.includes("Tus últimos 12 contenidos") &&
      /¿No ves el que buscas\? Pégalo por link <span aria-hidden="true">↓<\/span>/.test(linkSection) &&
      /<form[^>]*\bdata-add-by-link>/.test(linkSection) && /TikTok/.test(linkSection) &&
      !/\b(instagram|token|oembed|api)\b|\bMeta\b/i.test(linkSection) &&
      linkSourcesSrc.includes('"Los links de Instagram estarán disponibles pronto."') &&
      /export const INSTAGRAM_LINKS_ENABLED: boolean = false;/.test(linkSourcesSrc),
    "13.4: «Tus últimos 12 contenidos» / «¿No ves el que buscas? Pégalo por link ↓», solo TikTok y sin jerga ni Instagram en la sección",
  );
  const previewSrc = await source("components", "design", "template-preview.tsx");
  const reviewSrc = await source("components", "import-review.tsx");
  const modalSrc = reviewSrc.slice(reviewSrc.indexOf("function PreviewModal"));
  check(
    previewSrc.includes('["about", "Contenido"]') && previewSrc.includes('["kit", "Media kit"]') && !previewSrc.includes('["about", "Sobre mí"]') &&
      /useEffect\(\(\) => \{[^}]*showModal\(\);?\s*\}, \[\]\);/.test(modalSrc) &&
      /onClose=\{props\.onClose\}/.test(modalSrc) && !/addEventListener\("close"/.test(modalSrc),
    "13.5: el switch dice «Contenido | Media kit» y cambiar de vista no cierra el modal (se abre una vez; cierra con Cerrar, Escape o tap fuera)",
  );
  const groqSrc = await source("lib", "ai", "groq.ts");
  check(
    /const TEMPERATURE = 0;/.test(groqSrc) && /temperature: TEMPERATURE\b/.test(groqSrc) && /const SEED = \d+;/.test(groqSrc) && /seed: SEED\b/.test(groqSrc),
    "13.21: los nichos de la IA son deterministas (temperatura 0 y semilla fija); la creadora los confirma antes de generar",
  );
  const chipsCss = await source("components", "chips", "chips.css");
  const chipListSrc = await source("components", "chips", "chip-list.tsx");
  const chipRule = chipsCss.match(/(^|\n)\.chip \{[^}]*\}/)?.[0] ?? "";
  check(
    chipRule.length > 0 && !/touch-action/.test(chipRule) && /\.chip__handle \{[^}]*touch-action: none/.test(chipsCss) && /scrollBy\(/.test(chipListSrc),
    "13.22: la lista de piezas deja hacer scroll (solo el asa toma el gesto) y al arrastrar cerca del borde la página se desplaza",
  );

  // ── Ronda 6 · pieza 2: 13.2 y 13.3 (overlay y carruseles), revisados en el código ──
  const reelSrc = await source("components", "reel", "inline-reel.tsx");
  const reelCss = await source("components", "reel", "inline-reel.css");
  const kitSrc = await source("components", "portfolio", "template-kit.tsx");
  check(
    /mode = "overlay"/.test(reelSrc) && /showModal\(\)/.test(reelSrc) && /onClose=\{onClose\}/.test(reelSrc) &&
      /event\.target === event\.currentTarget/.test(reelSrc) && !/allow="[^"]*autoplay/.test(reelSrc) &&
      /IFRAME_ALLOW = "encrypted-media; picture-in-picture; fullscreen"/.test(reelSrc) &&
      /\.reel-overlay\s*\{[^}]*background:\s*rgb\(0 0 0 \/ 0\.92\)/.test(reelCss) &&
      /\.reel-overlay\[open\]\s*\{[^}]*place-items:\s*center/.test(reelCss),
    "13.2: overlay negro al 92 %, centrado y sin autoplay; se cierra con la ×, tap fuera o Escape (diálogo modal)",
  );
  check(
    /CAROUSEL_LOAD_TIMEOUT_MS/.test(reelSrc) && /Ver carrusel en Instagram/.test(reelSrc) && /data-carousel-fallback/.test(reelSrc) &&
      /carouselEmbedFor/.test(kitSrc) && /carousel=\{\{ cover:/.test(kitSrc),
    "13.3: carrusel en cadena (/p/ → /reel/) y, si no carga, la portada + «Ver carrusel en Instagram»; también en el portafolio público",
  );

  // ── Ronda 6 · pieza 3: 13.6 (servicios sugeridos) y 13.7 (tarjeta con QR) ──
  const { captionMentions } = await import(new URL("../lib/portfolio/mentions.ts", import.meta.url));
  const mentions = captionMentions(
    ["Mi rutina con @CeraVe y @la.roche.posay 💧", "Gracias @cerave. Escríbeme a hola@correo.com", "Yo soy @valen.ugc y uso @Nivea_Peru."],
    ["valen.ugc"],
  );
  check(
    JSON.stringify(mentions) === JSON.stringify(["cerave", "la.roche.posay", "nivea_peru"]),
    "13.6: las @marcas de los captions se detectan (sin la propia cuenta ni correos), las más mencionadas primero",
    mentions,
  );
  const servicesSrc = await source("components", "import", "services-step.tsx");
  const draftSrc = await source("lib", "import", "draft.ts");
  check(
    /suggested\?: boolean/.test(servicesSrc) && /Usar todas/.test(servicesSrc) && /card\.suggested/.test(servicesSrc) &&
      /SERVICES_MAX = 4;/.test(servicesSrc) && /suggestedServices:/.test(draftSrc) && /captionMentions\(/.test(draftSrc) &&
      /marcas_mencionadas/.test(groqSrc) && /pendingSuggestions\(services\)/.test(reviewSrc) && /!card\.suggested && card\.title\.trim\(\)/.test(reviewSrc),
    "13.6: Servicios llega con sugerencias de la IA (captions + marcas mencionadas), editables y eliminables; solo se envía lo que la creadora confirma",
  );
  const qrLib = await import(new URL("../lib/share/qr.ts", import.meta.url));
  check(
    qrLib.qrTargetUrl("https://ejemplo.com/p/valen") === "https://ejemplo.com/p/valen?ref=qr" &&
      qrLib.qrTargetUrl("https://ejemplo.com/p/valen?ref=whatsapp") === "https://ejemplo.com/p/valen?ref=qr" &&
      qrLib.displayUrl("https://ejemplo.com/p/valen/") === "ejemplo.com/p/valen" &&
      qrLib.qrFileName("Valen UGC") === "tarjeta-qr-valen-ugc.png",
    "13.7: el QR lleva el link del portafolio con ?ref=qr; la tarjeta muestra el link limpio y se descarga como tarjeta-qr-<slug>.png",
  );
  const qrCardSrc = await source("components", "share", "qr-card.tsx");
  const readySrc = await source("components", "ready-dialog.tsx");
  check(
    /canvas\.toBlob\(/.test(qrCardSrc) && /URL\.createObjectURL\(/.test(qrCardSrc) && /link\.download = fileName/.test(qrCardSrc) &&
      /document\.body\.appendChild\(link\)/.test(qrCardSrc) && /qrTargetUrl\(/.test(qrCardSrc) && /drawImage\(photo/.test(qrCardSrc) &&
      /Descargar PNG/.test(qrCardSrc) && /<QrCard/.test(readySrc) && !/download=\{`qr-/.test(readySrc),
    "13.7: tarjeta con foto + nombre + QR (con ?ref=qr) + link, y «Descargar PNG» descarga de verdad (blob + enlace temporal en el documento)",
  );
} catch (error) {
  failures += 1;
  console.error(`✘ Error inesperado: ${error.message}`);
  console.error(`   ¿Está corriendo "npm run dev" en ${BASE}?`);
}

console.log(failures === 0 ? "\nTodo en orden." : `\n${failures} prueba(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
