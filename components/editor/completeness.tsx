import { LIMITS } from "@/lib/portfolio/schema";
import type { FormState } from "./form-model";

/*
 * Spec 12.8 (gamificación, activación): "Tu portafolio está al X %" con lo que falta: foto, servicios, piezas y
 * WhatsApp. Se calcula en vivo con lo que hay en el formulario.
 */
export function Completeness({ form }: { form: FormState }) {
  const checks = [
    { label: "Foto", done: Boolean(form.photo) },
    { label: "Servicios", done: form.services.some((service) => service.title.trim()) },
    { label: `${LIMITS.minPieces}+ piezas`, done: form.pieces.filter((piece) => piece.image || piece.videoUrl.trim()).length >= LIMITS.minPieces },
    { label: "WhatsApp", done: Boolean(form.contact.whatsapp?.trim()) },
  ];
  const percent = Math.round((100 * checks.filter((check) => check.done).length) / checks.length);
  return (
    <section aria-labelledby="completitud" className="mb-8 rounded-card border border-line bg-paper p-4 sm:p-5" data-completeness={percent}>
      <h2 id="completitud" className="text-base font-semibold">
        Tu portafolio está al {percent} %
      </h2>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-sand"
        role="progressbar"
        aria-labelledby="completitud"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span className="block h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        {checks.map((check) => (
          <li
            key={check.label}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 ${check.done ? "border-ink" : "border-line text-muted"}`}
          >
            <span aria-hidden="true">{check.done ? "✓" : "○"}</span>
            {check.label}
            <span className="sr-only">{check.done ? ": listo" : ": falta"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
