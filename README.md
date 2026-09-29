# Portfolio Builder · Supercreador

MVP para crear portafolios UGC con link compartible y un link por nicho. Repo: `portfolio-builder`.
Detalle en el PRD v1.0, su actualización v1 y el prompt de la v2 "Premium".

**Flujo principal:** pegas el link de Instagram → se scrapea el perfil (foto, bio, posts) → la IA detecta
hasta 3 nichos del contenido, escribe la propuesta de valor, titula y etiqueta cada pieza y sugiere formas de
colaborar → un modal te entrega el link general y uno por nicho.
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
| `/p/<slug>/<nicho>` | La misma página, ya filtrada por ese nicho (p. ej. `/fitness`)           |

## Importar desde Instagram

1. **Apify** (`apify/instagram-scraper`, modo details) lee el perfil y sus últimas ~12 publicaciones.
2. Se copian la foto y las imágenes a nuestro almacenamiento (las URLs de Instagram caducan).
3. Se eligen las 6 publicaciones con más interacción (likes + comentarios).
4. **Groq** (`openai/gpt-oss-120b`, JSON estricto) detecta hasta 3 nichos a partir del contenido real
   ("Fitness", "Cocina saludable"…), escribe la propuesta de valor, titula y etiqueta cada pieza, y sugiere
   3–4 formas de colaborar. Cada nicho recibe un slug seguro para URL; si el contenido calza con Belleza,
   Lifestyle o Viajes, se usan esos nombres. Una pieza que no encaja en ningún nicho va solo en "Todo".
5. Se guarda y se abre el modal **"Portafolio listo"**: link general, Copiar link, Abrir portafolio, Editar,
   Crear otro y los links por nicho, cada uno con su botón de copiar. Se cierra con la X, Esc o tocando fuera,
   y queda una línea "Ver link" para volver a abrirlo. Tarda 30–60 s y muestra el paso en curso en tiempo real.

- Perfil privado o con menos de 3 publicaciones → mensaje claro y formulario manual prellenado.
- Si la IA falla, el portafolio se crea igual con títulos sacados del texto de cada post y sin nichos
  etiquetados ni servicios (todo en "Todo"), y el modal lo avisa.
- **Costo:** ≈ US$0,003 por importación en Apify (plan gratis) y una fracción de centavo en Groq. El código
  pone un tope de US$0,50 por corrida de Apify. Pon topes mensuales en Apify (Billing → Limits) y en Groq
  (Settings → Spend Limits).

## Formulario y edición

- Campos del §3.1: nombre, bio, foto, propuesta de valor, 3 a 6 piezas (título, imagen o link de video,
  nicho opcional, en orden), **servicios** (hasta 4, con "Usar sugerencias") y contacto. La vista previa usa
  el mismo componente que la página pública, así que se ve exactamente igual, y se puede mirar por nicho.
  Móvil: pestañas Formulario / Vista previa. Escritorio: lado a lado.
- **Nicho de cada pieza:** el selector muestra los nichos del portafolio (los de la IA; Belleza, Lifestyle y
  Viajes en los creados a mano o en la v1). En v2 · M1 los nichos no se editan: el editor serio llega en M3.
- **Fotos:** se comprimen en el navegador antes de subir (1600 px, JPEG): las del celular pesan más de 4 MB y
  Vercel no acepta más. De paso pierden el GPS antes de salir del teléfono.
- **Portadas de video:** YouTube y TikTok llegan solas al pegar el link. Instagram no las comparte: se suben a
  mano (opcional). Una portada subida a mano nunca se reemplaza sola.
- **Editar:** botón "Editar" al terminar una importación, o `/editar/<slug>` (el mismo slug del link público).
  Solo lo que cambias se guarda como dato manual; lo que no tocas sigue viniendo de Instagram y de la IA.
- Si alguien guardó el mismo portafolio en otra pestaña, avisa en vez de pisar el cambio.

## Página pública (v2 · plantilla Creator)

Lenguaje visual de la referencia Starlet (`brief-diseno-referencias-framer.md`) con implementación propia:
DM Sans como única familia, crema + tinta + azul acero, contraste de texto ≥ 7:1 en todo.

- **Nav píldora de vidrio** con los nichos (`Todo · Fitness · Cocina saludable…`), el nombre y "Hablemos".
  En el celular, si no caben todas las píldoras, el borde se desvanece y la activa siempre queda a la vista.
- **Hero:** foto grande con tarjeta de vidrio (avatar, nombre, @usuario, "Disponible"), "Hola, soy …",
  propuesta de valor, bio en 2 líneas y botones "Trabajemos juntos" / "Ver mi trabajo". Como foto grande se
  usa la de perfil si tiene 600 px o más; si no, la primera pieza (las de perfil de Instagram miden 320 px).
- **Stats reales de Instagram:** seguidores, vistas promedio por reel, engagement y me gusta promedio. Solo si
  hay datos suficientes (p. ej. al menos 2 reels con vistas); nada se estima. Los portafolios manuales no llevan.
- **Trabajo seleccionado:** carrusel de piezas verticales en un bloque oscuro, con plataforma y vistas (o me
  gusta) de cada pieza; flechas en tablet y escritorio. Cada pieza lleva a su original, sin embeds.
- **Formas de colaborar:** los servicios (se oculta si no hay). **"Hablemos"** monumental con el correo y los
  demás canales. Footer mínimo. Nada en la página habla de la herramienta ni de la IA.
