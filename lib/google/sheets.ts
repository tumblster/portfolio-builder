import "server-only";
import { createSign } from "node:crypto";

/*
 * Google Sheets con una cuenta de servicio (ronda 30/09 · 8.4), sin librerías: se firma un JWT RS256 con
 * node:crypto, se cambia por un token de acceso (vale 1 h, se reutiliza) y se agrega una fila con values:append.
 * Configuración (ver DEPLOY.md): GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL,
 * GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY y, opcional, GOOGLE_SHEETS_RANGE (por defecto "Piloto!A:C").
 * El Sheet se comparte con el correo de la cuenta de servicio como Editor.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TIMEOUT_MS = 10_000;

export type SheetsConfig = { spreadsheetId: string; range: string; clientEmail: string; privateKey: string };

/** La configuración del Sheet, o null si falta algo (entonces el piloto usa el modo mock). */
export function sheetsConfig(): SheetsConfig | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  // En Vercel la clave suele pegarse con los saltos de línea escritos como "\n".
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!spreadsheetId || !clientEmail || !privateKey) return null;
  return { spreadsheetId, clientEmail, privateKey, range: process.env.GOOGLE_SHEETS_RANGE?.trim() || "Piloto!A:C" };
}

const base64url = (value: string) => Buffer.from(value).toString("base64url");

let cached: { token: string; expiresAt: number; clientEmail: string } | null = null;

async function accessToken(config: SheetsConfig): Promise<string> {
  if (cached && cached.clientEmail === config.clientEmail && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iss: config.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(config.privateKey, "base64url");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google OAuth respondió ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000, clientEmail: config.clientEmail };
  return data.access_token;
}

/** Agrega una fila al final del rango. Lanza si Google no la aceptó. */
export async function appendSheetRow(config: SheetsConfig, values: string[]): Promise<void> {
  const token = await accessToken(config);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}` +
    `/values/${encodeURIComponent(config.range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [values] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google Sheets respondió ${response.status}: ${(await response.text()).slice(0, 200)}`);
}
