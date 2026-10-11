import "server-only";
import { createHash, createHmac } from "node:crypto";
import { ConfigError } from "@/lib/errors";
import type { StoredMedia } from "./index";

/*
 * Imágenes en Cloudflare R2 (API S3-compatible, firmada con SigV4). $0 en el free tier
 * (10 GB, 1M escrituras, 10M lecturas/mes):
 *  - Solo las IMÁGENES se mudan a R2: son append-only (nombres únicos, nunca se sobrescriben), sin escrituras
 *    condicionales ni etags. Cada subida a Vercel Blob cuenta como operación avanzada (2,000/mes en Hobby);
 *    en R2 el free tier sobra por años.
 *  - Los JSON de portafolios SIGUEN en Vercel Blob: el candado con etags (ifMatch) ya está probado ahí y no se toca.
 *  - El bucket es PRIVADO: se sirve igual por /media/[file], el app lee de R2 y lo transmite. Sin URLs públicas,
 *    sin custom domain, sin cambiar DNS.
 *  - getMedia cae a Vercel Blob si la imagen no está en R2: los portafolios creados antes de la mudanza
 *    no se rompen (puente de transición).
 *  - Sin dependencias: PUT y GET son REST firmados con SigV4 (las keys las generamos nosotros:
 *    `preview|production/media/<uuid>.webp`, sin caracteres que escapar).
 */

const MEDIA_CACHE_SECONDS = 60 * 60 * 24 * 365; // las imágenes nunca cambian

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigError(
      `Falta la variable ${name} para usar R2. En Vercel: Settings → Environment Variables del proyecto.`,
    );
  }
  return value;
}

const sha256Hex = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");
const hmac = (key: Uint8Array | string, data: string): Buffer => createHmac("sha256", key).update(data).digest();

function signedFetchInput(input: {
  method: "PUT" | "GET";
  bucket: string;
  key: string;
  contentType?: string;
  cacheControl?: string;
  body?: Uint8Array;
}): { url: string; headers: Record<string, string> } {
  const accountId = required("R2_ACCOUNT_ID");
  const accessKeyId = required("R2_ACCESS_KEY_ID");
  const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const path = `/${input.bucket}/${input.key}`;

  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(input.body ?? "");

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (input.contentType) headers["content-type"] = input.contentType;
  if (input.cacheControl) headers["cache-control"] = input.cacheControl;

  const sortedNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedNames.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const signedHeaders = sortedNames.join(";");
  const canonicalRequest = [input.method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), "auto"), "s3"), "aws4_request");
  const signature = hmac(signingKey, stringToSign).toString("hex");
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: `https://${host}${path}`, headers };
}

const bucket = () => required("R2_BUCKET");

/** Un solo bucket; el entorno va en el prefijo (R2 no separa entornos como Vercel). */
const objectKey = (file: string) =>
  `${process.env.VERCEL_ENV === "production" ? "production" : "preview"}/media/${file}`;

/** Guarda una imagen nueva en R2 (los nombres son únicos y nunca se sobrescriben). */
export async function r2PutMedia(file: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const { url, headers } = signedFetchInput({
    method: "PUT",
    bucket: bucket(),
    key: objectKey(file),
    contentType,
    cacheControl: `public, max-age=${MEDIA_CACHE_SECONDS}, immutable`,
    body: bytes,
  });
  const response = await fetch(url, { method: "PUT", headers, body: bytes as BodyInit });
  if (!response.ok) {
    throw new Error(`R2: no se pudo guardar la imagen (${response.status}). Revisa las credenciales del bucket.`);
  }
}

/** Lee una imagen de R2, o null si no existe. */
export async function r2GetMedia(file: string): Promise<StoredMedia | null> {
  const { url, headers } = signedFetchInput({ method: "GET", bucket: bucket(), key: objectKey(file) });
  const response = await fetch(url, { method: "GET", headers });
  if (response.status === 404) return null;
  if (!response.ok || !response.body) {
    throw new Error(`R2: no se pudo leer la imagen (${response.status}).`);
  }
  const contentLength = Number(response.headers.get("content-length"));
  return {
    body: response.body as ReadableStream<Uint8Array>,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    size: Number.isFinite(contentLength) ? contentLength : null,
  };
}
