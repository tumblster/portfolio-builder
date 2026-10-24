import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { CreateOrigin } from "@/components/create-origin";
import { ImportScreen, type ImportSource } from "@/components/import-screen";
import { LandingFooter, LandingHeader } from "@/components/landing/landing-chrome";
import { LogoutButton } from "@/components/logout-button";
import { Chispa } from "@/components/mascot/chispa";
import { getCreatorAccess } from "@/lib/auth";
import { interTight } from "@/lib/fonts/inter-tight";
import "@/components/crear-brand.css";

// Depende de la cookie de sesión: se decide en cada visita.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nuevo portafolio",
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Parte 2 · 1: el origen elegido viaja en la URL (?origen=instagram|canva). "Desde cero" va a /crear/manual. */
function originFrom(raw: string | string[] | undefined): ImportSource | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "instagram" || value === "canva" ? value : null;
}

/*
 * Crear (v2 · M4 lo movió aquí desde "/").
 * r3 · 7: con el sistema visual de la landing (header de vidrio y footer, Inter Tight en los títulos, tarjetas de
 * borde fino, botones 3D y Chispa). TMJ no se usa aquí: no tiene í, ñ ni ¡.
 *
 * Parte 2 · 1: la puerta de entrada pregunta el origen con tres tarjetas (Instagram, Canva, desde cero). Elegido el
 * origen, el flujo es el de siempre (ImportScreen con esa fuente preseleccionada). La lógica interna no cambia.
 */
export default async function CreatePage({ searchParams }: PageProps) {
  const origin = originFrom((await searchParams).origen);
  const access = await getCreatorAccess();
  if (access.status === "no-session") {
    redirect(`/acceso?next=${encodeURIComponent(origin ? `/crear?origen=${origin}` : "/crear")}`);
  }

  return (
    <div className={`${interTight.variable} crear-brand`}>
      <LandingHeader
        base="/"
        // Barra de progreso de los pasos 1-2-3 (ajuste 6): la dibuja la revisión aquí, con un portal.
        below={<div id="crear-progress" />}
        nav={
          access.status === "ok" ? (
            <nav aria-label="Studio" className="flex items-center">
              <LogoutButton />
            </nav>
          ) : null
        }
      />
      <main className="mx-auto w-full max-w-3xl px-5 pt-28 pb-24 sm:px-8 md:pt-36 md:pb-32">
        <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_8.5rem] sm:gap-10">
          <div>
            <p className="eyebrow">Nuevo portafolio</p>
            <h1 className="title-1 mt-4">Crea tu portafolio</h1>
            {!origin && <p className="mt-2 text-lg text-muted">Elige cómo quieres empezar.</p>}
          </div>
          <div className="order-first w-24 sm:order-none sm:w-full" aria-hidden="true">
            <Chispa expression="sonriente" className="mascot-static block h-auto w-full text-ink" />
          </div>
        </div>
        {access.status === "not-configured" ? (
          <ConfigNotice message={access.message} />
        ) : origin ? (
          <ImportScreen key={origin} initialSource={origin} />
        ) : (
          <CreateOrigin />
        )}
      </main>
      <LandingFooter />
    </div>
  );
}
