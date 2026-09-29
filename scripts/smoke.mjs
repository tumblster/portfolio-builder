// Prueba de humo de la API, el acceso, el editor y la página pública (v2 · M1). No gasta saldo: nunca llega a Apify ni a Groq.
// Úsala en tu compu, no contra producción (crea datos de prueba en .data/).
// 1) npm run dev   2) en otra terminal: npm run smoke

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
  check(missingPage.status === 404 && missingHtml.includes("no encontramos este portafolio"), "Un link inexistente responde 404 en español");

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

  const withoutSession = await fetch(BASE + "/", { redirect: "manual" });
  check(
    withoutSession.status >= 300 && withoutSession.status < 400 && (withoutSession.headers.get("location") ?? "").includes("/acceso"),
    "Sin sesión, la pantalla de creación lleva a /acceso",
    withoutSession.status,
  );
  const withSession = await fetch(BASE + "/", { headers: { cookie }, redirect: "manual" });
  check(withSession.status === 200, "Con sesión, se abre la pantalla de creación", withSession.status);

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
} catch (error) {
  failures += 1;
  console.error(`✘ Error inesperado: ${error.message}`);
  console.error(`   ¿Está corriendo "npm run dev" en ${BASE}?`);
}

console.log(failures === 0 ? "\nTodo en orden." : `\n${failures} prueba(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
