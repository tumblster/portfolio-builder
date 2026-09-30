import type { NextRequest } from "next/server";
import { requireCreator } from "@/lib/auth";
import { jsonResponse } from "@/lib/errors";
import { storageRoundTrip } from "@/lib/storage/self-test";

/*
 * Diagnóstico de configuración (ronda 30/09 · 7.4 c): qué variables de entorno ve ESTE deployment en cada fase del
 * flujo. Solo dice si existen (true/false), nunca su valor. Requiere la clave. Abrirlo en el Preview y en
 * Producción muestra al tiro si a uno le falta algo (ver DEPLOY.md).
 * GET /api/import/health
 * GET /api/import/health?roundtrip=1 → además prueba de verdad el almacenamiento de ESTE deployment (spec 10.1):
 *   leer → escritura condicional → leer (roundtrip) y, en Blob, compara el etag de head() con el de get() y prueba
 *   ifMatch con cada uno (blobEtags). Escribe solo en health/.
 */

const has = (name: string) => Boolean(process.env[name]?.trim());

export async function GET(request: NextRequest) {
  const denied = requireCreator(request);
  if (denied) return denied;

  const onVercel = has("VERCEL");
  const vercelEnv = process.env.VERCEL_ENV ?? null;
  const prefix = vercelEnv === "production" ? "PROD_BLOB" : "PREV_BLOB";
  const driver = process.env.STORAGE_DRIVER?.trim().toLowerCase() || (onVercel ? "blob" : "local");
  // El Blob se resuelve igual que lib/storage: BLOB_READ_WRITE_TOKEN, o el par con prefijo del entorno.
  const blob = {
    BLOB_READ_WRITE_TOKEN: has("BLOB_READ_WRITE_TOKEN"),
    [`${prefix}_READ_WRITE_TOKEN`]: has(`${prefix}_READ_WRITE_TOKEN`),
    [`${prefix}_STORE_ID`]: has(`${prefix}_STORE_ID`),
  };
  const blobReady = driver !== "blob" || Object.values(blob).some(Boolean);

  const phases = {
    // Todas las pantallas del studio y todas las rutas de /api/import*.
    session: { CREATOR_ACCESS_KEY: has("CREATOR_ACCESS_KEY") },
    // /api/import: scrapeo, copia de imágenes, textos de la IA y el borrador.
    import: { APIFY_TOKEN: has("APIFY_TOKEN"), GROQ_API_KEY: has("GROQ_API_KEY"), storage: blobReady },
    // /api/import/confirm: generar el portafolio. Usa solo la sesión y el almacenamiento (nada más).
    generation: { CREATOR_ACCESS_KEY: has("CREATOR_ACCESS_KEY"), storage: blobReady },
    // /api/piloto: correos del programa piloto → Google Sheets (8.4); sin estas, modo mock.
    pilotSheet: {
      GOOGLE_SHEETS_SPREADSHEET_ID: has("GOOGLE_SHEETS_SPREADSHEET_ID"),
      GOOGLE_SERVICE_ACCOUNT_EMAIL: has("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: has("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
    },
  };
  const missing = Object.entries(phases).flatMap(([phase, vars]) =>
    phase === "pilotSheet" ? [] : Object.entries(vars).flatMap(([name, ok]) => (ok ? [] : [`${phase}.${name}`])),
  );
  let checks: Record<string, unknown> | undefined;
  if (request.nextUrl.searchParams.get("roundtrip") === "1") {
    checks = { roundtrip: await storageRoundTrip().catch((error) => ({ ok: false, error: String(error) })) };
    if (driver === "blob") {
      const { diagnoseBlobEtags } = await import("@/lib/storage/blob");
      checks.blobEtags = await diagnoseBlobEtags().catch((error) => ({ error: String(error) }));
    }
  }
  return jsonResponse(
    { vercelEnv, storage: { driver, ...(driver === "blob" ? { blob } : {}) }, phases, missing, ok: missing.length === 0, ...(checks ? { checks } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
