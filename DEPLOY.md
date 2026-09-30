# Deploy y checklist de salida · Portfolio Builder

Cómo publicar en Vercel y qué revisar antes de usarlo en vivo con las vendedoras.
Tiempo estimado: 20 a 30 minutos.

## 1. Antes de empezar

- [ ] El código en GitHub (`portfolio-builder`), incluido `package-lock.json` (lo crea `npm install`).
- [ ] Una cuenta de Vercel (el plan Hobby alcanza).
- [ ] `APIFY_TOKEN` y `GROQ_API_KEY` a mano.
- [ ] Dos claves de acceso distintas, una para Producción y otra para Preview. Genera cada una con
      `openssl rand -base64 32`.

## 2. Crear el proyecto

1. vercel.com → **Add New → Project** → importa `portfolio-builder`. Vercel detecta Next.js: no cambies el
   comando de build ni la carpeta de salida.
2. Carga las variables del paso 4 antes del primer deploy. Si ya desplegó, cárgalas y redespliega
   (**Deployments → ⋯ → Redeploy**).

## 3. Dos Blob stores privados: Producción y Preview

Así, lo que pruebes en un deploy de prueba nunca toca los portafolios reales.

1. Proyecto → **Storage → Create → Blob**. Nombre `portafolios-produccion`, acceso **Private**. Al conectarlo
   al proyecto, deja marcado **solo Production** (desmarca Preview y Development).
2. Repite con `portafolios-preview`, acceso **Private**, conectado **solo a Preview**.
3. Revisa **Settings → Environment Variables**: `BLOB_STORE_ID` (y `BLOB_READ_WRITE_TOKEN`) deben aparecer una
   vez para Production y otra para Preview, con valores distintos.

- No conectes ninguno a Development. En tu compu la app guarda en `.data/`, y así `vercel env pull` nunca trae
  credenciales de producción a tu máquina.
- Si Vercel no te deja conectar el segundo store con el mismo prefijo de variables (`BLOB`), avísame: es un
  ajuste chico para que Preview lea otro prefijo.

## 4. Variables de entorno

| Variable             | Production                           | Preview                                        |
| -------------------- | ------------------------------------ | ---------------------------------------------- |
| `CREATOR_ACCESS_KEY` | clave A                              | clave B (distinta)                             |
| `APIFY_TOKEN`        | tu token                             | el mismo (o vacío si no vas a importar en pruebas) |
| `GROQ_API_KEY`       | tu key                               | la misma                                       |
| `BLOB_*`             | la pone el store de producción       | la pone el store de preview                    |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | el Sheet del piloto (§4.1)   | el mismo, u otro de pruebas                    |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | la cuenta de servicio (§4.1) | la misma                                       |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | su clave privada (§4.1) | la misma                                      |
| `GOOGLE_SHEETS_RANGE` (opcional) | `Piloto!A:C` si no está    | igual                                          |

No crees `STORAGE_DRIVER` en Vercel: allá usa Blob solo.

**Ojo con Preview (ronda 30/09 · 7.4 c):** la generación (`/api/import/confirm`) usa exactamente las mismas variables
que la importación: `CREATOR_ACCESS_KEY` y el Blob (`BLOB_READ_WRITE_TOKEN`, o el par `PREV_BLOB_READ_WRITE_TOKEN` +
`PREV_BLOB_STORE_ID` en Preview / `PROD_BLOB_*` en Producción). No usa Apify ni Groq. Para verificar qué ve cada
deployment, abre **`/api/import/health`** con la sesión iniciada (§4.2).

**Opcionales desde el M4** (landing del studio; se fijan en el build, así que después de cambiarlas hay que
volver a desplegar):

- `NEXT_PUBLIC_PILOT_URL`: a dónde lleva "Únete al programa piloto". Un formulario, un WhatsApp
  (`https://wa.me/51…`) o un `mailto:`. Solo se aceptan `https:` y `mailto:`. Sin ella, el CTA lleva a `/acceso`,
  que explica que durante el piloto se entra con clave.
- `NEXT_PUBLIC_EXAMPLE_PORTFOLIO_URL`: un portafolio real ya publicado (`https://…/p/<slug>`). Si está, la
  sección de plantillas de la landing muestra "Ver un portafolio real ›".

### 4.1 Correos del piloto → Google Sheets (ronda 30/09 · 8.4)

Los correos de "Únete al programa piloto" van a un Google Sheet (una fila por correo: fecha UTC, correo, origen).
Sin estas variables el sitio funciona igual en **modo mock**: la fila queda en el Blob store, carpeta
`pilot-sheet-mock/` (con `mock: true`), y la respuesta lo dice (`sink: "mock"`, cabecera `X-Pilot-Sink: mock`).

