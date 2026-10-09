# Portfolio Builder · Supercreador

MVP para crear portafolios UGC con link compartible y un link por nicho. Repo: `portfolio-builder`.
Detalle en el PRD v1.0, su actualización v1 y el prompt de la v2 "Premium".

**Flujo principal:** pegas el link de Instagram → se scrapea el perfil (foto, bio, posts) → la IA detecta
hasta 3 nichos del contenido, escribe la propuesta de valor, titula y etiqueta cada pieza y sugiere formas de
colaborar → **confirmas los nichos, eliges plantilla y paleta** → se genera y un modal te entrega el link
general y uno por nicho.
**Fallback siempre visible:** "Prefiero llenarlo manual" → formulario con vista previa en vivo (RF-01, RF-02).

**Studio (v2 · M4):** la herramienta vive en `/acceso`, `/crear`, `/crear/manual` y `/editar/<slug>`, todas
con un solo sistema visual. **Landing (v2 · M4-rev):** `/` vende el Portfolio Builder con la mascota Chispa.

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

| Ruta | Qué es | Acceso |
| --- | --- | --- |
| `/` | Landing (M4-rev): hero con Chispa, prueba social honesta, cómo funciona, las 4 plantillas, el Engagement Rate y el CTA "Únete al programa piloto" | Pública (`noindex`) |
| `/acceso` | Entrar con la clave; con sesión lleva directo a `/crear` | Pública |
| `/crear` | Importar de Instagram → confirmar nichos → plantilla → paleta → generar | Con clave |
| `/crear/manual` | Formulario manual con vista previa en vivo | Con clave |
| `/editar/<slug>` | Editor: links, datos, piezas, servicios, contacto y diseño, con vista previa | Con clave |
| `/p/<slug>`, `/p/<slug>/<nicho>` | Portafolio público | Pública (`noindex`) |

Hasta el M2, la pantalla de importar estaba en `/`; desde el M4 está en `/crear` (el botón "Entrar" de la
landing lleva ahí después de la clave).

## Importar desde Instagram

1. **Apify** (`apify/instagram-scraper`, modo details) lee el perfil y sus últimas ~12 publicaciones.
2. Se copian la foto y las imágenes a nuestro almacenamiento (las URLs de Instagram caducan).
3. Se eligen las 6 publicaciones con más interacción (likes + comentarios).
4. **Groq** (`openai/gpt-oss-120b`, JSON estricto) detecta hasta 3 nichos a partir del contenido real
   ("Fitness", "Cocina saludable"…), escribe la propuesta de valor, titula y etiqueta cada pieza, y sugiere
   3–4 formas de colaborar. Cada nicho recibe un slug seguro para URL; si el contenido calza con Belleza,
   Lifestyle o Viajes, se usan esos nombres. Una pieza que no encaja en ningún nicho va solo en "Todo".
5. Se guarda un **borrador** en el servidor (`drafts/<id>.json`): todavía no hay portafolio. Hasta aquí tarda
   30–60 s y muestra el paso en curso en tiempo real.
6. **Antes de generar (v2 · M2)**, tres pasos en la misma pantalla:
   - **Nichos:** chips pre-marcados con lo que sugirió la IA. Se desmarcan, se renombran o se agregan (hasta 3),
     y cada pieza se puede mover a otro nicho o dejar solo en "Todo". Se ve el link que tendrá cada nicho.
   - **Plantilla:** galería de 4 mockups (Creator viene marcada como recomendada).
   - **Paleta:** la "de su foto" (pre-elegida si la foto tiene color) o una de las 5 curadas.
7. **Generar** crea el portafolio con esas decisiones y abre el modal **"Portafolio listo"**: link general, el
   Engagement Rate bajo el nombre, Copiar link, Abrir portafolio, Editar, Crear otro, los links por nicho con su
   botón de copiar y **"Cambiar plantilla o paleta"**. Se cierra con la X, Esc o tocando fuera, y queda una
   línea "Ver link" para volver a abrirlo.

