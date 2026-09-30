// Prueba de humo de la API, el acceso, el studio, la landing y la página pública (v2 · M4-rev r2). No gasta saldo: nunca llega a Apify ni a Groq.
// Úsala en tu compu, no contra producción (crea datos de prueba en .data/).
// 1) npm run dev   2) en otra terminal: npm run smoke

import { randomUUID } from "node:crypto";
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

  // ── Página pública (sin clave): plantilla Creator ──
  const publicPage = await fetch(`${BASE}/p/${slug}`);
  const html = await publicPage.text();
  const text = html.replace(/<!-- -->/g, "");
  check(publicPage.status === 200 && html.includes(name), `La página pública abre sin clave → /p/${slug}`, publicPage.status);
  check(/<meta name="robots" content="noindex, nofollow"/.test(html), "La página pública no aparece en buscadores (noindex)");
  check(html.includes('<meta name="theme-color" content="#faf7f2"'), "La barra del navegador toma el crema de la página (theme-color)");
  check(html.includes('data-template="creator"') && html.includes('data-pf-filter="todo"'), 'Se dibuja con la plantilla Creator, en "Todo"');
  check(text.includes(`Hola, soy ${name}.`), "El titular presenta a la creadora");
  check(html.includes("Videos que venden sin parecer anuncio."), "Muestra al instante el cambio recién guardado (el caché se invalida)");
  check(html.includes("https://www.tiktok.com/@prueba/video/"), "La pieza de video lleva a su original");
  check(html.includes("Formas de colaborar") && html.includes("Videos UGC para anuncios"), "Muestra los servicios");
  check(html.includes('href="mailto:hola@prueba.pe"') && html.includes("Hablemos"), 'Cierra con "Hablemos" y el correo a la vista');
  check(!/sugerid[oa]s por la IA/i.test(html), "Sin textos sobre la herramienta ni la IA en la página");
  const fontPreloads = (html.match(/<link[^>]*as="font"[^>]*>/g) ?? []).length;
  check(fontPreloads === 1, `La página pública precarga una sola fuente (DM Sans): ${fontPreloads}`);

  const general = pills(html);
  check(
    general.map((pill) => pill.href).join() === [`/p/${slug}`, ...["belleza", "lifestyle", "viajes"].map((n) => `/p/${slug}/${n}`)].join(),
    "Las píldoras son links reales: Todo y un link por nicho",
    general,
  );
  check(general[0]?.current && general.filter((pill) => pill.current).length === 1, 'En la versión general, "Todo" es la píldora activa', general);
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
  check(pills(viajesHtml).find((pill) => pill.current)?.href === `/p/${slug}/viajes`, "En /viajes, la píldora Viajes es la activa");
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
    lifestyle.status === 200 && lifestyleHtml.includes('data-pf-filter="todo"') && !pills(lifestyleHtml).some((pill) => pill.href.endsWith("/lifestyle")),
    "Un nicho sin piezas conserva su link (muestra todo) y deja de aparecer en las píldoras",
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
    check(
      /48,2\smil/.test(v1Html) && v1Html.includes("Seguidores en Instagram") && /10,2\smil/.test(v1Html),
      "Muestra las cifras reales de Instagram (seguidores y vistas promedio)",
    );
    check(/12,4\smil vistas/.test(v1Html), "Cada pieza importada muestra sus vistas");
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
    const customPills = pills(customHtml);
    check(
      custom.status === 200 && customPills.map((pill) => pill.label).join() === "Todo,Fitness,Cocina saludable",
      "Nichos propios detectados por la IA: sus píldoras y sus links (/cocina-saludable)",
      customPills,
    );
    check(customPills.find((pill) => pill.current)?.label === "Cocina saludable", "El link del nicho propio abre con su píldora activa");
    const customBelleza = await fetch(`${BASE}/p/${customSlug}/belleza`);
    check(customBelleza.status === 404, "Con nichos propios, los de la v1 no existen (/belleza → 404)");
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
  // El glyph de Instagram (B4) se lee como la palabra, igual que para un lector de pantalla (aria-label).
  const textOf = (html) =>
    html
      .replace(/<svg[^>]*aria-label="Instagram"[\s\S]*?<\/svg>/g, "Instagram")
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
    /<header class="fixed/.test(landingHtml) && ["#como-funciona", "#piloto"].every((href) => landingHtml.includes(`href="${href}"`)),
    "Navegación fija con Cómo funciona y Piloto",
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
  check(
    /\btext-center\b/.test(heroCopy?.[1] ?? "") && /\bmd:text-left\b/.test(heroCopy?.[1] ?? ""),
    "Hero: el stack de texto va centrado en el celular y a la izquierda desde tablet",
  );
  const heroSubHtml = landingHtml.match(/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
  check(
    /<svg[^>]*role="img"[^>]*aria-label="Instagram"/.test(heroSubHtml) && !/Instagram/.test(heroSubHtml.replace(/<svg[\s\S]*?<\/svg>/g, "")),
    "Instagram va como glyph (la cámara, con aria-label) en vez de la palabra",
  );
  const electric = visible.match(/<span[^>]*data-electric[^>]*>superpoderes([\s\S]*?)<\/span>/)?.[1] ?? "";
  const bolts = [...electric.matchAll(/<svg[^>]*class="electric-bolt [^"]*"[^>]*>/g)].map((m) => m[0]);
  check(
    bolts.length === 4 &&
      bolts.every((bolt) => /aria-hidden="true"/.test(bolt)) &&
      (electric.match(/pathLength="1"/g) ?? []).length === 4 &&
      /whitespace-nowrap/.test(visible.match(/<span[^>]*data-electric[^>]*>/)?.[0] ?? ""),
    "\"superpoderes\" tiene sus 4 rayos dentados (decorativos, dibujables con dashoffset, sin partir la palabra)",
  );
  check(
    !/data-brush-underline/.test(visible) && (visible.match(/data-electric/g) ?? []).length === 1 && /web profesional, listo/.test(visible),
    "\"profesional\" va sin efectos y ya no hay subrayados de pincel",
  );
  const hero = landingHtml.slice(landingHtml.indexOf("<h1"), landingHtml.indexOf("data-hero-mascot"));
  check(
    (hero.match(/rounded-full bg-ink/g) ?? []).length === 1 && hero.includes("Ver cómo funciona") && /href="#piloto"/.test(hero),
    "Hero: un solo botón sólido (lleva a la captura del piloto) y \"Ver cómo funciona ›\" como link",
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
  for (const href of cssLinks) landingCss += await (await fetch(new URL(href, BASE))).text();
  const mascotCss = [
    ...(landingCss.replace(/@(keyframes|media)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "").match(/[^{}]*\.mascot[^{}]*\{[^{}]*\}/g) ?? []),
    ...(landingCss.match(/@(?:keyframes|media)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []).filter((block) => block.includes("mascot")),
  ].join("");
  // Solo las caras (data-mascot="…"), no el logo del footer (data-mascot-target).
  const mascotSvgs = [...visible.matchAll(/<svg[^>]*\sdata-mascot="[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  const mascotBytes = mascotSvgs.reduce((sum, svg) => sum + Buffer.byteLength(svg), 0) + Buffer.byteLength(mascotCss);
  check(
    mascotSvgs.length === 6 && mascotBytes < 10_000,
    `Chispa pesa ${(mascotBytes / 1024).toFixed(1)} KB en la página: ${mascotSvgs.length} caras (hero + 5 de la viajera) y su CSS (< 10 KB)`,
  );
  check(
    /prefers-reduced-motion:\s*reduce\)\s*\{\s*\.mascot-traveler\s*\{\s*display:\s*none/.test(landingCss.replace(/\s+/g, " ")) &&
      /prefers-reduced-motion:\s*no-preference/.test(mascotCss) && /electric-discharge/.test(landingCss) && /mock-carousel/.test(landingCss),
    "Con \"reducir movimiento\" todo queda quieto: sin viajera, sin parpadeo, rayos y carrusel sin animar",
  );
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
      /<header class="fixed/.test(accessHtml) &&
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
  check(faces.length === 6 && SIZE > 0, `Chispa: las 6 expresiones comparten un lienzo cuadrado de ${SIZE} unidades`, faces.map((f) => f.name));
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
  const lockup = visible.match(/<a[^>]*href="\/"[^>]*>(<svg[^>]*data-brand-mark[\s\S]*?<\/svg>)Supercreador<\/a>/);
  check(Boolean(lockup) && /h-\[30px\]/.test(lockup?.[1] ?? ""), "Lockup del header: marca de 30 px de alto + wordmark \"Supercreador\"");
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

  const landingFonts = (landingHtml.match(/<link[^>]+as="font"/g) ?? []).length;
  check(landingFonts === 1 && !/--font-anton|studio min-h-dvh/.test(visible), `La landing carga una sola fuente (${landingFonts}) y no el sistema del studio`);

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
    const bioPills = pills(bioPage.html);
    check(
      bioPage.html.includes('data-template="bio"') &&
        JSON.stringify(bioPills.map((p) => p.label)) === JSON.stringify(["Todo", "Negocios", "Finanzas personales"]),
      "La página usa Bio y las píldoras salen de los nichos confirmados (los que tienen piezas)",
      bioPills,
    );
    check(
      /10,7\s%/.test(bioPage.html) && bioPage.html.includes("Engagement Rate") && bioPage.html.includes("(me gusta + comentarios) ÷ vistas · 2 reels"),
      "La página muestra el ER (10,7 %) con la base del cálculo etiquetada",
    );
    const autoBg = bioPage.html.match(/--pf-bg:(#[0-9a-f]{6})/)?.[1];
    check(
      autoBg && autoBg !== "#faf7f2" && themeColor(bioPage.html) === autoBg,
      `La paleta "de su foto" sale del color de la foto y pinta también la barra del navegador (${autoBg})`,
    );
    const deep = await pageOf(draftSlug, "finanzas-personales");
    check(
      deep.status === 200 && pills(deep.html).find((p) => p.current)?.label === "Finanzas personales",
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
  } else {
    console.log("· (se omiten las pruebas del borrador de importación: no es almacenamiento local)");
  }
} catch (error) {
  failures += 1;
  console.error(`✘ Error inesperado: ${error.message}`);
  console.error(`   ¿Está corriendo "npm run dev" en ${BASE}?`);
}

console.log(failures === 0 ? "\nTodo en orden." : `\n${failures} prueba(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
