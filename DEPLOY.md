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

No crees `STORAGE_DRIVER` en Vercel: allá usa Blob solo.

## 5. Primer deploy y prueba

1. **Deploy** (o push a `main`). Cada push a `main` publica en producción; cada rama o pull request crea un
   deploy de prueba (Preview) que usa su propio store.
2. Abre `https://<tu-proyecto>.vercel.app/acceso` y entra con la clave A.
3. Importa un perfil real (unos US$0,003) y abre el link en tu celular, fuera de la sesión.
4. Prueba "Prefiero llenarlo manual", "Editar", los 4 links con "Copiar" y el cambio de nicho.

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
| 2. El cambio Belleza / Lifestyle / Viajes se ve instantáneo y distinto | ✓ | La vista previa cambia al tocar: color, titular y orden. Lifestyle comparte el violeta de la versión general (§7.2): se distingue por titular y orden. |
| 3. El link abre perfecto en el celular, sin login | ✓ | 360–390 px sin scroll lateral. Medido como primera visita con red Slow 4G y CPU de celular (4×): se ve completa en 1,0 s (versión Belleza: 0,66 s). Repite la medición con PageSpeed Insights sobre el dominio real. |
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