- Perfil privado o con menos de 3 publicaciones → mensaje claro y formulario manual prellenado.
- El borrador vale 24 h. Generar dos veces (doble toque, reintento) devuelve el mismo portafolio: no duplica.
  Las cifras de Instagram nunca pasan por el navegador, así que no se pueden retocar al confirmar.
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
- **Stats reales de Instagram:** el **Engagement Rate** primero y más grande (con la base del cálculo), después
  seguidores, vistas promedio por reel y me gusta promedio. Solo si hay datos suficientes (p. ej. al menos 2
  reels con vistas); nada se estima. Los portafolios manuales no llevan.
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

## Media kit (v2 · ronda 6 · 13.18)

Segunda vista del portafolio público ("Contenido | Media kit", `components/portfolio/media-kit.tsx`): no repite el
grid de contenido ni trae demografía de audiencia (edad/género/países: requiere OAuth de Instagram, queda para otra
fase). Orden: **métricas + ER → Brand partners → Case studies → "Trabaja conmigo" → compartir**.

- **Métricas + ER** con su base etiquetada (las mismas del hero de Contenido, sin duplicar el grid).
- **Brand partners (13.19):** solo las marcas que la creadora confirmó. En la revisión antes de generar y en el
  editor, las @menciones de sus últimos 12 contenidos llegan como candidatas (`detected`); solo se guardan las que
  ella agrega, o las que carga a mano (`manual`: nombre + Instagram + logo opcional). `components/brand-partners-field.tsx`.
- **Logo de la marca** (`POST /api/brand-logo`, `lib/brand-logo.ts`): la foto de perfil de su Instagram, leída con el
  mismo actor de Apify del import y copiada a nuestro almacenamiento (caché `brand-logos/<usuario>.json`: 30 días si
  se encontró, 1 día si no). Sin crédito, cuenta privada o timeout → logo subido o inicial de la marca
  (`lib/portfolio/brands.ts`). Nunca Google ni Wikipedia. Costo: ~US$0,003 por marca nueva.
- **Case studies (13.20):** publicaciones importadas de su Instagram que la creadora marca en el editor
  (`components/editor/case-studies-field.tsx`, solo ahí, no en la revisión): marca, campaña, miniatura y métricas
  (vistas, me gusta, comentarios). Las cifras arrancan con los datos reales del post y son editables, con botón para
  volver al dato real. Un caso cuya publicación ya no está en la captura no se muestra (nunca invalida el portafolio).
- **"Trabaja conmigo":** WhatsApp con el mensaje según su género (o su correo). **Compartir:** icono sutil que abre
  una cápsula con WhatsApp, X, Instagram, TikTok y copiar link (Instagram/TikTok copian el link, sin intent web);
  abre directo en `#media-kit` con `?ref=whatsapp`; en esta vista el compartir global se oculta por CSS para no duplicarlo.
- El overlay de video (13.2/13.3) también abre los casos. Prueba de humo: `npm run smoke:mediakit` (22 checks).

## Marca (v2 · M4-rev)

La marca de Supercreador es **la sonrisa de Chispa, nada más**: la boca de la expresión "carcajada" (la del hero),
con el mismo path (`CHISPA_SMILE`, el mismo dato que dibuja la cara), la misma tinta y el mismo grosor de trazo. Sin
ojos, sin nariz, sin rellenos; monocromo. Componente: `components/brand/supercreador-mark.tsx`.

- **Lockup:** marca a 30 px de alto + el wordmark "Supercreador" (misma tipografía de siempre), en el header y el
  footer de la landing. Reemplaza al símbolo circular anterior.
- **Espacio de seguridad:** la altura de un diente (el central: 54 u, ≈ 49 % del alto de la marca), a la escala en
  que se use: 14,7 px con la marca a 30 px.
- **Favicon** (`app/icon.svg`, para todo el sitio): la sonrisa en tinta sobre el crema, en un cuadrado con su espacio
  de seguridad. A 16 px las 5 líneas de dientes se embarraban, así que el interior se simplificó a 3 líneas (4
  dientes; se quitaron las dos de los extremos). El contorno exterior y las comisuras son el path original, carácter
  por carácter.
- **Avatar** (`app/apple-icon.png`, 180 px): la sonrisa completa sobre crema, con su espacio de seguridad.

## Sistema visual del studio (v2 · M4)