1. **Google Cloud** (console.cloud.google.com) → un proyecto → **APIs y servicios → Biblioteca** → habilita
   **Google Sheets API**.
2. **IAM y administración → Cuentas de servicio → Crear** (sin roles). En la cuenta: **Claves → Agregar clave →
   JSON**. Del JSON salen `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `private_key` →
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (pégala tal cual, con sus `\n`; el código los convierte).
3. **El Sheet:** crea una hoja nueva, nombra la pestaña **`Piloto`** y pon en la fila 1: `Fecha | Correo | Origen`.
   Compártela con el `client_email` como **Editor**. El id es la parte de la URL entre `/d/` y `/edit` →
   `GOOGLE_SHEETS_SPREADSHEET_ID`.
4. Carga las 3 variables en Vercel (Production y Preview) y **vuelve a desplegar**.
5. Prueba: `BASE=https://<tu-preview>.vercel.app npm run test:sheet` (con las mismas 3 variables en tu `.env.local`):
   envía un correo de prueba y verifica que la fila llegó al Sheet. Sin variables, verifica el modo mock.

Si Google rechaza la fila, el visitante ve "No pudimos guardar tu correo. Intenta de nuevo en un momento." (502) y
el correo **no** se marca como anotado: puede volver a intentarlo. En los logs: `"scope":"pilot.sheet"`.

### 4.2 Diagnóstico de la generación (ronda 30/09 · 7.4)

- **`GET /api/import/health`** (con sesión): por fase (sesión, importación, generación, Sheet del piloto), qué
  variables ve ESTE deployment (solo `true`/`false`, nunca los valores) y `missing` con lo que falta. Ábrelo en el
  Preview y en Producción y compáralos.
- **`GET /api/import/status?draftId=<id>`** (con sesión): estado del borrador — `pending`, `generating`, `stale`,
  `done` (con su link) o `failed` (con causa y hora). El `draftId` sale en los logs (`"scope":"import.confirm"`).
- **Qué cambió:** si la generación lanza una excepción, el borrador queda `failed` y el servidor responde un error
  terminal (`generation_failed`), nunca más 409. Si la escritura condicional del candado falla sin que otra petición
  lo haya tomado (el almacenamiento no respeta el etag: era la forma de tener un 409 eterno), queda `failed` con
  causa `storage_conflict`. El cliente reintenta los 409 a lo más 6 veces y corta a los 50 s con un error claro.
  "Generar portafolio" otra vez pide un reintento explícito.
- **Si ves `storage_conflict` en Preview:** es el almacenamiento, no el código ni una variable: revisa que el Blob
  store de Preview sea **privado** y esté conectado a Preview, y mándame el log de ese `draftId`.

## 5. Primer deploy y prueba

1. **Deploy** (o push a `main`). Cada push a `main` publica en producción; cada rama o pull request crea un
   deploy de prueba (Preview) que usa su propio store.
2. Abre `https://<tu-proyecto>.vercel.app/acceso` y entra con la clave A.
3. Importa un perfil real (unos US$0,003) y abre el link en tu celular, fuera de la sesión.
4. Prueba "Prefiero llenarlo manual", "Editar", el modal "Portafolio listo" (link general y de cada nicho,
   con "Copiar") y las píldoras de nicho en la página pública.

Los deploys de Preview piden iniciar sesión en Vercel (Deployment Protection). Es normal: son para ti.

## 6. Dominio `portafolios.supercreador.tech`

1. Proyecto → **Settings → Domains → Add** → `portafolios.supercreador.tech`.
2. Vercel te muestra un registro **CNAME propio de tu proyecto** (algo como
   `d1d4fc829fe7bc7c.vercel-dns-017.com.`). En tu proveedor de DNS crea:
   - Tipo `CNAME`, nombre `portafolios`, valor: el que muestra Vercel, copiado exacto (con el punto final si
     lo trae).
3. Espera la verificación: suele tardar minutos (hasta 24 h si había registros viejos). El certificado HTTPS
   se emite solo.
4. Comprueba con `npx vercel domains inspect portafolios.supercreador.tech`.
5. Desde ahí, crea y comparte desde `https://portafolios.supercreador.tech`: los links salen con el dominio
   desde el que entras. Opcional: en **Domains**, haz que el `.vercel.app` redirija al dominio propio.

## 7. Topes de gasto (antes de usarlo con las vendedoras)

Son obligatorios: sostienen la deuda aceptada de la sección 11 (sin límite de velocidad al importar).

- **Apify:** console.apify.com → Billing → Limits → tope mensual y alerta. Además, el código corta cada
  corrida en US$0,50.
- **Groq:** console.groq.com → Settings → Spend Limits → tope mensual.
- Como reusas estas keys en otro proyecto, los topes son compartidos: calcúlalos para los dos.
- **Vercel Hobby** no cobra: si se pasa de sus límites, restringe el servicio en vez de facturar.

