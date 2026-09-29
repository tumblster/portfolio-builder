import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { PortfolioEditor } from "@/components/editor/portfolio-editor";
import { SiteHeader } from "@/components/site-header";
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
      <SiteHeader showLogout={access.status === "ok"} wide />
      <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-16 sm:px-8 sm:pt-16">
        <h1 className="text-5xl sm:text-7xl">llenarlo a mano.</h1>
        <p className="mt-5 max-w-prose text-muted sm:text-lg">
          Llena los datos de tu clienta: la vista previa se actualiza mientras escribes.
        </p>
        {access.status === "not-configured" ? (
          <ConfigNotice message={access.message} />
        ) : (
          <PortfolioEditor mode="create" />
        )}
      </main>
    </>
  );
}
