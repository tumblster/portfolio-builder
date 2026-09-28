# Portfolio Builder · Supercreador

MVP para crear portafolios UGC con link compartible y versiones por nicho
(Belleza / Lifestyle / Viajes). Repo: `portfolio-builder`. Detalle en el PRD v1.0 y su actualización v1.

**Flujo principal:** pegas el link de Instagram → se scrapea el perfil (foto, bio, posts) → la IA escribe
la propuesta de valor y un título y nicho por pieza → recibes el link.
**Fallback siempre visible:** "Prefiero llenarlo manual" → formulario con vista previa en vivo (RF-01, RF-02).

**Publicar en Vercel, dominio y checklist de salida:** ver [`DEPLOY.md`](DEPLOY.md).

## Requisitos

- Node.js 20.9 o superior
- npm

## Correr en local

```bash
npm install
cp .env.example .env.local        # en Windows: copy .env.example .env.local
openssl rand -base64 32           # pega el resultado en CREATOR_ACCESS_KEY
# pega también APIFY_TOKEN y GROQ_API_KEY en .env.local
npm run dev
```

Abre http://localhost:3000, entra con la clave y pega un perfil de Instagram. En tu compu los datos se
guardan en `.data/` (no se sube a git). Bórrala cuando quieras empezar de cero.

## Pantallas

| Ruta            | Qué es                                                                     |
| --------------- | -------------------------------------------------------------------------- |
| `/acceso`       | Pide la clave del creador y guarda la sesión por 30 días                   |
| `/`             | Importar desde Instagram (flujo principal)                                 |
| `/crear/manual` | Formulario manual con vista previa (llega prellenado si vino de la importación) |
| `/editar/<slug>` | Editar cualquier portafolio, también los importados                          |
| `/p/<slug>`     | Portafolio público, versión general: abierto sin clave y fuera de buscadores |
| `/p/<slug>/<nicho>` | Versión por nicho: `belleza`, `lifestyle` o `viajes` (RF-04)           |

## Importar desde Instagram

1. **Apify** (`apify/instagram-scraper`, modo details) lee el perfil y sus últimas ~12 publicaciones.
2. Se copian la foto y las imágenes a nuestro almacenamiento (las URLs de Instagram caducan).
3. Se eligen las 6 publicaciones con más interacción (likes + comentarios).
4. **Groq** (`openai/gpt-oss-120b`, JSON estricto) escribe la propuesta de valor y un título y nicho por pieza.
5. Se guarda y la pantalla entrega el link. Tarda 30–60 s y muestra el paso en curso en tiempo real.

- Perfil privado o con menos de 3 publicaciones → mensaje claro y formulario manual prellenado.
- Si la IA falla, el portafolio se crea igual con títulos sacados del texto de cada post, y la pantalla lo avisa.
- **Costo:** ≈ US$0,003 por importación en Apify (plan gratis) y una fracción de centavo en Groq. El código
  pone un tope de US$0,50 por corrida de Apify. Pon topes mensuales en Apify (Billing → Limits) y en Groq
  (Settings → Spend Limits).

## Formulario y edición

- Campos del §3.1: nombre, bio, foto, propuesta de valor, 3 a 6 piezas (título, imagen o link de video,
  nicho opcional, en orden) y contacto. La vista previa usa el mismo componente que la página pública, así que
  se ve exactamente igual. Móvil: pestañas Formulario / Vista previa. Escritorio: lado a lado.
- **Fotos:** se comprimen en el navegador antes de subir (1600 px, JPEG): las del celular pesan más de 4 MB y
  Vercel no acepta más. De paso pierden el GPS antes de salir del teléfono.
- **Portadas de video:** YouTube y TikTok llegan solas al pegar el link. Instagram no las comparte: se suben a
  mano (opcional). Una portada subida a mano nunca se reemplaza sola.
- **Editar:** botón "Editar" al terminar una importación, o `/editar/<slug>` (el mismo slug del link público).
  Solo lo que cambias se guarda como dato manual; lo que no tocas sigue viniendo de Instagram y de la IA.
- Si alguien guardó el mismo portafolio en otra pestaña, avisa en vez de pisar el cambio.

## Página pública

- En el celular, sin hacer scroll, se ven foto, nombre, propuesta de valor y 3 piezas (§7.4). Las piezas van
  en una tira horizontal deslizable (una sola fila, §7.5); en escritorio pasan a una grilla.
- Cada pieza muestra su miniatura; si es video lleva una marca de play. "Ver en Instagram / TikTok / YouTube"
  lleva al original (sin embeds, para cargar rápido en 4G).
