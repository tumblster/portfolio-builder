"use client";

import { useId, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { ImagePicker } from "@/components/editor/image-picker";
import { errorText, fieldLabel, pillButton, textInput } from "@/components/ui";
import { parseInstagramUsername } from "@/lib/instagram/username";
import { brandInitial, brandProfileUrl } from "@/lib/portfolio/brands";
import { BRAND_NAME_MAX, BRAND_PARTNERS_MAX, type BrandPartnerDraft } from "@/lib/portfolio/media-kit-drafts";
import type { StoredImage } from "@/lib/portfolio/schema";

/*
 * "Brand Partners" en el studio (ronda 6 · 13.19). Lo usan la revisión antes de generar (paso Servicios) y el editor.
 *
 * (a) Auto-detección: las @menciones de sus últimos 12 contenidos y de los links agregados llegan como chips. Una
 *     mención no prueba una colaboración: NINGUNA se agrega sola; la creadora toca las que fueron colaboraciones
 *     reales (ese toque es la confirmación). Solo lo confirmado aparece en el Media kit.
 * (b) Carga manual: nombre + link de su Instagram + logo (opcional), para marcas antiguas o no detectadas.
 *
 * Logo: al agregar una marca sin logo, se busca la foto de perfil de su Instagram (/api/brand-logo). Si no se
 * encuentra (sin crédito, cuenta privada…), queda la inicial y se puede subir el logo a mano o buscar otra vez.
 */

type Props = {
  partners: BrandPartnerDraft[];
  setPartners: Dispatch<SetStateAction<BrandPartnerDraft[]>>;
  /** Usuarios mencionados (sin @), en orden de relevancia. */
  detected: readonly string[];
  newKey: () => string;
  /** Subidas de logo en curso (+1 / -1), para no guardar a medias. */
  onPending?: (delta: 1 | -1) => void;
  /** Error de la sección (del servidor). */
  error?: string | null;
  /** Errores por campo: "brandPartners.0.name"… */
  errors?: Record<string, string>;
};

const noop = () => {};

export function BrandPartnersField({ partners, setPartners, detected, newKey, onPending = noop, error, errors = {} }: Props) {
  const uid = useId();
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [logo, setLogo] = useState<StoredImage | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const added = new Set(partners.map((partner) => partner.instagram));
  const candidates = detected.filter((handle) => !added.has(handle));
  const full = partners.length >= BRAND_PARTNERS_MAX;

  const patch = (key: string, change: Partial<BrandPartnerDraft>) =>
    setPartners((current) => current.map((partner) => (partner.key === key ? { ...partner, ...change } : partner)));

  async function lookupLogo(key: string, handle: string) {
    let found: StoredImage | null = null;
    try {
      const response = await fetch("/api/brand-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagram: handle }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.logo) found = data.logo as StoredImage;
    } catch {
      // Sin conexión: queda la inicial (se puede buscar otra vez o subirlo).
    }
    setPartners((current) =>
      current.map((partner) => {
        if (partner.key !== key) return partner;
        const logoNow = partner.logo ?? found;
        return { ...partner, logo: logoNow, lookup: logoNow ? undefined : "none" };
      }),
    );
  }

  function add(draft: Omit<BrandPartnerDraft, "key" | "lookup">): boolean {
    if (added.has(draft.instagram)) {
      setFormError("Esa marca ya está en la lista.");
      return false;
    }
    if (full) {
      setFormError(`Puedes mostrar hasta ${BRAND_PARTNERS_MAX} marcas.`);
      return false;
    }
    const key = newKey();
    setPartners((current) => [...current, { ...draft, key, lookup: draft.logo ? undefined : "loading" }]);
    if (!draft.logo) void lookupLogo(key, draft.instagram);
    setFormError(null);
    return true;
  }

  function addManual() {
    const brandName = name.trim();
    if (!brandName) {
      setFormError("Escribe el nombre de la marca.");
      return;
    }
    const parsed = parseInstagramUsername(link);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    if (add({ name: brandName.slice(0, BRAND_NAME_MAX), instagram: parsed.username, logo, source: "manual" })) {
      setName("");
      setLink("");
      setLogo(null);
    }
  }

  // Dentro del editor (un <form>), Enter agrega la marca en vez de guardar todo el portafolio.
  const onEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addManual();
  };

  function searchAgain(partner: BrandPartnerDraft) {
    patch(partner.key, { lookup: "loading" });
    void lookupLogo(partner.key, partner.instagram);
  }

  return (
    <div data-brand-partners>
      {candidates.length > 0 && (
        <div className="rounded-2xl border border-line bg-cream p-4 sm:p-5" data-brand-detected>
          <p className="text-sm leading-relaxed text-ink">
            <span className="font-semibold">Marcas mencionadas en las publicaciones.</span> Una mención no siempre es
            una colaboración: agrega solo las marcas con las que hubo un trabajo real.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {candidates.map((handle) => (
              <li key={handle}>
                <button
                  type="button"
                  onClick={() => add({ name: handle, instagram: handle, logo: null, source: "detected" })}
                  disabled={full}
                  className="inline-flex min-h-tap items-center gap-1.5 rounded-full border border-ink/60 bg-paper px-4 text-sm font-semibold text-ink hover:bg-highlight disabled:opacity-40"
                  data-brand-candidate={handle}
                >
                  <span aria-hidden="true">+</span>@{handle}
                  <span className="sr-only">: agregar como marca con la que trabajó</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {partners.length > 0 && (
        <ul className="mt-5 space-y-3" data-brand-list>
          {partners.map((partner, index) => {
            const nameId = `${uid}-${partner.key}-nombre`;
            const nameError = errors[`brandPartners.${index}.name`];
            return (
              <li key={partner.key} className="rounded-card border border-line bg-paper p-4" data-brand-partner={partner.instagram}>
                <div className="flex items-start gap-3">
                  <BrandLogo partner={partner} />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={nameId} className="text-sm font-semibold">
                      Nombre de la marca
                    </label>
                    <input
                      id={nameId}
                      value={partner.name}
                      maxLength={BRAND_NAME_MAX}
                      onChange={(event) => patch(partner.key, { name: event.target.value })}
                      onKeyDown={(event) => event.key === "Enter" && event.preventDefault()}
                      aria-invalid={nameError ? true : undefined}
                      aria-describedby={nameError ? `${nameId}-error` : undefined}
                      className={`${textInput} mt-1`}
                    />
                    {nameError && (
                      <p id={`${nameId}-error`} className={`${errorText} mt-1`}>
                        {nameError}
                      </p>
                    )}
                    <a
                      href={brandProfileUrl(partner.instagram)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex min-h-tap items-center font-mono text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
                    >
                      @{partner.instagram}
                      <span className="sr-only"> en Instagram (se abre en otra pestaña)</span>
                    </a>
                    <p className="text-xs text-muted" aria-live="polite">
                      {partner.lookup === "loading"
                        ? "Buscando su logo en Instagram…"
                        : partner.lookup === "none" && !partner.logo
                          ? "No encontramos su logo: se muestra la inicial. Puedes subirlo."
                          : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ImagePicker
                    label={partner.logo ? "Cambiar logo" : "Subir logo"}
                    onUploaded={(image) => patch(partner.key, { logo: image, lookup: undefined })}
                    onPending={onPending}
                  />
                  {!partner.logo && partner.lookup === "none" && (
                    <button type="button" onClick={() => searchAgain(partner)} className={pillButton}>
                      Buscar su logo otra vez
                    </button>
                  )}
                  {partner.logo && (
                    <button
                      type="button"
                      onClick={() => patch(partner.key, { logo: null })}
                      className="flex min-h-tap items-center px-2 text-sm text-muted transition hover:text-ink"
                    >
                      Quitar logo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPartners((current) => current.filter((item) => item.key !== partner.key))}
                    className="flex min-h-tap items-center px-2 text-sm text-muted transition hover:text-ink"
                  >
                    Quitar marca<span className="sr-only"> {partner.name || partner.instagram}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 rounded-card border border-dashed border-ink/50 p-4 sm:p-5" data-brand-manual>
        <p className="text-sm font-semibold">Agregar una marca a mano</p>
        <p className="mt-1 text-sm text-muted">Para colaboraciones antiguas o que no aparecen arriba.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-nueva-nombre`} className={fieldLabel}>
              Nombre de la marca
            </label>
            <input
              id={`${uid}-nueva-nombre`}
              value={name}
              maxLength={BRAND_NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={onEnter}
              placeholder="Marca"
              className={`${textInput} mt-2`}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-nueva-link`} className={fieldLabel}>
              Link de su Instagram
            </label>
            <input
              id={`${uid}-nueva-link`}
              value={link}
              onChange={(event) => setLink(event.target.value)}
              onKeyDown={onEnter}
              placeholder="instagram.com/marca"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`${textInput} mt-2`}
            />
          </div>
        </div>
        <p className={`${fieldLabel} mt-4`}>
          Logo <span className="font-normal text-muted">(opcional)</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura que ya sirve /media
            <img src={logo.url} alt="" width={48} height={48} className="size-12 rounded-full border border-line object-cover" />
          )}
          <ImagePicker label={logo ? "Cambiar logo" : "Subir logo"} onUploaded={setLogo} onPending={onPending} />
          {logo && (
            <button
              type="button"
              onClick={() => setLogo(null)}
              className="flex min-h-tap items-center px-2 text-sm text-muted transition hover:text-ink"
            >
              Quitar
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">Si no lo subes, lo buscamos en su Instagram; si no aparece, va su inicial.</p>
        {formError && (
          <p role="alert" className={`${errorText} mt-3`}>
            {formError}
          </p>
        )}
        <button type="button" onClick={addManual} disabled={full} className={`${pillButton} mt-4`} data-brand-add>
          {full ? `Máximo ${BRAND_PARTNERS_MAX} marcas` : "Agregar marca"}
        </button>
      </div>

      {error && (
        <p role="alert" className={`${errorText} mt-3`} data-brand-error>
          {error}
        </p>
      )}
    </div>
  );
}

function BrandLogo({ partner }: { partner: BrandPartnerDraft }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-sand text-lg font-semibold text-ink"
    >
      {partner.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura que ya sirve /media
        <img src={partner.logo.url} alt="" width={48} height={48} className="size-full object-cover" />
      ) : (
        brandInitial(partner.name || partner.instagram)
      )}
    </span>
  );
}