- Se adapta al ancho de su contenedor (container queries): la vista previa del editor se ve como un celular.
- **JavaScript propio:** solo el filtro de nichos y las flechas del carrusel. Las entradas al hacer scroll son
  CSS puro y nunca dejan contenido oculto si el navegador no las anima.
- **Copiar link (RF-05):** en el modal "Portafolio listo" y en cada fila de links del editor, con un check de
  confirmación y respaldo si el navegador no deja usar el portapapeles moderno.
- **Caché:** cada portafolio se genera en su primera visita y queda en la CDN (ISR). Al crear o editar se
  invalidan el link general y los de cada nicho (los de antes y los de después del cambio); además se
  refresca solo cada 60 s como red de seguridad.
- Un link que no existe muestra un 404 en español. Las páginas y las imágenes no aparecen en buscadores.

## Nichos (v2)

- Cada portafolio tiene hasta 3 nichos propios, con su link: `/p/<slug>/<nicho>`. Las píldoras son links
  reales: al tocarlas se filtra al instante (sin recargar) y la URL cambia, así el link se puede copiar y
  "atrás" vuelve al filtro anterior. Sin JavaScript, el link igual abre filtrado.
- El servidor manda todas las piezas marcadas con sus vistas (`data-pf-show="todo fitness"`); el filtro solo
  cambia un atributo y una regla CSS oculta lo demás.
- Solo aparecen como píldoras los nichos con piezas. El link de un nicho que se quedó sin piezas sigue
  abriendo (muestra todo); un nicho que el portafolio no tiene responde 404.
- **Compatibilidad:** los portafolios de la v1 (y los creados a mano) usan Belleza, Lifestyle y Viajes, así que
  todos los links ya compartidos siguen abriendo.
- En el editor: arriba, el link general y uno por nicho ("sin piezas" si corresponde), y la vista previa se
  puede filtrar con el selector o con las píldoras de la propia vista previa.

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
(TikTok, Instagram, YouTube), el slug de uno de los nichos del portafolio (o `null`: solo en "Todo") y su origen.

**Esquema v2** (`schemaVersion: 2`): `generated` y `manual` suman `niches` (hasta 3, `{ slug, label }`) y
`services` (hasta 4, `{ title, description }`), con la misma regla manual → IA. Los nichos resueltos son
manual → IA → los tres de la v1. Los JSON de la v1 se leen sin migración previa y se guardan como v2 en su
siguiente edición. El servidor rechaza una pieza con un nicho que el portafolio no tiene.

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

Prueba la API, la sesión, el editor, la página pública y sus links por nicho (incluido el caché) y las
validaciones de importación y portadas **sin gastar saldo** (nunca llama a Apify ni a Groq). En v2 · M1 son
65 checks: píldoras y filtro, nichos sin piezas, 404 de nichos ajenos, servicios, noindex y theme-color, y dos
fixtures escritos en `.data/` (un JSON de la v1 con cifras de Instagram y uno de la v2 con nichos propios).
Crea datos de prueba en `.data/`: úsala en local, no contra producción (con `STORAGE_DRIVER=blob` se saltan
los fixtures).

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
| `app/layout.tsx`, `app/globals.css` | HTML base (sin fuentes) y sistema visual de la herramienta (§7.2, §7.3) |
| `app/(studio)/`                     | La herramienta: importar (`page.tsx`), `acceso/`, `crear/manual/`, `editar/[slug]/`; su layout trae sus fuentes |
| `app/p/layout.tsx`, `app/portfolio.css` | Zona pública: solo DM Sans, tema claro y estilos de la plantilla Creator |
| `app/p/[slug]/`, `app/not-found.tsx` | Página pública (general y `[niche]/`) y 404 en español         |
| `app/api/…`, `app/media/…`          | API y entrega de imágenes                                       |
| `components/`                       | Piezas de interfaz; `public-portfolio.tsx` elige la plantilla e `import-screen.tsx` tiene el modal "Portafolio listo" |
| `components/portfolio/`             | Plantilla Creator, filtro de nichos, flechas del carrusel e íconos |
| `components/editor/`                | Formulario, vista previa, piezas, subida de fotos               |
| `lib/instagram/`                    | Link → usuario, Apify, copia de imágenes, selección de posts    |
| `lib/ai/groq.ts`                    | Textos con IA                                                   |
| `lib/import/`                       | Orquestación de la importación y eventos de progreso            |
| `lib/portfolio/`                    | Modelo, slugs, nichos, stats, servicios sugeridos, metadatos, precedencia, contacto, guardado |
| `lib/fonts/`                        | Fuentes de la herramienta y de la página pública, por separado  |
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

**v2 "Premium"** (un zip por milestone):

- [x] M1 · Página pública rediseñada (plantilla Creator), nichos dinámicos con IA, filtro por píldoras con URL
  propia y modal "Portafolio listo"
- [ ] M2 · Plantillas (Creator, Bio, Minimal y una más), galería con mockups y paletas
- [ ] M3 · Videos inline (facade), editor serio con arrastrar y soltar, nicho "Otro"

**Deuda técnica consciente (no construir ahora):** el sistema de diseño vive duplicado entre
`portfolio-builder` y `supercreador-muse`. Evaluar monorepo (Turborepo) o paquete compartido de tokens al
llegar a 3 herramientas o al primer ingreso recurrente.