## 8. Si algo sale mal: rollback

Vercel → **Deployments** → el último deploy bueno → **⋯ → Instant Rollback**. Tarda segundos. Los datos no
se tocan: viven en el Blob store, no en el deploy.

**Si vuelves del M2 al M1** (nota de compatibilidad):

- Los portafolios creados con el M2 **siguen abriendo** en el M1, pero todos se ven con Creator + Crema y acero
  (el M1 no conoce `design`) y con las cifras del M1 (engagement sobre seguidores en vez del ER).
- **Si se edita un portafolio mientras corre el M1, pierde su diseño:** el M1 guarda el documento sin los campos
  que no conoce (`design`, `insights` y el `swatch` de las imágenes). Nada más se pierde (textos, piezas,
  nichos y links quedan igual). Al volver al M2, ese portafolio abre con Creator + Crema y el ER se recalcula
  solo desde la captura de Instagram; hay que volver a elegir plantilla y paleta desde el editor.
- Una importación que quedó a medio confirmar al momento del rollback no se puede terminar en el M1 (no
  existe `/api/import/confirm`): se vuelve a importar. Sus borradores quedan en `drafts/` sin afectar nada.

## 9. Comandos

En tu compu:

```bash
npm install
cp .env.example .env.local        # en Windows: copy .env.example .env.local
npm run dev                       # http://localhost:3000
npm run smoke                     # en otra terminal, con dev corriendo
npm run build && npm run start    # prueba el build de producción, con caché
```

Vercel desde la terminal (opcional, sin instalar nada):

```bash
npx vercel login
npx vercel link                   # conecta la carpeta con el proyecto
npx vercel                        # deploy de prueba (Preview)
npx vercel --prod                 # deploy a producción
npx vercel env ls                 # variables por entorno
npx vercel domains inspect portafolios.supercreador.tech
```

## 10. Checklist de salida

### Criterios del §8 del PRD

| Criterio | Estado | Cómo se verificó o cómo verificarlo |
| --- | --- | --- |
| 1. Fer crea un portafolio completo en menos de 5 minutos en una llamada | ✓ | Importar tarda 30–60 s y deja todo listo; el editor permite ajustar. Ensáyalo cronometrando una llamada de prueba. |
| 2. El cambio de nicho se ve instantáneo y distinto | ✓ (v2) | Las píldoras filtran sin recargar y cambian la URL; cada nicho tiene su link. Verificado en Chromium (ver "Verificación v2 · M1"). |
| 3. El link abre perfecto en el celular, sin login | ✓ | 360–390 px sin scroll lateral. Primera visita con Slow 4G y CPU 4× (v2 · M1): LCP mediana 0,72 s, primera corrida en frío 1,06 s. Repite la medición con PageSpeed Insights sobre el dominio real. |
| 4. Una vendedora entiende qué es sin más de 2 frases | Pendiente | Solo se valida con ellas: pásale el link y pídele que te cuente qué ve, sin explicarle antes. |

### Checklist de arquitectura

| Ítem | Estado |
| --- | --- |
| Validación en el backend | ✓ Cada endpoint valida con zod; el formulario usa el mismo esquema antes de enviar. |
| Rol y pertenencia en cada endpoint | ✓ Un solo rol (creador, con clave); lo público es solo lectura. |
| Secretos solo en variables de entorno | ✓ Nada en el código, el frontend ni los logs; `.env.local` está fuera de git. |
| Rate limiting en el acceso y en lo que cuesta dinero | ⚠ **Deuda aceptada** (2026-09-28), ver sección 11. Una clave errónea espera 0,5 s y la clave tiene 256 bits; importar no tiene límite por hora y el gasto lo acotan el tope por corrida y los topes mensuales. |
| Toda entrada validada; sin inyección | ✓ No hay SQL. Las descargas externas usan lista de hosts permitidos y no siguen redirecciones. |
| Sin páginas o endpoints temporales sin autenticación | ✓ |
| Desarrollo y producción separados | ✓ Local en `.data/`; Blob de Producción y de Preview, con claves distintas (pasos 3 y 4). |
| Respaldos automáticos y probados | ⚠ **Deuda aceptada** (2026-09-28), ver sección 11. |
| Cifrado en tránsito | ✓ HTTPS en Vercel. En reposo depende de Vercel Blob: confírmalo en su documentación si se vuelve requisito. |
| Fechas en UTC | ✓ |
| Topes de gasto por proveedor | ⚠ Te toca: paso 7, obligatorio por la deuda de la sección 11. El tope por corrida de Apify ya está en el código. |
| Cuatro estados por pantalla | ✓ La página pública no tiene pantalla de carga a propósito: sale de la caché al instante y así un link inexistente responde 404. |
| Tests en cada push | ✓ GitHub Actions (`.github/workflows/ci.yml`): lint, tipos, build y prueba de humo. |
| Rollback | ✓ Paso 8. |
| IA con permisos mínimos y topes | ✓ Groq solo redacta texto (no ejecuta acciones): una llamada por importación, con respuesta acotada, y todo lo que escribe se puede editar. |
| Datos sensibles o regulados | No aplica: solo datos públicos de perfiles profesionales. La ubicación GPS de las fotos se borra. |