Tokens de la referencia StoryFluence con implementación propia, sin su collage: el studio es una herramienta.
Todo vive en `app/globals.css` (tokens, escala y utilidades) y `components/ui.ts` (botones y campos), y se activa
con la clase `studio` del layout, así nunca alcanza a la página pública.

- **Tipografía:** titulares H1/H2 en **Anton, MAYÚSCULAS** (display condensada); cuerpo en Inter; URLs en mono.
  Escala única: `title-1` (H1 de cada pantalla), `title-2` (secciones), `title-3`,
  `eyebrow` (etiqueta sobre el título) y `lead` (entrada). H3 es subtítulo en sans.
- **Color:** crema `#F5F5E7`, tinta `#0E110B`, blanco para tarjetas y campos, arena `#E8E7D3` para bloques
  secundarios, `highlight` para lo elegido. Acento naranja-rojo **`#FC3300`**.
- **Contraste ≥ 7:1 en todo texto.** Ningún color de texto llega a 7:1 sobre `#FC3300` (el negro da 5,1:1) y
  él sobre crema da 3,4:1, así que el acento **no lleva texto ni es texto**: vive en las sombras duras, las
  marcas (✦, puntos de las etiquetas, subrayados) y el anillo de foco (≥ 3:1, lo que pide WCAG para lo que no es
  texto). Para texto de acento y errores existe `accent-ink` `#8A1C00` (8,6:1 sobre crema).
- **Componentes:** píldoras con borde de tinta y **sombra dura desplazada** (naranja en el botón principal, tinta
  en los secundarios) que se levantan al pasar el mouse y se hunden al tocarlas; tarjetas blancas con borde y
  sombra dura; campos con borde de tinta y sombra naranja al enfocar.
- **Espaciado:** una escala (múltiplos de 4 px). Pantallas interiores con `page-y`; secciones de la landing con
  `section-y`: 96 px en el celular y 160 px en escritorio.
- **Movimiento:** marquee de nichos, degradado que deriva en el hero y reveals al hacer scroll, todo con CSS.
  Con "reducir movimiento" se detiene todo, y sin soporte del navegador el contenido simplemente está (nunca
  queda oculto).
- La landing `/` ya no usa este sistema: desde el M4-rev tiene el suyo (siguiente sección).

## Landing (v2 · M4-rev, referencia superhuman.com; 13.16: branding Payfolio)

`app/(landing)/`: mismo `/`, con su propio layout, su propia fuente (solo Inter) y su propio CSS, así el interior
del studio no cambia y la landing no descarga lo que no usa. **El producto se llama Payfolio** (13.16): la landing
es la del producto, con navegación propia mínima (sin la navbar de Supercreador).

- **Cuatro bloques:** hero (con byline "Payfolio by Supercreador") → roadmap "For you page" → **"Esto es parte
  de Supercreador"** (misión del hub + carta del fundador; el texto de la carta lo provee el dueño: placeholder
  marcado `TODO-DUEÑO`) → cierre con la **captura de correo del programa piloto**. Navegación fija mínima
  (Roadmap, Piloto, Acceso y el CTA) y footer del producto.
- **Header del producto** (`PayfolioLockup` en `landing-chrome.tsx`): wordmark "Payfolio" + byline "by Supercreador".
  `/acceso` y `/crear` siguen usando el header/footer de Supercreador (prop `brand`, default `"supercreador"`).
- **Footer del producto:** "Hecho por [Supercreador](https://supercreador.tech) — el hub para creadores de contenido"
  + link "Entrar". Conserva el mark de la sonrisa para que la carita viajera tenga dónde aterrizar.
- **Minimalismo premium:** Inter en pesos medios y capitalización de frase (H1 60 px en escritorio, 38 px en el
  celular), eyebrows en mayúsculas chicas, contenedor de 1200 px, botones píldora de 48 px, un solo botón sólido
  por bloque y el secundario como link de texto ("Ver cómo funciona ›").
