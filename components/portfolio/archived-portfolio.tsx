import { Chispa } from "@/components/mascot/chispa";
import { SUPPORT_FORM_URL } from "@/lib/site";

/*
 * Spec 12.3: lo que muestra el link de un portafolio archivado (11.9): Chispa con la carita pensativa, "No disponible
 * temporalmente. Contacta a soporte" y el link al formulario de soporte. Los datos siguen guardados.
 */
export function ArchivedPortfolio() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#f5f5e7] px-6 py-16 text-center text-[#0e110b]" data-archived>
      <Chispa expression="pensativa" className="h-auto w-40 text-[#0e110b] sm:w-48" />
      <h1 className="max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">No disponible temporalmente</h1>
      <p className="max-w-sm text-base text-[#4b4e44]">
        Contacta a soporte.{" "}
        <a
          href={SUPPORT_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#0e110b] underline decoration-[#fc3300] decoration-2 underline-offset-4"
        >
          Ir al formulario de soporte<span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      </p>
    </main>
  );
}
