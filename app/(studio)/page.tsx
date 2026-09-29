import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { ImportScreen } from "@/components/import-screen";
import { SiteHeader } from "@/components/site-header";
import { getCreatorAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nuevo portafolio",
  robots: { index: false, follow: false },
};

/** Flujo principal: link de Instagram → portafolio automático. Exige la clave del creador. */
export default async function HomePage() {
  const access = await getCreatorAccess();
  if (access.status === "no-session") redirect("/acceso");

  return (
    <>
      <SiteHeader showLogout={access.status === "ok"} />
      <main className="mx-auto w-full max-w-2xl px-5 pt-10 pb-16 sm:px-8 sm:pt-16">
        <h1 className="text-5xl sm:text-7xl">de instagram a portafolio.</h1>
        <p className="mt-5 max-w-prose text-muted sm:text-lg">
          Pega el perfil de tu clienta: leemos su foto, bio y publicaciones, la IA escribe los textos y recibes el
          link para compartir.
        </p>
        {access.status === "not-configured" ? <ConfigNotice message={access.message} /> : <ImportScreen />}
      </main>
    </>
  );
}