### Verificación v2 · M1

**Deploy: sin cambios.** Mismas variables de entorno, mismos stores de Blob y mismo dominio; no hay servicios
nuevos. Los portafolios guardados con la v1 se leen tal cual (sus links, incluidos `/belleza`, `/lifestyle`
y `/viajes`, siguen abriendo) y pasan a v2 cuando se editan. Las fuentes las descarga `next/font` de Google
en el build de Vercel, como siempre.

Después del deploy de Preview:

1. Importa un perfil real: se abre el modal "Portafolio listo" con el link general y los de cada nicho detectado.
2. Abre el link en el celular, fuera de la sesión: toca una píldora (filtra sin recargar y la URL cambia),
   usa "atrás", copia el link de un nicho y ábrelo en otra pestaña (abre ya filtrado).
3. Abre un link de la v1 ya compartido (`/p/<slug>/belleza`): sigue abriendo.
4. En `/editar/<slug>`: cambia el nicho de una pieza, agrega un servicio y guarda; la página lo muestra al instante.

Medición en desarrollo (build de producción local, Chromium 141, 360 px, Slow 4G: 150 ms RTT, 1,6 Mbps,
CPU 4×, 5 corridas en frío; la misma página `/p/valentina-ruiz` y las mismas condiciones para las dos versiones):

| Versión | LCP mediana | 1ª corrida | JS | CSS | Fuentes | Imágenes | HTML |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Base v1 (Fase 1, re-medida) | 776 ms | 1132 ms | 137,1 KB | 6,8 KB | 138,4 KB (3) | 152,9 KB | 5,9 KB |
| v2 · M1 | 716 ms | 1056 ms | 139,1 KB | 10,9 KB | 36,4 KB (1) | 60,8 KB | 7,0 KB |

Con un portafolio importado completo (stats, 6 piezas, servicios): 800 ms de mediana; con un link de nicho
(`/fitness`): 784 ms.

### Verificación v2 · M2

**Deploy: sin variables ni servicios nuevos.** Mismas variables de entorno, mismos stores de Blob y mismo
dominio. Lo único nuevo en el almacenamiento es el prefijo **`drafts/`** dentro del mismo Blob store (privado,
igual que `portfolios/` y `media/`): no hay que crear ni conectar nada. Los portafolios anteriores se leen
tal cual (sin `design` = Creator + Crema y acero, como en el M1) y sus links siguen abriendo. El rollback a M1
tiene una nota de compatibilidad (paso 8).

Después del deploy de Preview:

1. Importa un perfil real. Antes de generar: desmarca un nicho, renombra otro, agrega uno y mueve una pieza a
   él; elige una plantilla que no sea Creator y la paleta "de su foto". Genera: el modal muestra el ER bajo el
   nombre y los links de los nichos **confirmados**.
2. En el modal, "Cambiar plantilla o paleta" → otra combinación → Guardar. Abre el link en el celular, fuera
   de la sesión: se ve con el diseño nuevo, las píldoras son las confirmadas y el nicho desmarcado da 404.
