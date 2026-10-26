# Instrucciones de Copilot para `portfolio-builder`

## Objetivo del producto
- Mantener y mejorar el **Portfolio Builder** de Supercreador para crear portafolios UGC desde Instagram o de forma manual.
- Priorizar experiencia mobile-first, claridad del flujo (`/acceso` → `/crear` → `/editar/[slug]`) y estabilidad de la publicación pública (`/p/[slug]`).

## Stack y comandos base
- Runtime: **Node.js 20.9+**
- Framework: **Next.js App Router** con TypeScript y React.
- Instalar dependencias: `npm install`
- Desarrollo local: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`

## Reglas de implementación
- Todo el trabajo debe hacerse en la rama `v2-m4-rev`; no trabajar ni aplicar cambios en `main`.
- Hacer cambios **mínimos y enfocados** al requerimiento; evitar refactors amplios no solicitados.
- Reutilizar componentes y utilidades existentes en `components/` y `lib/` antes de crear nuevos.
- Mantener nombres y textos de UI en español cuando correspondan al producto actual.
- No escribir nombres de creadoras reales en el código ni en comentarios.
- No romper rutas ni contratos de API existentes en `app/api/**`.
- Conservar la separación entre vistas:
  - Landing en `app/(landing)/`
  - Studio en `app/(studio)/`
  - Público en `app/p/`
- Para cambios visuales, respetar tokens y estilos existentes en `app/globals.css` y estilos de cada sección.

## Calidad y validación
- Ejecutar como mínimo `npm run lint` tras cambios de código.
- Si hay cambios que puedan afectar build/routing, ejecutar también `npm run build`.
- No introducir secretos ni credenciales en el repositorio.
- Mantener o mejorar accesibilidad (contraste, foco visible, navegación por teclado).

## Archivos y datos
- No subir ni depender de datos locales de `.data/`.
- Mantener `.env.example` como referencia sin valores sensibles.
- Evitar cambios en storage/import si no son parte explícita del requerimiento.