- **Hero (copy aprobado, sin eyebrow):** H1 "Dale superpoderes a tu marca personal" y sub
  "Convierte tu Instagram en un portafolio web profesional, listo para enviar a las marcas". "superpoderes"
  lleva `<ElectricWord>`: chispitas dibujadas a mano en la tinta del sistema (un rayito y un estallido de tres
  trazos en las esquinas de arriba, por encima de las minúsculas vecinas) que parpadean cada tanto.
  "profesional" va sin efectos.
- **Chispa protagonista:** en el hero, la **carcajada** (el grin con dientes). En el celular es el bloque visual
  del hero: centrada arriba, a 160 px, con 59 px entre su mentón y el titular; debajo, H1, subtítulo y CTA
  centrados, con el CTA a la vista. En tablet y
  escritorio, dos columnas (copy y columna visual): la cara (300 px) arriba presentando la mini-mock, que pasa
  por delante y tapa apenas el borde de la sonrisa.
- **Chispa acompañante** (`components/mascot/mascot-companion.tsx`): cuando la cara del hero sale de pantalla,
  Chispa baja con quien lee (en tablet y escritorio, a 190 px, centrada en vertical en una columna derecha
  angosta junto al contenido; en el celular, en una burbuja abajo a la derecha) y cambia de expresión por tramo: guiño (título de Cómo funciona),
  sorprendida, pícara y estrella (un paso cada una) y carcajada (el cierre). Las caras llegan dibujadas desde el
  servidor; el JS solo elige cuál se ve (IntersectionObserver). La carcajada de la acompañante reusa la del hero
  con `<use>` de SVG, sin repetir sus trazos.
- **Con "reducir movimiento"** todo queda quieto: sin acompañante, sin parpadeo ni sonrisa que respira y sin
  chispitas animadas.
- **Captura de correo** (`components/landing/pilot-signup.tsx` → `POST /api/piloto`): valida el correo, lo guarda
  normalizado en el Blob store privado (`pilot-signups/<hash>.json`, uno por correo: repetirlo no duplica) y
  tiene una trampa para bots. No envía correos: el dueño revisa la lista en el Blob store (DEPLOY.md).
- **Sistema de expresiones de Chispa (para el studio):** `<Chispa expression="…" />`, en
  `components/mascot/chispa.tsx`. Son los 6 renders finales del dueño (Figma), vectorizados pieza por pieza con
  potrace, sin redibujar, en la tinta del sistema. En cada cara los ojos parpadean y la boca respira.

  | Expresión | Cuándo usarla |
  | --- | --- |
  | `sonriente` | Bienvenidas (la de por defecto del componente) |
  | `guino` | "Portafolio listo" y otros logros |
  | `estrella` | Celebrar: un ER alto, publicar o compartir por primera vez |
  | `picara` | Tips y sugerencias ("confirma tus nichos", "prueba otra plantilla") |
  | `sorprendida` | Errores y avisos (perfil privado, importación fallida, link que no existe) |
  | `carcajada` | Hero de la landing y confirmaciones alegres (link copiado, cambios guardados); sus ojos ya están cerrados |

  **Encuadre común:** lienzo cuadrado (`MASCOT_SIZE` = 330), misma escala para las 6 (la nariz en "c" es el ancla)
  y cada cara centrada por su tinta con al menos 10 % de aire por lado; cambiar de expresión en el mismo lugar no
  hace saltar la cara. Las 6 caras más su CSS suman 9,65 KB; en la landing viajan 8,9 KB.
- **Nada inventado:** sin logos, testimonios ni contadores.
- **Contraste ≥ 7:1** en todo texto, incluidos los de la mini-mock y el formulario sobre el bloque de color.

## Plantillas y paletas (v2 · M2)

Las 4 plantillas dibujan **los mismos datos** con otra piel; cambiar de una a otra nunca toca el contenido.
Todas comparten el filtro de nichos con URL propia, `noindex`, container queries y reveals solo con CSS.