- Contacto: WhatsApp, correo, Instagram, TikTok, YouTube y web, según lo que haya.
- **Copiar link (RF-05):** en la pantalla de resultado y en cada fila de links del editor, con un check de
  confirmación. Si el navegador no deja usar el portapapeles moderno (p. ej. http por la red local), usa un
  respaldo y, si tampoco se puede, avisa que se copie a mano.
- **Caché:** cada portafolio se genera en su primera visita y queda guardado en la CDN (ISR), así que las
  siguientes cargas son casi instantáneas. Al crear o editar se invalida al momento; además se refresca solo
  cada 60 s como red de seguridad.
- Un link que no existe muestra un 404 en español. Las páginas y las imágenes no aparecen en buscadores.

## Versiones por nicho (RF-04)

- Cada portafolio tiene 4 links: el general (`/p/<slug>`) y uno por nicho (`/p/<slug>/belleza`, `/lifestyle`,
  `/viajes`). Mismos datos; cambia el acento (Belleza fucsia, Lifestyle violeta, Viajes ámbar), el titular
  ("portafolio ugc — belleza") y el orden: primero las piezas etiquetadas con ese nicho, después el resto.
- La página pública abre directo en el nicho de su link, sin pestañas: cada marca recibe el link de su nicho.
- La versión general usa el violeta de la marca, igual que Lifestyle (§7.2): se distinguen por titular y orden.
- En el editor: la vista previa tiene el selector General / Belleza / Lifestyle / Viajes y arriba están los
  4 links para abrir.
- Los textos con color de acento usan una versión aclarada: el violeta puro no llega al contraste mínimo para
  letra chica sobre el índigo (4.1:1); la aclarada, sí en los tres nichos (7.3:1 o más).

## Variables de entorno

| Variable             | Para qué                                        | Dónde se consigue                                  |
| -------------------- | ----------------------------------------------- | -------------------------------------------------- |
| `CREATOR_ACCESS_KEY` | Clave para crear portafolios (mín. 24 caracteres) | `openssl rand -base64 32`                          |
| `APIFY_TOKEN`        | Leer perfiles de Instagram                      | console.apify.com → Settings → API & Integrations  |
| `GROQ_API_KEY`       | Propuesta de valor, títulos y nichos con IA     | console.groq.com → API Keys                        |
| `STORAGE_DRIVER`     | Opcional: `local` o `blob`                      | Por defecto: `local` en tu compu, `blob` en Vercel |

En Vercel van en **Settings → Environment Variables**. El Blob store agrega sus propias credenciales al
conectarlo (ver abajo): no hay que copiarlas.

## Almacenamiento

- **Vercel:** un Blob store **privado** (Storage → Create → Blob → acceso *Private*, y conectarlo al
  proyecto). Guarda un JSON por portafolio en `portfolios/<slug>.json` y las imágenes en `media/`.
- **Local:** carpeta `.data/`, con el mismo comportamiento.
- Los JSON se leen siempre en su última versión. Las ediciones llevan un número de `revision`: si dos
  personas guardan a la vez, la segunda recibe un aviso (409) en vez de pisar el cambio.
- Todas las imágenes se normalizan al guardarlas: se enderezan, se reducen a 1600 px, pasan a WebP y pierden
  sus metadatos (incluida la ubicación GPS de las fotos de celular). Se sirven en `/media/<archivo>.webp`.

## Modelo de datos

Cada portafolio guarda tres fuentes por separado (`lib/portfolio/schema.ts`):

| Sección     | Qué es                                                             | ¿Se edita? |
| ----------- | ------------------------------------------------------------------ | ---------- |
| `instagram` | Lo que se scrapeó del perfil con Apify                             | No         |
| `generated` | Lo que escribió Groq: propuesta de valor y título/nicho por post   | No         |
| `manual`    | Lo que se escribe a mano                                           | Sí         |

Lo que se muestra sigue una sola regla: **manual → IA → Instagram** (`lib/portfolio/resolve.ts`). Un texto
vacío escrito a mano significa "no mostrar". Regenerar con IA o volver a scrapear nunca borra una corrección.

`pieces` es la selección final (3 a 6, en orden). Cada pieza tiene título, imagen y/o link de video
(TikTok, Instagram, YouTube), un nicho opcional y su origen.

## API (protegida con la clave)

Desde scripts, manda la clave en el encabezado `x-creator-key`. Desde la app, la sesión viaja en una cookie.

