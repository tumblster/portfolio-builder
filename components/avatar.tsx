import Image from "next/image";
import type { StoredImage } from "@/lib/portfolio/schema";

/** Foto de perfil de 64 px. Sin foto, muestra la inicial del nombre. */
export function Avatar({ photo, name }: { photo: StoredImage | null; name: string }) {
  if (!photo) {
    return (
      <span
        aria-hidden="true"
        className="flex size-16 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-2xl text-lilac ring-1 ring-line"
      >
        {name.trim().charAt(0).toLocaleUpperCase("es")}
      </span>
    );
  }
  return (
    <Image
      src={photo.url}
      alt={`Foto de ${name}`}
      width={64}
      height={64}
      className="size-16 shrink-0 rounded-full object-cover ring-1 ring-line"
    />
  );
}
