import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessForm } from "@/components/access-form";
import { ConfigNotice } from "@/components/config-notice";
import { SiteHeader } from "@/components/site-header";
import { getCreatorAccess } from "@/lib/auth";
import { PILOT_URL } from "@/lib/site";
import { textLink } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acceso",
  robots: { index: false, follow: false },
};

/** Solo rutas internas ("/algo"); nunca "//otro-sitio.com". */
function safeNext(value: string | string[] | undefined): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : "/crear";
}

export default async function AccessPage({ searchParams }: PageProps<"/acceso">) {
  const next = safeNext((await searchParams).next);
  const access = await getCreatorAccess();
  if (access.status === "ok") redirect(next);

  return (
    <>
      <SiteHeader />
      <main className="page-y mx-auto w-full max-w-3xl px-5 sm:px-8">
        <p className="eyebrow">Programa piloto</p>
        <h1 className="title-1 mt-5">Entra con tu clave</h1>
        <p className="lead mt-5 max-w-prose">
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
      </main>
    </>
  );
}