| Método   | Ruta                     | Qué hace                                                  |
| -------- | ------------------------ | --------------------------------------------------------- |
| `POST`   | `/api/session`           | Entra con `{ key }` y guarda la cookie de sesión          |
| `DELETE` | `/api/session`           | Sale                                                      |
| `POST`   | `/api/import`            | Importa `{ instagram }`; responde el progreso como NDJSON |
| `POST`   | `/api/media`             | Sube una imagen (multipart, campo `file`, máx. 4 MB)      |
| `POST`   | `/api/video-cover`       | Trae y guarda la portada de un video: `{ url }`           |
| `POST`   | `/api/portfolios`        | Crea un portafolio a mano                                 |
| `GET`    | `/api/portfolios/<slug>` | Lee el portafolio completo y lo que se muestra            |
| `PATCH`  | `/api/portfolios/<slug>` | Edita: `{ revision, manual?, pieces? }`                   |
| `GET`    | `/media/<archivo>`       | Sirve una imagen (pública)                                |

## Prueba de humo

Con `npm run dev` corriendo, en otra terminal:

```bash
npm run smoke
```

Prueba la API, la sesión, el editor, la página pública y sus versiones por nicho (incluido el caché) y las validaciones de importación y portadas **sin gastar saldo** (nunca llama a Apify ni a
Groq). Crea datos de prueba en `.data/`: úsala en local, no contra producción.

**En cada push** corre sola en GitHub Actions (`.github/workflows/ci.yml`), junto con lint, tipos y build.

## Scripts

| Comando         | Qué hace                                  |
| --------------- | ----------------------------------------- |
| `npm run dev`   | Servidor de desarrollo                    |
| `npm run build` | Build de producción                       |
| `npm run start` | Sirve el build de producción              |
| `npm run lint`  | Revisa el código con ESLint               |
| `npm run smoke` | Prueba la API de punta a punta (en local) |

## Estructura

| Ruta                                | Qué contiene                                                    |
| ----------------------------------- | --------------------------------------------------------------- |
| `app/layout.tsx`, `app/globals.css` | HTML base, fuentes y sistema visual (§7.2, §7.3)                |
| `app/page.tsx`                      | Importar desde Instagram                                        |
| `app/acceso/`                       | Pantalla de clave                                               |
| `app/crear/manual/`, `app/editar/[slug]/` | Formulario manual y edición                               |
| `app/p/[slug]/`, `app/not-found.tsx` | Página pública (general y `[niche]/`) y 404 en español         |
| `app/api/…`, `app/media/…`          | API y entrega de imágenes                                       |
| `components/`                       | Piezas de interfaz; `public-portfolio.tsx` es la página pública |
| `components/editor/`                | Formulario, vista previa, piezas, subida de fotos               |
| `lib/instagram/`                    | Link → usuario, Apify, copia de imágenes, selección de posts    |
| `lib/ai/groq.ts`                    | Textos con IA                                                   |
| `lib/import/`                       | Orquestación de la importación y eventos de progreso            |
| `lib/portfolio/`                    | Modelo, slugs, nichos y su orden, precedencia, contacto, guardado |
| `lib/storage/`                      | Blob privado (Vercel) y disco (local)                           |
| `lib/auth.ts`, `lib/request.ts`     | Clave del creador y host real de cada petición                  |
| `lib/media.ts`, `lib/remote-image.ts` | Normalización de imágenes y copia segura desde otros sitios   |
| `lib/video-cover.ts`, `lib/compress-image.ts` | Portadas de YouTube/TikTok y compresión en el navegador |
| `scripts/smoke.mjs`                 | Prueba de humo                                                  |
| `.github/workflows/ci.yml`          | Verificación automática en cada push                            |
| `DEPLOY.md`                         | Publicar en Vercel y checklist de salida                        |

Al correr `npm run dev` por primera vez, Next.js 16 crea `AGENTS.md` y `CLAUDE.md` en la raíz. Es normal;
se pueden commitear.

## Orden de construcción

**Fase 1 — funcionalidad** (un milestone por mensaje, sin animaciones ni pulido):

- [x] M1 · Setup + tema
- [x] M2 · Datos + persistencia + clave del creador
- [x] M3 · Importar desde Instagram (Apify + Groq) y pantalla de clave
- [x] M4 · Página pública `/p/[slug]` (RF-03)
- [x] M5 · Formulario manual + subida de fotos + vista previa (RF-01, RF-02) — fallback, y edición
- [x] M6 · Cambio de nicho (RF-04)
- [x] M7 · Cierre: copiar link (RF-05), deploy y checklist de salida (ver `DEPLOY.md`)

**Fase 2 — pulido visual (§7.6):** solo cuando la Fase 1 esté desplegada y probada.

**Deuda técnica consciente (no construir ahora):** el sistema de diseño vive duplicado entre
`portfolio-builder` y `supercreador-muse`. Evaluar monorepo (Turborepo) o paquete compartido de tokens al
llegar a 3 herramientas o al primer ingreso recurrente.