| Plantilla | Referencia | Qué la distingue |
| --- | --- | --- |
| **Creator** (recomendada) | Starlet | La descrita arriba: foto grande, cifras, carrusel oscuro, "Hablemos" monumental. |
| **Bio** | Linkpro | Una columna centrada estilo link-in-bio, banner con degradado que deriva despacio, ER bajo el nombre, contacto en botones a todo el ancho, trabajo como tarjetas y **los nichos en una barra flotante abajo**. |
| **Minimal** | Kima | En escritorio, **columna izquierda fija** (quién es, "Disponible para colaborar", cifras, servicios numerados, contacto) y mosaico del trabajo a la derecha; fotos en grises que toman color al pasar el mouse (a color en el celular). |
| **Editorial** (la cuarta, propuesta) | Ritmo tipográfico de Portvio y Nairo | Página oscura del color profundo de la paleta, el nombre en mayúsculas a tamaño display, el ER enorme junto a la propuesta de valor y el trabajo como lista numerada de revista. |

**Paletas** (`lib/palette/palettes.ts`): 5 curadas (Crema y acero, Terracota, Salvia, Rosa empolvado,
Grafito) y una **"de su foto"**. Al guardar cualquier imagen se calcula su color dominante (`swatch`, en
`lib/palette/extract.ts`: el tono con más presencia, sin grises, negros ni blancos) y la paleta sale de ese color.
Cada paleta llena los mismos tokens (`--pf-bg`, `--pf-ink`, `--pf-work`…) y cada par de texto/fondo que usan
las plantillas está listado en `CONTRAST_RULES`: las curadas cumplen ≥ 7:1 y la de la foto **se corrige sola**
(aclara u oscurece cada color) hasta cumplirlo. La barra del navegador (`theme-color`) toma el fondo de la
plantilla y la paleta.

**Galería con mockups** (`components/design/design-pickers.tsx`): SVG estáticos dibujados a mano, uno por
plantilla, con los colores de la paleta elegida. Nítidos en cualquier pantalla, sin datos reales ni llamadas.
Se usan al importar, en el modal y en el editor (sección "diseño.", con la vista previa al instante).

## Engagement Rate (v2 · M2)

La métrica principal del portafolio (`lib/portfolio/engagement.ts`):

**ER = (me gusta + comentarios + compartidos + guardados) ÷ vistas**, en %.

- Instagram no publica compartidos ni guardados, así que con lo que trae la importación el ER suma me gusta +
  comentarios, **y lo dice**: cada ER lleva su base visible, p. ej. "(me gusta + comentarios) ÷ vistas · 4 reels".
- Se calcula sobre la suma de los reels con vistas (al menos 2). Sin reels, sobre seguidores (al menos 100
  seguidores y 3 publicaciones), y la etiqueta dice "÷ seguidores". Sin datos suficientes, no hay ER.
- Es un **dato del modelo**, no un texto de la plantilla: se guarda al generar en `insights.engagementRate`
  (`rate`, `basis`, `interactions`, `sample`, `sampleKind`) y `describeEngagementRate()` arma los textos. Así
  un futuro pool de creadoras puede mostrarlo junto al nombre leyendo un solo campo.
- Reemplaza al "engagement sobre seguidores" que la plantilla Creator mostraba en el M1.

## Nichos (v2)

- **Los nichos confirmados por el creador mandan** (v2 · M2): se guardan en `manual.niches` y deciden las
  píldoras y los links; lo que sugirió la IA queda en `generated.niches` solo como referencia. El slug de cada
  nicho sale de su nombre (seguro para URL, nunca "todo"). Cambiar nichos ya compartidos llega con el editor
  del M3, que avisará antes de romper un link.
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
| `NEXT_PUBLIC_PILOT_URL` | Opcional: link "Únete al programa piloto" en `/acceso` para quien no tiene clave (formulario, `https://wa.me/…` o `mailto:`) | Tú. La landing ya tiene su propia captura de correo |

En Vercel van en **Settings → Environment Variables**. El Blob store agrega sus propias credenciales al
conectarlo (ver abajo): no hay que copiarlas.

## Almacenamiento

- **Vercel:** un Blob store **privado** (Storage → Create → Blob → acceso *Private*, y conectarlo al
  proyecto). Guarda un JSON por portafolio en `portfolios/<slug>.json`, las imágenes en `media/` y, desde el
  M2, los borradores de importación en `drafts/<id>.json` (se crean al importar y se marcan al generar).
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

**v2 · M2** (sigue siendo `schemaVersion: 2`; todo lo nuevo es opcional y los documentos anteriores se leen igual):

