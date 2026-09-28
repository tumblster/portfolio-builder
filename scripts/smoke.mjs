// Prueba de humo de la API, el acceso, el editor y la página pública. No gasta saldo: nunca llega a Apify ni a Groq.
// Úsala en tu compu, no contra producción (crea datos de prueba en .data/).
// 1) npm run dev   2) en otra terminal: npm run smoke

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
    contact: { instagram: "@prueba.ugc", whatsapp: "+51 987 654 321" },
    pieces: [
      { title: "Rutina de noche", niche: "belleza", image },
      { title: "Un día conmigo", niche: "lifestyle", image },
      { title: "Reel en Cusco", niche: "viajes", videoUrl: "https://www.tiktok.com/@prueba/video/7400000000000000000" },
    ],
  };

  const created = await call("POST", "/api/portfolios", { json: draft });
  const slug = created.data?.portfolio?.slug;
  check(created.status === 201 && Boolean(slug), `Crea el portafolio → ${created.data?.url}`, created.data);

  const twin = await call("POST", "/api/portfolios", { json: draft });
  check(twin.data?.portfolio?.slug === `${slug}-2`, `Con el mismo nombre el link no choca → /p/${twin.data?.portfolio?.slug}`);

  const read = await call("GET", `/api/portfolios/${slug}`);
  check(read.status === 200 && read.data?.resolved?.name === name, "Lee el portafolio guardado", read.data);
  check(read.data?.resolved?.contact?.instagram === "prueba.ugc", "Guarda el usuario de Instagram sin @");
  check(read.data?.resolved?.contact?.whatsapp === "+51987654321", "Normaliza el WhatsApp");
  check(read.data?.portfolio?.pieces?.[2]?.video?.platform === "tiktok", "Reconoce el link de TikTok");

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

  // ── Página pública (sin clave) ──
  const publicPage = await fetch(`${BASE}/p/${slug}`);
  const html = await publicPage.text();
  check(publicPage.status === 200 && html.includes(name), `La página pública abre sin clave → /p/${slug}`, publicPage.status);
  check(/<meta name="robots" content="noindex, nofollow"/.test(html), "La página pública no aparece en buscadores (noindex)");
  check(html.includes("Videos que venden sin parecer anuncio."), "Muestra al instante el cambio recién guardado (el caché se invalida)");
  check(html.includes("https://www.tiktok.com/@prueba/video/"), 'La pieza de video lleva a su original ("Ver en TikTok")');

  // ── Versiones por nicho ──
  const before = (html, a, b) => html.indexOf(a) >= 0 && html.indexOf(a) < html.indexOf(b);
  const viajes = await fetch(`${BASE}/p/${slug}/viajes`);
  const viajesHtml = await viajes.text();
  check(viajes.status === 200 && viajesHtml.includes("portafolio ugc — viajes"), "La versión Viajes abre con su titular → /p/…/viajes");
  check(before(viajesHtml, "Reel en Cusco", "Rutina de noche"), "En Viajes, la pieza de viajes pasa primero");
  check(before(html, "Rutina de noche", "Reel en Cusco") && !html.includes("portafolio ugc —"), "La versión general mantiene el orden y no tiene titular de nicho");
  const belleza = await (await fetch(`${BASE}/p/${slug}/belleza`)).text();
  check(belleza.includes("Videos que venden sin parecer anuncio."), "La versión de un nicho también muestra al instante lo recién guardado");
  const badNiche = await fetch(`${BASE}/p/${slug}/moda`);
  check(badNiche.status === 404, "Un nicho que no existe responde 404");

  const missingPage = await fetch(`${BASE}/p/este-link-no-existe`);
  const missingHtml = await missingPage.text();
  check(missingPage.status === 404 && missingHtml.includes("no encontramos este portafolio"), "Un link inexistente responde 404 en español");

  const invalid = await call("POST", "/api/portfolios", { json: { ...draft, pieces: draft.pieces.slice(0, 2) } });
  const issue = invalid.data?.error?.issues?.[0];
  check(invalid.status === 400 && issue?.path === "pieces", `Valida en el servidor: "${issue?.message}"`, invalid.data);

  const missing = await call("GET", "/api/portfolios/este-link-no-existe");
  check(missing.status === 404, "Un link que no existe responde 404");

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
