import "server-only";
import { getStorage } from "./index";

/*
 * Round-trip de escritura condicional (spec 10.1): leer → escribir con el etag leído → leer → escribir con el etag
 * viejo. Con cualquier driver (disco en CI, Blob en Vercel), usando la MISMA interfaz que el candado de generar y las
 * ediciones. Escribe solo en health/roundtrip.json. Lo usan /api/import/health?roundtrip=1 y la prueba de humo.
 */
export async function storageRoundTrip(): Promise<{ ok: boolean; driver: string; steps: Record<string, boolean> }> {
  const storage = getStorage();
  const path = "health/roundtrip.json";
  const stamp = new Date().toISOString();
  await storage.createJson(path, { n: 0, at: stamp });
  const first = await storage.readJson(path);
  const steps: Record<string, boolean> = { read: Boolean(first?.etag) };
  const next = { n: ((first?.data as { n?: number } | undefined)?.n ?? 0) + 1, at: stamp };
  steps.conditionalWrite = first ? await storage.replaceJson(path, next, first.etag) : false;
  const second = await storage.readJson(path);
  steps.readBack = JSON.stringify(second?.data) === JSON.stringify(next) && second?.etag !== first?.etag;
  steps.staleRejected = first ? !(await storage.replaceJson(path, { n: -1, at: stamp }, first.etag)) : false;
  return { ok: Object.values(steps).every(Boolean), driver: storage.name, steps };
}