- `design: { template, palette }` — `creator | bio | minimal | editorial` y `auto | crema | terracota | salvia |
  rosa | grafito`. Sin campo: Creator + Crema y acero, que es como se veía en el M1.
- `insights: { engagementRate, computedAt }` — el ER guardado al generar. Sin campo, se calcula al leer desde
  la captura de Instagram.
- Las imágenes suman `swatch` (color dominante `#rrggbb`) para la paleta "de su foto".

## API (protegida con la clave)

Desde scripts, manda la clave en el encabezado `x-creator-key`. Desde la app, la sesión viaja en una cookie.

| Método   | Ruta                     | Qué hace                                                  |
| -------- | ------------------------ | --------------------------------------------------------- |
| `POST`   | `/api/session`           | Entra con `{ key }` y guarda la cookie de sesión          |
| `DELETE` | `/api/session`           | Sale                                                      |
| `POST`   | `/api/import`            | Importa `{ instagram }`; responde el progreso como NDJSON y termina con el borrador (`draft`) |
| `POST`   | `/api/piloto`            | Anotarse al programa piloto desde la landing: `{ email }` (pública; 201 nuevo, 200 si ya estaba) |
| `POST`   | `/api/import/confirm`    | Genera desde el borrador: `{ draftId, niches: [{ label }], pieceNiches, design }` (201; 200 si ya estaba) |
| `POST`   | `/api/media`             | Sube una imagen (multipart, campo `file`, máx. 4 MB)      |
| `POST`   | `/api/video-cover`       | Trae y guarda la portada de un video: `{ url }`           |
| `POST`   | `/api/portfolios`        | Crea un portafolio a mano                                 |
| `GET`    | `/api/portfolios/<slug>` | Lee el portafolio completo y lo que se muestra            |
| `PATCH`  | `/api/portfolios/<slug>` | Edita: `{ revision, manual?, pieces?, design? }` (solo `design` = cambiar la piel) |
| `GET`    | `/media/<archivo>`       | Sirve una imagen (pública)                                |

## Prueba de humo

Con `npm run dev` corriendo, en otra terminal:

```bash
npm run smoke
```

