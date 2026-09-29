import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { ImportScreen } from "@/components/import-screen";
import { SiteHeader } from "@/components/site-header";
import { getCreatorAccess } from "@/lib/auth";

// Depende de la cookie de sesión: se decide en cada visita.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nuevo portafolio",
  robots: { index: false, follow: false },
};

/** Crear (v2 · M4 lo movió aquí desde "/", que ahora es la landing): pegar el Instagram → revisar → generar. */
export default async function CreatePage() {
  const access = await getCreatorAccess();
  if (access.status === "no-session") redirect("/acceso?next=/crear");

  return (
    <>
      <SiteHeader showLogout={access.status === "ok"} />
      <main className="page-y mx-auto w-full max-w-3xl px-5 sm:px-8">
        <p className="eyebrow">Nuevo portafolio</p>
        <h1 className="title-1 mt-5">De Instagram a portafolio</h1>
        <p className="lead mt-5 max-w-prose">
          Pega el perfil de tu clienta. Leemos su foto, bio y publicaciones, la IA propone nichos y textos, tú
          confirmas y eliges cómo se ve.
        </p>
        {access.status === "not-configured" ? <ConfigNotice message={access.message} /> : <ImportScreen />}
      </main>
    </>
  );
}
