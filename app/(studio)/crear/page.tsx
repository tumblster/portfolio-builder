import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { ImportScreen } from "@/components/import-screen";
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

/*
 * Crear (v2 · M4 lo movió aquí desde "/"): pegar el Instagram → revisar → generar.
 * r3 · 7: con el sistema visual de la landing (header de vidrio y footer, Inter Tight en los títulos, tarjetas
 * de borde fino, botones 3D y Chispa). Solo cambia la capa visual: la lógica y los pasos son los mismos.
 * TMJ no se usa aquí: no tiene í, ñ ni ¡, y los títulos de este flujo las necesitan.
 */
export default async function CreatePage() {
  const access = await getCreatorAccess();
  if (access.status === "no-session") redirect("/acceso?next=/crear");

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
            <h1 className="title-1 mt-4">De Instagram a portafolio</h1>
            <p className="lead mt-5 max-w-prose">
              Pega el perfil de tu clienta. Leemos su foto, bio y publicaciones, la IA propone nichos y textos, tú
              confirmas y eliges cómo se ve.
            </p>
          </div>
          <div className="order-first w-24 sm:order-none sm:w-full" aria-hidden="true">
            <Chispa expression="sonriente" className="mascot-static block h-auto w-full text-ink" />
          </div>
        </div>
        {access.status === "not-configured" ? <ConfigNotice message={access.message} /> : <ImportScreen />}
      </main>
      <LandingFooter />
    </div>
  );
}