Prueba la API, la sesión, el editor, la página pública y sus links por nicho (incluido el caché) y las
validaciones de importación y portadas **sin gastar saldo** (nunca llama a Apify ni a Groq). Incluye la
pieza 6 (Media kit, Brand partners, Case studies) vía `npm run smoke:mediakit` (22 checks; corre dentro de
`npm run smoke`). Lo nuevo del M4-rev (la landing): byline "Payfolio by Supercreador", cuatro bloques (hero,
roadmap, "Esto es parte de Supercreador", cierre) y ninguna de las secciones quitadas; navegación fija; el copy aprobado del hero; las chispitas en "superpoderes" y "profesional" sin
efectos; la carcajada en el hero y la acompañante con sus 5 expresiones en orden por tramo; Chispa por debajo de 10 KB en
la página; con "reducir movimiento" todo quieto; la captura de correo y su API (correo inválido 400, alta 201, repetido 200,
trampa para bots, archivo en `pilot-signups/`); el encuadre de las 6 expresiones (lienzo común, centradas, ≥ 10 % de aire,
misma escala); y una sola fuente, sin el sistema del studio. Del M4: `/crear` pide sesión y vuelve después del acceso; con sesión `/acceso` lleva a
`/crear`; la landing abre sin sesión con su hero de ejemplo, los 3 pasos, el ejemplo con las 4 plantillas y el CTA
del piloto, `noindex` y un solo H1; y los 16 pares de texto del sistema del studio, leídos del CSS servido,
llegan a 7:1. Del M2: Lo nuevo del M2: color dominante al subir una foto; crear a mano con plantilla y paleta; un
borrador de importación escrito en `.data/drafts/` que se confirma renombrando, desmarcando y agregando
nichos; el ER con su base; generar dos veces sin duplicar; píldoras y links según los nichos confirmados (el
desmarcado da 404); cambiar el diseño sin tocar ningún otro dato; `theme-color` por paleta y en Editorial; y
los errores 400/401/404/410 al confirmar. Del M1 siguen: píldoras y filtro, nichos sin piezas, 404 de nichos ajenos, servicios, noindex y theme-color, y dos
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
| `app/(landing)/`                    | Landing `/` (M4-rev): su layout (solo Inter) y su CSS (`landing.css`, con la animación de Chispa) |
| `app/(studio)/`                     | El studio: `acceso/`, `crear/` (importar), `crear/manual/`, `editar/[slug]/`; su layout trae sus fuentes y activa su sistema visual |
| `app/p/layout.tsx`, `app/portfolio.css` | Zona pública: solo DM Sans, tokens de paleta, lo compartido y la plantilla Creator |
| `app/portfolio-templates.css`       | Plantillas Bio, Minimal y Editorial                            |
| `app/p/[slug]/`, `app/not-found.tsx` | Página pública (general y `[niche]/`) y 404 en español         |
| `app/api/…`, `app/media/…`          | API y entrega de imágenes                                       |
| `components/`                       | Piezas de interfaz; `public-portfolio.tsx` elige la plantilla, `import-screen.tsx` orquesta la importación, `import-review.tsx` es el paso nichos → plantilla → paleta y `ready-dialog.tsx` el modal "Portafolio listo" |
| `components/portfolio/`             | Las 4 plantillas, `template-kit.tsx` (lo que comparten), filtro de nichos, flechas del carrusel e íconos |
| `components/design/`                | Mockups SVG y selectores de plantilla y paleta                  |
| `components/landing/`               | Mini-mock del hero y captura de correo del piloto               |
| `components/brand/`                 | La marca: la sonrisa de Chispa (`SupercreadorMark`)             |
| `app/icon.svg`, `app/apple-icon.png` | Favicon (interior simplificado a 3 líneas / 4 dientes) y avatar de 180 px |
| `components/electric-word.tsx`      | Palabra con chispitas de electricidad hechas a mano (hero)      |
| `components/mascot/`                | Chispa: las 6 expresiones en SVG, su sistema, su animación y la acompañante de la landing |
| `components/editor/`                | Formulario, vista previa, piezas, subida de fotos               |
| `lib/instagram/`                    | Link → usuario, Apify, copia de imágenes, selección de posts    |
| `lib/ai/groq.ts`                    | Textos con IA                                                   |
| `lib/import/`                       | Orquestación de la importación, eventos de progreso y borradores (`draft.ts`) |
| `lib/palette/`                      | Paletas con reglas de contraste y color dominante de las fotos  |
| `lib/portfolio/`                    | Modelo, diseño, Engagement Rate, slugs, nichos, stats, servicios sugeridos, metadatos, precedencia, contacto, guardado |
| `lib/fonts/`                        | Fuentes de la herramienta y de la página pública, por separado  |
| `lib/storage/`                      | Blob privado (Vercel) y disco (local)                           |
| `lib/pilot.ts`                      | Lista de espera del programa piloto (validación y guardado)     |
| `lib/site.ts`                       | Links opcionales de la landing (programa piloto, portafolio real) |
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
- [x] M2 · 4 plantillas (Creator, Bio, Minimal, Editorial), galería con mockups, paletas, confirmación de
  nichos antes de generar y Engagement Rate como métrica principal
- [x] M4 · Rediseño del studio: landing con hero que muestra una landing de creadora, acceso, flujo de creación
  y editor en un solo sistema (Anton en mayúsculas, crema, tinta, acento #FC3300, píldoras con sombra dura)
- [x] M4-rev · Redo de la landing `/` (referencia superhuman.com): minimalismo premium y la mascota Chispa
- [ ] M3 · Separación de CSS por zona, videos inline (facade), editor serio con arrastrar y soltar, nicho "Otro"
- [ ] M5 · Plantillas como datos (JSON) + admin interno

Orden de construcción: M2 → M4 → M4-rev → M3 → M5.

**Deuda técnica consciente (no construir ahora):** el sistema de diseño vive duplicado entre
`portfolio-builder` y `supercreador-muse`. Evaluar monorepo (Turborepo) o paquete compartido de tokens al
llegar a 3 herramientas o al primer ingreso recurrente.
