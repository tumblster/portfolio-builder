import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { PortfolioEditor } from "@/components/editor/portfolio-editor";
import { LandingFooter } from "@/components/landing/landing-chrome";
import { StudioHeader } from "@/components/studio-header";
import { getCreatorAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Llenar a mano",
  robots: { index: false, follow: false },
};

/** Fallback del flujo (RF-01, RF-02): llega aquí con lo que haya dejado la importación, si hubo. */
export default async function ManualFormPage() {
  const access = await getCreatorAccess();
  if (access.status === "no-session") redirect("/acceso?next=/crear/manual");

  return (
    <>
      <StudioHeader showLogout={access.status === "ok"} />
      <main className="mx-auto w-full max-w-6xl px-5 pt-28 pb-24 sm:px-8 md:pt-32">
        <p className="eyebrow">Nuevo portafolio</p>
        <h1 className="title-1 mt-5">Llénalo a mano</h1>
        <p className="lead mt-5 max-w-prose">
          Llena los datos de tu clienta: la vista previa se actualiza mientras escribes.
        </p>
        {access.status === "not-configured" ? (
          <ConfigNotice message={access.message} />
        ) : (
          <PortfolioEditor mode="create" />
        )}
      </main>
      <LandingFooter />
    </>
  );
}
