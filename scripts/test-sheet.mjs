// Prueba de los correos del piloto → Google Sheets (ronda 30/09 · 8.4).
//   npm run test:sheet                 (servidor en http://localhost:3000)
//   BASE=https://<preview>.vercel.app npm run test:sheet
// 1) Envía un correo de prueba único a POST /api/piloto.
// 2) Con el Sheet configurado (GOOGLE_* en .env.local, las mismas del deployment): lee el Sheet con la cuenta de
//    servicio y verifica que la fila llegó. Sin configurar: verifica que la respuesta diga MODO MOCK (sink "mock").
import { createSign } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3000";
const email = `prueba+sheet-${Date.now()}@supercreador.test`;
const fail = (message) => {
  console.error(`✘ ${message}`);
  process.exit(1);
};

const response = await fetch(new URL("/api/piloto", BASE), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email }),
});
const body = await response.json().catch(() => null);
if (response.status !== 201) fail(`/api/piloto respondió ${response.status}: ${JSON.stringify(body)}`);
const sink = response.headers.get("x-pilot-sink");
console.log(`✔ /api/piloto aceptó ${email} (sink: ${sink})`);

const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
const range = process.env.GOOGLE_SHEETS_RANGE?.trim() || "Piloto!A:C";
if (!id || !clientEmail || !privateKey) {
  if (sink !== "mock" || body?.sink !== "mock") fail("Sin Sheet configurado aquí, pero el servidor no respondió en modo mock.");
  console.log("⚠ MODO MOCK: el Sheet no está configurado; la fila quedó en pilot-sheet-mock/ (ver DEPLOY.md).");
  process.exit(0);
}
if (sink !== "sheet") fail(`Este script tiene el Sheet configurado, pero el servidor respondió sink "${sink}": revisa sus variables.`);

const b64 = (value) => Buffer.from(value).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(
  JSON.stringify({ iss: clientEmail, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 }),
)}`;
const assertion = `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64url")}`;
const token = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
}).then((r) => r.json());
if (!token.access_token) fail(`Google OAuth no dio token: ${JSON.stringify(token)}`);
const sheet = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}`,
  { headers: { Authorization: `Bearer ${token.access_token}` } },
).then((r) => r.json());
const found = (sheet.values ?? []).some((row) => row.includes(email));
if (!found) fail(`La fila con ${email} no está en el Sheet (${range}).`);
console.log(`✔ La fila con ${email} llegó al Sheet (${range}).`);
