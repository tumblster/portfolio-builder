import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessForm } from "@/components/access-form";
import { ConfigNotice } from "@/components/config-notice";
import { LandingFooter, LandingHeader, landingContainer } from "@/components/landing/landing-chrome";
import { Chispa } from "@/components/mascot/chispa";
import { getCreatorAccess } from "@/lib/auth";
import { PILOT_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acceso",
  robots: { index: false, follow: false },
};

/*
 * Acceso con clave (v2 · M4-rev r2, B8): vive con la landing (su layout, fuente y tokens) en vez del sistema del
 * studio. Header y footer de la landing, Chispa quieta y decorativa, y el botón primario 3D (en AccessForm).
 * La lógica es la de siempre: safeNext, getCreatorAccess y el redirect si ya hay sesión.
 */

/** Solo rutas internas ("/algo"); nunca "//otro-sitio.com". */
function safeNext(value: string | string[] | undefined): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : "/crear";
}

const textLink = "font-medium underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-ink";

export default async function AccessPage({ searchParams }: PageProps<"/acceso">) {
  const next = safeNext((await searchParams).next);
  const access = await getCreatorAccess();
  if (access.status === "ok") redirect(next);

  return (
    <>
      <LandingHeader base="/" />
      <main className={`${landingContainer} pt-28 pb-24 md:pt-40 md:pb-32`}>
        <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_16rem] md:gap-16 lg:grid-cols-[minmax(0,1fr)_18.75rem]">
          <div className="mx-auto w-full max-w-xl md:mx-0 md:max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">Programa piloto</p>
            <h1 className="mt-5 text-[2.375rem] leading-[1.06] font-medium tracking-[-0.03em] sm:text-5xl">Entra con tu clave</h1>
            <p className="mt-5 max-w-prose text-[1.0625rem] leading-relaxed text-muted">
              Durante el piloto, los portafolios se crean con una clave de acceso. Los links que compartes se abren sin
              clave.
            </p>
            <p className="mt-3 max-w-prose text-muted">
              ¿Aún no tienes la tuya?{" "}
              {PILOT_URL ? (
                <a href={PILOT_URL} className={textLink} target="_blank" rel="noopener noreferrer">
                  Únete al programa piloto
                </a>
              ) : (
                "Pídesela a tu contacto de Supercreador."
              )}
            </p>
            {access.status === "not-configured" ? <ConfigNotice message={access.message} /> : <AccessForm next={next} />}
          </div>
          <div className="order-first mx-auto w-40 md:order-none md:w-full" aria-hidden="true">
            <Chispa expression="sonriente" className="mascot-static block h-auto w-full text-ink" />
          </div>
        </div>
      </main>
      <LandingFooter />
    </>
  );
}