3. Revisa el ER de la página: su base debe decir de dónde sale (p. ej. "(me gusta + comentarios) ÷ vistas ·
   6 reels").
4. En `/editar/<slug>`: sección "diseño." → otra plantilla y paleta; la vista previa cambia al instante.
   Guarda y comprueba que la página pública lo refleja y que no cambió ningún texto ni pieza.

Qué se verificó en desarrollo:

| Verificación | Resultado |
| --- | --- |
| Build, tipos y lint | Limpios |
| Prueba de humo (`npm run smoke`) | 91/91 (65 en el M1) |
| Contraste teórico (`CONTRAST_RULES`, 14 pares por paleta) | 5 curadas ≥ 7,39:1; paleta "de su foto" con 128 colores de prueba (todos los tonos, grises, muy oscuros, muy claros, tonos piel) ≥ 7,21:1 |
| Contraste medido en el navegador (cada texto visible contra su fondo real, 4 plantillas × 6 paletas, 360 px) | Todos ≥ 7:1; mínimo 7,42:1 ("Hablemos" en Creator/Terracota) |
| Recorrido en Chromium a 360 px | Importar → nichos (renombrar, desmarcar, agregar, mover pieza) → plantilla → paleta → generar → modal → cambiar diseño → página pública con el diseño y los nichos confirmados |
| Recorrido en Chromium en escritorio | Editor: cambiar plantilla y paleta re-renderiza la vista previa al instante y guardar persiste solo el diseño |
| Las 4 plantillas | Filtro por píldora sin recargar con URL propia; sin scroll horizontal en 360 px; columna fija de Minimal en escritorio |
| Regresión del M1 (recorrido de Chromium) | Sin fallas ni errores de React/hidratación |

Rendimiento, mismas condiciones que el M1 (build de producción local, Chromium, 360 px, Slow 4G: 150 ms RTT,
1,6 Mbps, CPU 4×, 5 corridas en frío, `/p/valentina-ruiz`):

| Versión | LCP mediana | 1ª corrida | JS | CSS | Fuentes | Imágenes | HTML |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v2 · M1 | 716 ms | 1056 ms | 139,1 KB | 10,9 KB | 36,4 KB (1) | 60,8 KB | 7,0 KB |
| v2 · M2 | 832 ms (828 en otra serie) | 1432 ms | 141,2 KB | 14,5 KB | 36,4 KB (1) | 60,8 KB | 7,5 KB |

Por plantilla, con el portafolio importado completo (`/p/camila-demo`, M1 con Creator: 800 ms): Creator 872 ms,
Bio 856 ms, Minimal 816 ms, Editorial 800 ms. La mediana sigue bajo 1 s, pero **subió ~100 ms** y la primera
carga en frío subió más de lo que explica el CSS extra (+3,6 KB: las 4 plantillas viajan en una sola hoja, que
también necesita la vista previa del editor). La causa de la primera carga no quedó aislada en el sandbox:
**revísalo en el Preview** con un celular real o con Speed Insights. Si se confirma, la mejora prevista es
servir solo el CSS de la plantilla del portafolio en la página pública.

### Verificación v2 · M4

**Deploy:** mismas variables obligatorias, mismos stores y mismo dominio; hay dos variables **opcionales** nuevas
(paso 4). **Cambia una ruta:** `/` ahora es la landing pública del producto y la pantalla de importar pasó a
`/crear`. Quien tenga guardado el link de la raíz llega a la landing, y "Entrar" lo lleva a `/crear` (si ya
tiene sesión, sin pedir la clave). No hay cambios en los datos: un rollback a M2 es seguro.

Después del deploy de Preview:

1. Abre `/` en el celular, sin sesión: el hero muestra la landing de ejemplo (sin explicar la herramienta), el
   marquee corre, los 3 pasos aparecen al hacer scroll y "Únete al programa piloto" baja a su sección.
2. "Entrar" → clave → `/crear`. Importa un perfil y recorre nichos, plantilla, paleta y el modal: todo con el
   mismo sistema (títulos en mayúsculas, píldoras con sombra dura).
3. `/editar/<slug>` y `/crear/manual`: las secciones Datos, Piezas, Servicios, Contacto y Diseño con títulos
   display; guarda un cambio.
4. Con "reducir movimiento" activado en el sistema, el marquee y el degradado quedan quietos.

Qué se verificó en desarrollo:

| Verificación | Resultado |
| --- | --- |
| Build, tipos y lint | Limpios |
| Prueba de humo (`npm run smoke`) | 101/101 (91 en el M2) |
| Contraste de los tokens del studio (16 pares de texto, leídos del CSS servido) | Todos ≥ 7:1; mínimo 7,72:1 |
| Contraste medido en el navegador (cada texto visible contra su fondo real, también el del hero decorativo) | 18 pantallas (landing, acceso, crear, los 3 pasos de revisión, modal, manual y editor, en 360 px y 1280 px): todo ≥ 7:1, mínimo 7,72:1 |
| Jerarquía | En las 18 pantallas, todos los H1 y H2 en Anton y en mayúsculas; un solo H1 por pantalla |
| Sin scroll horizontal | 360 px y 1280 px en todas |
| Flujo completo en Chromium (360 y 1280) | Landing → CTA → acceso → `/crear` → nichos → plantilla → paleta → generar → modal → editor |
| Regresión M1 y M2 (recorridos de Chromium) | Sin fallas ni errores de React/hidratación; las 4 plantillas × 6 paletas siguen ≥ 7:1 |

Rendimiento (mismas condiciones de siempre: 360 px, Slow 4G, CPU 4×, 5 corridas en frío):

| Página | LCP mediana | 1ª corrida | CSS | Fuentes | JS |
| --- | --- | --- | --- | --- | --- |
| `/p/valentina-ruiz`, M2 | 832 ms | 1432 ms | 14,5 KB | 36,4 KB (1) | 141,2 KB |
| `/p/valentina-ruiz`, M4 | 924 ms | 1180 ms | 15,7 KB | 36,4 KB (1) | 141,2 KB |
| Landing `/`, M4 (3 corridas) | 1088 ms | 1040 ms | 14,8 KB | 90,8 KB (3) | 134 KB |

La página pública **no carga las fuentes del studio** (Anton e Inter), pero sí su CSS: `globals.css` es una sola
hoja para todo el sitio, así que el sistema del studio sumó 1,2 KB a cada portafolio, y la mediana subió ~90 ms
(sigue bajo 1 s; en el sandbox la variación entre series es de ±50 ms). **Pendiente recomendado antes del M3:**
que la zona pública cargue su propia hoja (solo sus plantillas y las utilidades que usa) y el studio la suya.
Eso devuelve lo que sumaron el M2 y el M4.

### Verificación v2 · M4-rev (landing)

**Deploy:** mismas variables obligatorias y mismas rutas; el interior del studio no cambió. La landing sigue con
`noindex`. Cambios:

- **Nuevo prefijo en el Blob store:** `pilot-signups/` (privado, como `portfolios/`): un JSON por correo anotado
  al programa piloto (`{ email, createdAt, source }`). Para ver la lista: Vercel → **Storage** → el Blob store →
  carpeta `pilot-signups/`. No hay que crear ni conectar nada. Son datos personales: no los compartas fuera del
  equipo y bórralos cuando el piloto termine.
- `NEXT_PUBLIC_EXAMPLE_PORTFOLIO_URL` ya no se usa (se quitó la sección de plantillas). `NEXT_PUBLIC_PILOT_URL`
  sigue siendo opcional y solo aparece en `/acceso`: la landing tiene su propia captura de correo.

- **Marca y favicon:** el favicon (`/icon.svg`) y el ícono de 180 px (`/apple-icon.png`) salen de `app/`; no hay
  nada que configurar. Aplican a todo el sitio: también a los portafolios públicos de las creadoras.

Después del deploy de Preview:

1. Abre `/` en el celular: arriba la carcajada de Chispa y, debajo, el titular, el subtítulo y el botón centrados y
   a la vista sin bajar; "superpoderes" tiene chispitas que parpadean cada tanto.
2. Baja despacio: Chispa aparece en una burbuja abajo a la derecha y cambia de cara (guiño, sorprendida, pícara,
   estrella y carcajada al llegar al cierre). En escritorio flota en el costado derecho.
3. En el cierre, anota un correo de prueba y revisa que aparezca en `pilot-signups/` del Blob store.
4. Con "reducir movimiento" activado en el sistema: nada se mueve y la acompañante no aparece.

Qué se verificó en desarrollo:

| Verificación | Resultado |
| --- | --- |
| Build, tipos y lint | Limpios |
| Prueba de humo (`npm run smoke`) | 128/128 (101 en el M4): marca, favicon y avatar; estructura, copy, chispitas, Chispa y su recorrido, peso, reducir movimiento, captura de correo y su API, encuadre de las 6 expresiones |
| Contraste medido en el navegador | 360 px: 37 textos; 1280 px: 40 textos; todos ≥ 7:1, mínimo 9,34:1 (incluye el formulario sobre el bloque de color) |
| Hero en 360 px | La cara es el bloque visual: 160 px, centrada (desvío 0 px), 59 px entre el mentón y el titular; H1, subtítulo y CTA centrados (CTA a 0 px del centro); el CTA termina en y = 560 (pantalla de 740). Sin eyebrow |
| Hero en 768 y 1280 px | Texto alineado a la izquierda. Dos columnas; en la visual, la cara (300 px en 1280) arriba y la mini-mock debajo, centradas entre sí, tapando 13 px de la sonrisa por delante; sin scroll horizontal |
| Recorrido de la acompañante | 360 y 1280 px: guiño → sorprendida → pícara → estrella → carcajada; en escritorio mide 190 px, está centrada en vertical (desvío 0 px) y a 42 px del contenido |
| Chispitas | Parpadean; no tocan la palabra vecina en 360, 768 y 1280 px |
| Captura de correo | Error visible con un correo mal escrito; alta confirmada desde el formulario; repetido no duplica |
| Reducir movimiento | 0 animaciones y sin acompañante |
| Peso de Chispa en la página | 8,9 KB (cara del hero + 5 del recorrido + su CSS) |
| Marca en el header (360 y 1280 px) | La sonrisa mide 30,0 × 54,1 px; con un diente de 14,7 px a esa escala, el aire es de 16 px hasta el wordmark, 17 arriba, 18 abajo y ≥ 20 hasta el borde |
| Favicon | Interior simplificado a 3 líneas de diente (4 dientes) y curva exterior idéntica. Pestaña real de Chromium (con ventana, bajo Xvfb) a 16 px: se reconoce la sonrisa con sus dientes, tenue porque el trazo del sistema queda en 0,6 px a ese tamaño; a 32 px (pestañas retina) se lee bien. Espacio de seguridad medido: 54 u (un diente) |
| Avatar | `apple-icon.png` de 180 × 180 px |

Rendimiento de la landing (360 px, Slow 4G, CPU 4×, 5 corridas en frío): **784 ms** de mediana (768–908 ms),
una sola fuente (47,4 KB), CSS 16,8 KB, JS 135 KB, HTML 10,3 KB.

### Verificación ronda 30/09 (secciones 7 y 8)

Hecho en local (build de producción con Turbopack + prueba de humo 154/154 + Chromium en 390 px y escritorio):

- **7.1 Chips:** autocompletado con la coincidencia resaltada; Enter agrega sin cerrar la lista; Backspace con el
  campo vacío quita el último chip; la × devuelve el foco al campo; Alt + flechas mueve el chip con foco (el foco lo
  acompaña); arrastre con el asa (mouse y toque); "De tu perfil" suma piezas como chips; el orden elegido llega
  tal cual al portafolio; botón flotante "Preview" → modal con "Sobre mí" y "Media kit" (cierra con Esc).
- **7.2 Métricas:** Seguidores, Interacciones promedio y ER, con su base, en la revisión y en el Media Kit.
- **7.3 Toggle:** SOBRE MÍ por defecto (sin métricas ni selector de nichos); MEDIA KIT con cabecera, las 3 métricas,
  plataformas, piezas destacadas, Sobre mí y "Trabaja conmigo"; `#media-kit` abre directo; los links por nicho
  siguen filtrando.
- **7.4 Bugfix:** con un 409 eterno simulado, el error terminal aparece a los 41 s (< 60 s); un fallo de generación
  deja el borrador `failed` y consultable; nunca más 409 para ese borrador salvo reintento explícito.
- **8.1–8.4:** hero que muta entre las 4 plantillas y 5 paletas; arcos eléctricos con turbulencia y flicker; tarjeta
  CTA negra; correo → Sheet (probado en modo mock; el modo real se prueba con `npm run test:sheet`).

**Para probar en el Preview (E2):** importar → chips (quita, agrega de "De tu perfil", reordena) → Preview →
plantilla → paleta → generar → modal; abrir el portafolio y cambiar a MEDIA KIT; `/api/import/health` sin
`missing`; y, con el Sheet creado, anotar un correo en la landing y verlo en el Sheet.

### Verificación ronda de feedback 2 (30/09 · spec 9.1–9.7, reels en línea y rayo)

Sin cambios de deploy (ninguna variable nueva). Hecho en local (build de producción con Turbopack, prueba de humo
159/159 y Chromium en 320–1280 px):

- **9.1** "¿Tienes un código? Accede aquí" bajo el botón del hero y "Acceso" en el navbar (a `/acceso`); sin
  desborde del navbar en 320, 360, 390, 768 y 1280 px (bajo 400 px el logo del header muestra solo la sonrisa).
- **9.2** El paso "Nichos y piezas" ya no tiene las fórmulas de las métricas ni la descripción de arriba.
- **9.3** Selector de nichos en orden alfabético con "Otro" al final: habilita un cuadro de texto al lado (misma
  fila), que agrega el nicho con Enter o "Agregar".
- **9.4** Barra de progreso de los pasos 1-2-3 en el navbar de `/crear` (Paso 1 de 3… Paso 2 de 3…).
- **9.5** Al editar un portafolio generado, lápiz en círculo blanco arriba a la derecha del banner: sube la foto,
  el banner cambia al instante, se guarda y la página pública la muestra (Creator, Editorial y Bio).
- **9.6** El botón dice "Elegir plantilla". **9.7** Plantilla y Paleta: el switch "Sobre mí | Media kit" cambia la
  vista previa en vivo.
- **Reels en línea (3.1 / 7.1):** hover en web y tap en móvil reproducen ahí mismo; al pasar a otro, el anterior
  se cierra (nunca dos a la vez); el segundo tap cae en el reproductor oficial, que pausa; la × o un toque fuera lo
  cierran; sin iframes en la carga inicial. **Instagram no permite autoplay en su embed:** se abre ahí y se toca
  para reproducir (TikTok y YouTube sí arrancan solos).
- **SOBRE MÍ** muestra las vistas de cada pieza; las cifras del perfil y el ER siguen en el Media Kit.
- **8.2** Electricidad en Brasa: 7 fotogramas de rayos quebrados con ramas, en ráfagas irregulares, con glow.

**Para probar en el Preview:** un reel de Instagram real (el embed se carga y se toca para reproducir), uno de TikTok
o YouTube si hay (arrancan solos, YouTube en silencio al hover), y subir una foto al banner desde `/editar/<slug>`.

## 11. Deudas aceptadas

Ítems del checklist de arquitectura que se decidió no cubrir en el piloto. Son decisiones conscientes, no
descuidos: cada una dice qué riesgo implica y cuándo hay que volver a revisarla.

### ⚠ Deuda aceptada: sin respaldos automáticos

- **Fecha:** 2026-09-28, al cerrar la Fase 1.
- **Qué se salta:** "Respaldos automáticos, y probados de verdad".
- **Riesgo concreto:** si el Blob store de producción se borra (por ejemplo, por error desde el dashboard de
  Vercel) o un bug pisa datos, se pierden los portafolios, sus fotos y las ediciones hechas a mano, sin forma
  de recuperarlos. Los links que las vendedoras ya compartieron con marcas darían 404.
- **Por qué se acepta:** es un piloto con 2 vendedoras. Un portafolio importado se rehace en un minuto; uno
  hecho a mano, en unos cinco.
- **Mitigación hoy:** el store de Preview está separado, así que las pruebas no tocan producción. No borrar ni
  reconectar el store de producción sin revisar antes qué contiene.
- **Revisar cuando:** haya más de 2 vendedoras, exista algún portafolio con ediciones a mano que no convenga
  rehacer, o antes de cobrar (v2 del roadmap), lo que ocurra primero.
- **Cómo se paga:** un script que descargue el store completo, una tarea semanal en GitHub Actions que lo
  corra y una restauración de prueba para confirmar que el respaldo sirve.

### ⚠ Deuda aceptada: sin límite de velocidad al importar

- **Fecha:** 2026-09-28, al cerrar la Fase 1.
- **Qué se salta:** "Rate limiting en todo lo que cueste dinero", en la importación desde Instagram. El acceso
  sí frena los intentos con clave equivocada.
- **Riesgo concreto:** si `CREATOR_ACCESS_KEY` se filtra (una captura de pantalla, un mensaje reenviado),
  alguien podría importar perfiles en loop: gastaría saldo de Apify y Groq hasta los topes mensuales, que se
  comparten con el otro proyecto que usa las mismas keys, y llenaría el almacenamiento de portafolios basura.
- **Por qué se acepta:** la clave tiene 256 bits y solo la conoce quien opera la herramienta; el gasto ya está
  acotado.
- **Mitigación hoy:** tope de US$0,50 por corrida de Apify (en el código) y topes mensuales en Apify y Groq
  (paso 7, obligatorios con esta deuda). Si la clave se filtra: cambiar `CREATOR_ACCESS_KEY` en Vercel y
  redesplegar; eso cierra todas las sesiones abiertas al instante.
- **Revisar cuando:** más personas conozcan la clave, existan cuentas de vendedoras (v1.2 del roadmap) o
  aparezca un gasto inesperado en Apify o Groq, lo que ocurra primero.
- **Cómo se paga:** un límite por hora (por ejemplo, 10 importaciones) guardado en Upstash Redis.

### ⚠ Deuda aceptada: los borradores de importación no se borran solos

- **Qué es:** cada importación deja un `drafts/<id>.json` en el Blob store (incluidas las que nunca se
  confirman). Al generar se marca como usado, pero no se borra.
- **Riesgo concreto:** ninguno para los datos; solo espacio. Un borrador medido pesa ~8.5 KB con 6
  publicaciones (uno real, con 12, del orden del doble): mil importaciones ocupan pocas decenas de MB.
- **Cuándo revisarla:** si el Blob store se acerca a su límite o al pasar del piloto. Solución prevista: una
  tarea programada que borre los borradores con más de 24 h (ya no se pueden confirmar).

### ⚠ Deuda aceptada: la captura de correo del piloto no tiene límite de velocidad

- **Qué es:** `POST /api/piloto` es pública; tiene validación y una trampa para bots, pero no limita cuántas veces
  se puede llamar.
- **Riesgo concreto:** un bot insistente podría llenar `pilot-signups/` de correos falsos (sin costo de APIs, solo
  espacio y ruido en la lista).
- **Cuándo revisarla:** si aparecen altas que no parecen personas. Solución prevista: límite por IP o
  Vercel Firewall.

### ⚠ Deuda aceptada: las filas del modo mock del piloto se copian a mano

- **Qué es:** mientras el Sheet no esté configurado, los correos quedan en `pilot-sheet-mock/` del Blob store.
- **Cuándo revisarla:** al configurar el Sheet (§4.1), copia esas filas una vez y bórralas del store.

### ⚠ Deuda aceptada: los registros de fallos de borradores no se borran solos

- **Qué es:** cada borrador fallido deja `drafts/<id>.failure.json` (se usa para el estado consultable).
- **Riesgo concreto:** ninguno más allá de espacio; son pocos bytes. Se limpian junto con los borradores viejos.
