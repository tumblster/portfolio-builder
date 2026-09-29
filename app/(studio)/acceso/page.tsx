import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessForm } from "@/components/access-form";
import { ConfigNotice } from "@/components/config-notice";
import { SiteHeader } from "@/components/site-header";
import { getCreatorAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acceso",
  robots: { index: false, follow: false },
};

/** Solo rutas internas ("/algo"); nunca "//otro-sitio.com". */
function safeNext(value: string | string[] | undefined): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : "/";
}

export default async function AccessPage({ searchParams }: PageProps<"/acceso">) {
  const next = safeNext((await searchParams).next);
  const access = await getCreatorAccess();
  if (access.status === "ok") redirect(next);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-5 pt-10 pb-16 sm:px-8 sm:pt-16">
        <h1 className="text-5xl sm:text-7xl">entra con tu clave.</h1>
        <p className="mt-5 max-w-prose text-muted sm:text-lg">
          Solo con la clave se crean portafolios. Los links que compartes se abren sin clave.
        </p>
        {access.status === "not-configured" ? <ConfigNotice message={access.message} /> : <AccessForm next={next} />}
      </main>
    </>
  );
}
