/*
 * Prueba de humo de la pieza 6 (ronda 6 · 13.18 Media Kit v1, 13.19 Brand partners, 13.20 Case studies).
 * Corre después de scripts/smoke.mjs (npm run smoke) o sola (npm run smoke:mediakit), con `npm run dev` corriendo.
 * Nunca llama a Apify ni a Groq: la ruta del logo solo se prueba en sus rechazos (sin sesión, usuario inválido).
 * Escribe un fixture en .data/portfolios/ (solo en local: con STORAGE_DRIVER=blob se salta).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.CREATOR_ACCESS_KEY ?? "";
const SLUG = "smoke-media-kit";

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function api(method, url, body, { auth = true } = {}) {
  const headers = { ...(auth ? { "x-creator-key": KEY } : {}), ...(body ? { "Content-Type": "application/json" } : {}) };
  const response = await fetch(`${BASE}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

const now = new Date().toISOString();
const post = (id, type, caption, counts) => ({
  id,
  shortCode: id.toUpperCase(),
  url: `https://www.instagram.com/${type === "video" ? "reel" : "p"}/${id.toUpperCase()}/`,
  type,
  caption,
  hashtags: [],
  takenAt: null,
  likesCount: counts.likes,
  commentsCount: counts.comments,
  viewsCount: counts.views,
  isPinned: false,
  image: null,
});

const fixture = {
  schemaVersion: 2,
  slug: SLUG,
  revision: 1,
  createdAt: now,
  updatedAt: now,
  source: "instagram",
  instagram: {
    source: "apify/instagram-scraper",
    scrapedAt: now,
    username: "smoke.kit",
    profileUrl: "https://www.instagram.com/smoke.kit/",
    fullName: "Smoke Kit",
    biography: "",
    externalUrl: null,
    followersCount: 12000,
    followsCount: 300,
    postsCount: 40,
    isVerified: false,
    isBusinessAccount: false,
    businessCategory: null,
    profilePhoto: null,
    posts: [
      post("p1", "video", "Mi rutina con @marcauno ✨", { likes: 820, comments: 41, views: 15400 }),
      post("p2", "video", "Probando @marcados", { likes: 500, comments: 20, views: 9000 }),
      post("p3", "image", "Domingo", { likes: 300, comments: 12, views: null }),
    ],
  },
  generated: null,
  manual: {
    name: "Smoke Kit",
    contact: { whatsapp: "+51987654321" },
    gender: "mujer",
    brandPartners: [{ name: "Marca Uno", instagram: "marcauno", logo: null, source: "detected" }],
    caseStudies: [
      { postId: "p1", brand: "Marca Uno", campaign: "Lanzamiento verano", image: null, metrics: { views: 15400, likes: 820, comments: 41 } },
      { postId: "no-existe", brand: "Fantasma", campaign: "", image: null, metrics: { views: null, likes: null, comments: null } },
    ],
  },
  pieces: ["p1", "p2", "p3"].map((id, index) => ({
    id: `pieza-${index + 1}`,
    origin: "instagram",
    title: `Pieza ${index + 1}`,
    niche: null,
    image: null,
    video: { platform: "instagram", url: `https://www.instagram.com/reel/${id.toUpperCase()}/` },
    sourcePostId: id,
  })),
  design: { template: "creator", palette: "crema" },
};

console.log("\nPieza 6 · Media kit, Brand partners y Case studies");

if (process.env.STORAGE_DRIVER === "blob") {
  console.log("  (STORAGE_DRIVER=blob: se salta el fixture de esta prueba)");
} else {
  const dir = path.join(process.cwd(), ".data", "portfolios");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${SLUG}.json`), JSON.stringify(fixture, null, 2));

  // ── Página pública: vista Media kit ──
  const response = await fetch(`${BASE}/p/${SLUG}`);
  const html = await response.text();
  check("GET /p/<slug> responde 200", response.status === 200, `HTTP ${response.status}`);
  const kitStart = html.indexOf('id="pf-panel-kit"');
  const kit = kitStart >= 0 ? html.slice(kitStart) : "";
  check("la vista Media kit existe", kit.length > 0);
  check("métricas + ER en el Media kit", kit.includes("data-mk-metrics"));
  check("Brand partners confirmados en el Media kit", kit.includes("data-mk-brands") && kit.includes("Marca Uno"));
  check("cada marca lleva a su Instagram", kit.includes("https://www.instagram.com/marcauno/"));
  check("sin logo, la marca muestra su inicial", /mk-brand__logo[^>]*>M</.test(kit));
  check("Case studies con campaña y cifras", kit.includes("data-mk-cases") && kit.includes("Lanzamiento verano") && kit.includes("data-mk-case-metrics"));
  check("un caso sin su publicación no se muestra", !kit.includes("Fantasma"));
  check("el Media kit no repite el grid de contenido", !kit.includes("mk-pieces") && !kit.includes("Piezas destacadas"));
  check("sin demografía de audiencia", !/demograf/i.test(kit));
  check("«Trabaja conmigo» abre WhatsApp con su número", kit.includes("data-mk-hire") && kit.includes("wa.me/51987654321"));
  check("el mensaje de «Trabaja conmigo» va según su género", kit.includes("supercreadora"));
  check("compartir flotante junto al badge (E2)", kit.includes("data-pf-made-with") && kit.includes("data-pf-share"));
  const order = ["data-mk-metrics", "data-mk-brands", "data-mk-cases"].map((marker) => kit.indexOf(marker));
  check("orden: métricas → Brand partners → Case studies (el compartir es flotante)", order.every((at, index) => at >= 0 && (index === 0 || at > order[index - 1])), order.join(","));

  // ── API ──
  const read = await api("GET", `/api/portfolios/${SLUG}`);
  const portfolio = read.data?.portfolio;
  check("GET /api/portfolios/<slug> trae los Brand partners guardados", portfolio?.manual?.brandPartners?.length === 1);
  check("lo que se muestra omite el caso huérfano", read.data?.resolved?.caseStudies?.length === 1);

  if (portfolio) {
    const added = await api("PATCH", `/api/portfolios/${SLUG}`, {
      revision: portfolio.revision,
      manual: {
        ...portfolio.manual,
        brandPartners: [...portfolio.manual.brandPartners, { name: "Marca Dos", instagram: "@MarcaDos", logo: null, source: "manual" }],
      },
    });
    check("PATCH agrega una marca a mano", added.status === 200, `HTTP ${added.status}`);
    check("el usuario de la marca se guarda sin @ y en minúsculas", added.data?.portfolio?.manual?.brandPartners?.[1]?.instagram === "marcados");

    const revision = added.data?.portfolio?.revision ?? portfolio.revision + 1;
    const manual = added.data?.portfolio?.manual ?? portfolio.manual;
    const duplicate = await api("PATCH", `/api/portfolios/${SLUG}`, {
      revision,
      manual: { ...manual, brandPartners: [...manual.brandPartners, { name: "Otra", instagram: "marcauno", logo: null, source: "manual" }] },
    });
    check("una marca repetida se rechaza (400)", duplicate.status === 400, `HTTP ${duplicate.status}`);

    const noBrand = await api("PATCH", `/api/portfolios/${SLUG}`, {
      revision,
      manual: { ...manual, caseStudies: [{ postId: "p2", brand: "", campaign: "", image: null, metrics: { views: 9000, likes: 500, comments: 20 } }] },
    });
    check("un caso de estudio sin marca se rechaza (400)", noBrand.status === 400, `HTTP ${noBrand.status}`);
  }
}

// ── Logo de la marca (sin gastar saldo) ──
const anonymous = await api("POST", "/api/brand-logo", { instagram: "marcauno" }, { auth: false });
check("POST /api/brand-logo sin sesión responde 401", anonymous.status === 401, `HTTP ${anonymous.status}`);
const invalid = await api("POST", "/api/brand-logo", { instagram: "esto no es un usuario!" });
check("POST /api/brand-logo con un usuario inválido responde 400", invalid.status === 400, `HTTP ${invalid.status}`);

console.log(`\n${passed} checks OK${failures.length ? `, ${failures.length} fallaron` : ""}.`);
if (failures.length) process.exit(1);
