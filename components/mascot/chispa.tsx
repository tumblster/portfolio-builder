import "./chispa.css";

/*
 * Chispa, la mascota de Supercreador: solo ojos, nariz y boca estilo rubberhose de los años 30, flotando sobre el
 * fondo, sin cuerpo. Son los 6 renders finales del dueño (Figma), vectorizados pieza por pieza con potrace a partir
 * de las imágenes (umbral de tinta, una pieza por componente conexo, coordenadas a medio píxel del original), sin
 * redibujar: cada trazo es el del original. Se pintan con `currentColor` (en el sitio, la tinta del sistema).
 * Para cambiar una expresión, reemplaza sus trazados; si Figma exporta el SVG, mejor usar ese directamente.
 *
 * SISTEMA DE EXPRESIONES (reutilizable en el studio). Cada cara separa sus ojos (parpadean), su boca (la sonrisa
 * respira) y el resto (nariz, cejas, pestañas, rubor), así la misma animación sirve para todas:
 *
 *   expresión     cuándo usarla
 *   sonriente     hero de la landing y bienvenidas (la de por defecto)
 *   guino         "Portafolio listo" y otros logros
 *   estrella      celebrar: un ER alto, publicar o compartir por primera vez
 *   picara        tips y sugerencias ("confirma tus nichos", "prueba otra plantilla")
 *   sorprendida   errores y avisos (perfil privado, importación fallida, link que no existe)
 *   carcajada     confirmaciones alegres (link copiado, cambios guardados); sus ojos ya están cerrados
 */

export const EXPRESSIONS = ["sonriente", "guino", "estrella", "picara", "sorprendida", "carcajada", "pensativa"] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/**
 * Lienzo común de las caras (la 7.ª, "pensativa", es la de un portafolio archivado: spec 12.3): cuadrado, con la misma escala para todas (la nariz en "c" mide lo mismo en cada
 * una) y cada cara centrada por su tinta, con al menos 10 % de aire por lado. Cambiar de expresión en el mismo
 * lugar no hace saltar la cara. La prueba de humo lo verifica.
 */
export const MASCOT_SIZE = 330;

type Face = { eyes: string[]; mouth: string; nose: string; rest: string };

const FACES: Record<Expression, Face> = {
  sonriente: {
    eyes: ["M104 215c-12-10-25-15-41-15c-8 0-9 0-9-3c0-2 1-3 4-3c4-1 4-1 3-3c-10-23-11-46-3-65c2-5 3-6 5-5c3 1 3 1 1 7c-7 20-5 43 4 61l2 4 6 1c11 2 18 5 26 11c6 4 7 4 13 0c24-16 32-57 18-87c-8-15-22-25-34-24c-4 1-5-1-5-5c0-2 0-6-1-9c-1-8 0-9 3-9c2 0 3 1 4 12c1 4 1 5 5 5c2 0 5 1 7 1c4 2 4 2 7-4c3-6 4-7 6-6c3 1 3 2 0 10c-3 5-3 5 2 10c30 29 25 92-8 111c-2 2-5 4-7 5c-5 2-6 2-8 0zM78 100c0-1-1-2-1-2c0-1-1-4-3-7c-4-8-4-9-3-11c3-3 4-2 8 5c2 5 4 7 5 8c3 3 3 4-1 6c-3 3-3 3-5 1zM67 115c-3-1-13-11-14-12c-1-4 3-6 6-3c2 1 5 3 8 5c5 4 5 5 4 7c-2 3-3 3-4 3zM98 195c-11-3-20-15-22-31c-1-5 0-17 1-18c0-1 7 0 15 2c1 0 2 0 2-1c0 0-5-7-9-14c-2-2-3-5-3-5c0-4 7-13 12-16c27-14 50 26 35 63c-5 14-19 22-31 20z", "M224 216c-7-2-18-10-22-15c-24-30-21-81 8-105c1-1 1-2 1-2c0-1-1-3-2-6c-3-7-3-7-1-9c2-2 4-1 7 6c2 5 3 6 5 5c1-1 9-3 11-3c2 0 2 0 3-8c1-7 2-8 4-8c1 0 4 1 4 2c0 4-3 15-4 18c-1 3-2 3-6 3c-2 0-5 1-7 1c-31 11-43 65-20 98c5 8 20 18 22 15c2-4 20-12 30-13c6-1 5-1 8-7c11-24 11-52-1-73c-3-6-3-8 2-8c1 0 3-1 6-4c3-2 6-4 6-5c1 0 4 1 4 3c0 2 0 2-4 6c-2 1-5 4-6 5l-2 1 2 3c11 21 11 49 0 73c-2 4-2 5 0 5c4 0 6 4 4 6c-1 1-2 1-4 0c-9-2-32 5-42 13c-4 3-4 3-6 3zM250 99c-2-1-3-3-1-5c1-1 5-6 6-10c2-6 5-7 7-5c2 2 2 3-3 12c-5 11-5 11-9 8zM224 195c-16-3-27-21-26-43c1-8 0-7 11-6c7 1 7 1 7 1c0-1-9-16-11-18c-6-6 10-20 22-20c25 0 38 42 22 71c-6 10-17 16-25 15z"],
    mouth: "M159 259c-13-2-31-13-37-23c-2-4 2-8 5-4c9 9 11 11 18 15c20 10 41 6 58-13c4-4 5-5 7-4c3 2 3 4-1 8c-13 16-32 23-50 21z",
    nose: "M162 219c-13-4-18-19-10-28c6-8 21-8 27-1c3 4-1 9-4 5c-5-5-16-4-19 1c-4 8 2 17 10 17c5 0 6 5 2 6c-2 1-3 1-6 0z",
    rest: "M245 227c-2-1-1-3 4-8c8-9 10-10 12-7c2 2 1 2-6 9c-7 8-8 8-10 6zM37 227c-2-2-2-2 5-9c8-8 9-8 11-6c1 2 1 3-6 10c-7 7-8 7-10 5zM55 228c-3-1-1-4 7-12c6-5 7-6 9-4c1 2 1 3-4 8c-8 9-10 10-12 8zM262 228c-2-2-1-3 3-8c8-9 11-10 13-8c1 2 1 3-6 10c-7 7-8 8-10 6zM279 228c-2-2-2-2 5-8c6-7 7-7 9-6c2 2 2 3-4 9c-7 7-8 7-10 5zM72 228c-2-1-1-2 4-7c7-7 8-8 10-6c2 2 1 3-4 8c-7 7-8 7-10 5z",
  },
  guino: {
    eyes: ["M120 170c-17-9-38-10-56-2c-5 2-6 2-7 1c-2-2-1-5 3-7c2-1 2-1 1-6c-15-39 2-93 31-101c37-9 62 58 39 106c-2 4-2 5-2 7c1 1 1 3-1 4c-1 1-2 0-8-2zM75 157c2 0 7-1 9-1c6 0 6-1 5-4c-3-8-5-24-3-27c1-1 4-3 10-4c8-2 8-2-3-10c-5-4-5-4-4-8c3-17 18-29 30-24c3 1 4 0 1-4c-23-33-58-2-58 51c0 12 3 24 6 31c1 2 1 2 7 0z"],
    mouth: "M193 275c-15-3-23-13-31-38c-3-8-3-8-7-8c-20 0-41-8-54-20c-3-3-4-5-2-7c2-2 4-1 7 2c33 31 94 21 124-19c4-6 4-7-1-7c-2 0-2 0-3-1c-3-5 5-7 12-3c8 4 13 13 9 16c-2 2-3 2-5-3c-2-4-3-4-5-1c-3 5-9 11-14 16c-6 5-6 5-4 7c19 24 12 59-13 66c-4 1-11 1-13 0zM207 268c17-7 22-31 9-52c-3-5-3-5-7-3c-2 1-5 3-8 4c-6 3-6 4-5 6c4 3 9 18 8 21c-2 4-5 2-7-4c-4-12-8-17-11-16c-3 1-13 4-16 4c-4 0-4 1-3 4c0 1 1 4 2 8c9 24 22 34 38 28z",
    nose: "M157 190c-20-7-15-34 6-34c9 0 18 7 14 11c-1 2-3 1-5-1c-7-6-18-4-21 4c-2 7 2 13 11 15c5 1 6 5 1 6c-2 0-3 0-6-1z",
    rest: "M192 143c-1-1-1-3 1-9c8-26 34-47 56-48c7-1 7 6 0 7c-16 2-32 12-42 27c-4 8-4 8 2 5c21-11 44-10 61 3c5 3 6 6 3 8c-2 1-3 1-8-3c-14-10-34-12-51-3c-6 3-9 5-14 10c-5 5-6 5-8 3z",
  },
  estrella: {
    eyes: ["M102 186c0-1-1-3-2-4c0-2 0-2-6-4c-33-13-36-89-3-102c7-3 15-1 19 5c2 2 2 6 0 13c-2 5-2 7-2 10c1 4 1 4 8 2c7-1 7-1 8 3c4 14 0 41-5 47c-2 2-3 3-3 5c-1 5-5 10-10 14c-5 3-5 5-1 4c13-1 26-18 30-42c1-6 1-26 0-33c-9-42-38-57-59-32c-4 6-9 12-8 13c0 0-1 3-2 5c-10 29-8 57 7 79c2 4 2 5-2 5c-3 0-3 0-4-2c-6-8-11-21-13-36c-3-16 1-42 8-53c1-1 2-3 3-5c6-15 20-25 34-25c47 0 61 103 17 129c-7 4-12 5-14 4zM98 145c2-8 6-13 12-16c4-2 4-2-1-6c-6-4-9-8-11-16c-1-3-1-3-3 0c-2 9-8 15-15 18c-2 0-2 1 2 3c7 3 11 8 13 17c2 6 2 6 3 0z", "M231 187c-23-2-41-33-40-68c2-37 19-65 42-66c37-3 59 64 37 110c-5 10-6 11-10 9c-2-2-2-2 0-4c23-37 10-102-22-108c-10-2-23 6-30 19c-2 3-1 3 3 0c9-8 19-7 27 1c4 4 4 4 2 11c-6 16-5 16 6 12c6-2 7-1 7 2c2 6 3 10 3 19c0 16-2 24-10 39c-3 7-10 13-16 14c-5 1-5 1 1 3c4 1 5 2 5 4c0 1-2 3-3 3c0 0-1 0-2 0zM226 149c0 0 1-2 1-3c1-7 6-14 12-17c5-3 5-3 0-5c-6-3-10-8-12-17c-1-4-2-4-3-1c-2 9-7 16-14 19c-3 1-3 2 1 3c6 3 10 9 13 18c1 5 2 6 2 3z"],
    mouth: "M159 277c-7-2-15-7-22-14c-17-19-29-62-19-69c3-2 4-1 12 3c25 15 52 14 78-2c11-7 14 2 9 25c-8 37-34 62-58 57zM173 270c15-4 23-19 14-28c-8-9-26-10-37-3c-17 11 1 37 23 31z",
    nose: "M161 190c-14-4-17-25-3-31c7-3 14-3 20 2c6 4 2 10-4 5c-8-6-19-2-19 8c0 6 4 10 11 11c3 0 4 1 5 2c1 3-4 5-10 3z",
    rest: "M37 201c-2-2-2-3 5-9c7-7 9-8 10-6c2 2 2 2-5 10c-7 7-8 7-10 5zM54 202c-2-1-2-3 3-8c8-8 10-10 12-8c2 3 1 3-6 11c-7 7-8 7-9 5zM248 202c-4-1-3-3 3-9c6-6 8-8 10-7c2 1 2 2 1 4c-1 1-13 13-13 13c0 0-1 0-1-1zM263 202c-2-2-1-3 5-10c7-6 8-7 9-6c3 1 3 3-3 9c-8 9-9 9-11 7zM71 202c-2-1-2-2 4-8c7-6 7-7 9-6c2 2 2 4-5 10c-5 5-6 6-8 4zM280 202c-2-1-1-3 4-8c7-7 8-7 10-4c1 1 0 2-4 6c-6 7-9 8-10 6z",
  },
  picara: {
    eyes: ["M88 218c-11-2-21-8-28-18c-10-12-15-28-15-45c0-15 2-23 6-23c3 0 4 3 3 8c0 2-1 4-1 5l1 2 39 0c22 0 40 0 40-1c2-1-15-24-24-32c-16-16-30-17-43-5c-4 4-4 5-7 3c-3-2-1-7 5-12c21-18 49-5 72 33c2 3 4 6 5 7c2 3 2 4 2 5c0 1 0 5-1 9c-1 39-27 69-54 64zM98 210c9-1 16-6 24-15c3-4 3-5 1-5c-12 4-24 0-30-9c-3-5-2-7 5-11c2-1 3-2 3-2c0-1-8-2-10-2c-2-1-3-2-3-6c0-2 0-4 0-4c-1-1-34-1-35 0c-1 0 1 13 3 19c6 23 25 38 42 35z", "M224 215c-16-4-29-17-35-36c-4-13-6-28-3-31l1-1 25 0c14 0 34 0 44 0c22-1 20 1 19-9c-2-11-4-19-10-29c-3-6-3-7-1-9c3-3 6-1 12 10c9 20 11 46 5 64c-12 32-33 48-57 41zM243 207c7-2 14-7 19-13c3-5 3-5-2-4c-9 3-20-2-25-11c-3-5-2-6 4-9c5-3 4-3-3-4c-6-1-6-1-7-6c0-3 0-4 0-5c-1 0-35 0-36 1c-2 1 2 19 7 29c10 18 27 28 43 22z"],
    mouth: "M157 275c-15-1-27-6-25-10c1-3 3-4 7-2c21 8 45 5 63-8c5-3 13-11 13-13c0 0-1-2-2-3c-4-3-4-5-2-7c2-2 4-1 8 2c9 8 10 30 2 30c-3 0-4-2-2-10c0-3-1-3-5 1c-15 14-37 22-57 20z",
    nose: "M156 231c-16-4-18-26-4-34c9-4 24 0 24 8c0 3-3 4-6 1c-9-9-23-1-20 11c1 3 7 7 11 7c4 0 7 4 4 6c-1 2-6 2-9 1z",
    rest: "M189 118c-4-4-2-9 2-9c4 0 5-1 11-9c12-13 30-30 39-36c16-10 34-13 34-5c0 3-1 4-7 5c-15 0-31 12-55 38c-17 19-20 20-24 16z",
  },
  sorprendida: {
    eyes: ["M93 191c-37-5-55-68-32-115c18-37 56-35 72 4c7 19 9 40 5 61c-6 30-26 52-45 50zM101 182c1 0 1-1-2-2c-11-6-21-29-20-48l0-4 5-2c2-1 7-4 10-5c7-3 7-3 4-5c-6-4-12-8-14-10l-2-2 0-4c3-18 14-35 26-36c5-1 5-2 1-4c-16-9-32-1-42 20c-19 40-6 97 24 103c2 1 9 0 10-1z", "M227 189c-49-12-47-129 2-140c34-7 59 45 47 97c-8 30-28 49-49 43zM239 183c2-1 2-2-1-3c-11-7-18-24-19-45c-1-8-1-7 10-13c7-3 9-4 9-5c0 0-3-3-8-6c-10-7-9-6-8-11c2-19 14-36 27-37c3 0 3-1-1-3c-24-14-47 11-50 54c-3 40 19 75 41 69z"],
    mouth: "M162 281c-30-9-32-74-2-84c17-7 32 10 34 38c3 27-14 51-32 46zM172 273c7-3 14-18 11-23c-6-9-21-10-28-3c-7 8-6 14 1 22c5 5 10 7 16 4z",
    nose: "M158 187c-10-4-14-14-11-24c5-12 23-14 31-4c3 4-1 8-4 4c-6-7-18-5-21 2c-3 8 2 16 11 17c4 0 6 2 3 5c-1 1-5 1-9 0z",
    rest: "",
  },
  carcajada: {
    eyes: [],
    mouth: "M149 245c-38-5-68-29-73-60c-3-16 3-26 16-26c5 0 9 1 19 8c39 25 73 23 110-9c11-9 13-10 19-10c6 0 1-5-5-5c-7-1-6-6 1-7c13-2 34 14 27 21c-2 1-3 1-5-3c-3-4-5-5-7-5c-2 0-2 0 1 5c6 12 5 27-4 44c-16 31-59 52-99 47zM158 239c1-1 2-46 1-48c0 0-3 0-5-1c-6 0-14-2-18-3c-2-1-3-1-4-1c-1 1-3 14-5 28c-1 2-1 5-1 7c-1 7-1 10-1 11c3 2 20 6 30 7c1 0 2 0 2 0c0 0 1 0 1 0zM176 238c9-1 23-6 25-7c0-1 0-1 0-2c0-1-1-6-2-12c-3-20-5-31-6-32c-1 0-2 0-4 1c-3 1-10 3-17 4l-6 1 0 7c-1 12 0 40 0 41c1 0 4 0 10-1zM119 222c1-5 3-20 4-26c1-2 2-5 2-8c2-5 2-5-4-7c-2-2-7-4-9-6c-6-4-6-4-8 0c0 2-1 5-2 7c-3 6-7 20-8 25c-1 3 10 13 20 19c4 3 4 3 5-4zM212 225c8-4 20-14 22-18c2-3-11-39-14-39c0 0-3 2-6 4c-3 3-8 6-10 7c-5 3-6 3-5 6c3 14 5 20 6 30c1 6 2 11 2 12c0 1 1 0 5-2zM91 196c1-5 6-17 8-23c2-6 2-6-1-7c-5-2-8-2-12 1c-6 5-6 17 0 30c2 4 3 4 5-1zM241 196c7-9 10-27 7-35c-3-9-9-9-17-2c-5 3-5 4-3 9c4 10 7 18 11 30c0 1 1 0 2-2zM67 164c-6-6 20-25 28-21c4 2 2 5-3 6c-6 1-8 3-7 7c1 3-1 4-4 1l-2-2-1 1c-1 1-3 3-5 5c-3 4-5 5-6 3z",
    nose: "M159 165c-1 0-2 0-4-1c-11-4-14-20-5-28c8-7 20-7 27 1c5 5 0 9-5 4c-6-6-16-5-20 2c-4 7 1 15 10 16c4 1 6 3 3 5c-1 1-5 2-6 1z",
    rest: "M192 122c-1-2 0-5 5-13c20-31 60-33 79-5c3 5 3 6 2 8c-3 2-4 2-7-2c-17-26-51-22-70 6c-5 8-6 9-9 6zM131 126c-1 0-2-2-3-4c-8-14-28-25-41-23c-13 2-23 9-29 20c-1 3-2 4-3 4c-9 0 0-17 13-26c21-14 48-6 65 19c3 5 4 7 2 9c-1 1-3 1-4 1z",
  },
  pensativa: {
    eyes: ["M93 211c-37-5-55-68-32-115c18-37 56-35 72 4c7 19 9 40 5 61c-6 30-26 52-45 50zM101 202c1 0 1-1-2-2c-11-6-21-29-20-48l0-4 5-2c2-1 7-4 10-5c7-3 7-3 4-5c-6-4-12-8-14-10l-2-2 0-4c3-18 14-35 26-36c5-1 5-2 1-4c-16-9-32-1-42 20c-19 40-6 97 24 103c2 1 9 0 10-1z", "M227 209c-49-12-47-129 2-140c34-7 59 45 47 97c-8 30-28 49-49 43zM239 203c2-1 2-2-1-3c-11-7-18-24-19-45c-1-8-1-7 10-13c7-3 9-4 9-5c0 0-3-3-8-6c-10-7-9-6-8-11c2-19 14-36 27-37c3 0 3-1-1-3c-24-14-47 11-50 54c-3 40 19 75 41 69z"],
    mouth: "M140 273c11-5 23-5 35-2c10 3 19 3 27-2c3-2 6 2 3 5c-9 7-20 7-31 4c-11-3-21-3-30 1c-3 2-7-3-4-6z",
    nose: "M158 207c-10-4-14-14-11-24c5-12 23-14 31-4c3 4-1 8-4 4c-6-7-18-5-21 2c-3 8 2 16 11 17c4 0 6 2 3 5c-1 1-5 1-9 0z",
    rest: "M209 57c15-9 34-10 49-3c3 2 1 6-2 5c-14-6-30-5-42 3c-3 2-7-2-5-5z",
  },
};

export function Chispa({ expression = "sonriente", className, id }: { expression?: Expression; className?: string; id?: string }) {
  const face = FACES[expression];
  return (
    <svg
      viewBox={`0 0 ${MASCOT_SIZE} ${MASCOT_SIZE}`}
      className={className}
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      data-mascot
      data-expression={expression}
    >
      <g id={id}>
        <path d={face.rest} />
        <path d={face.nose} />
        {face.eyes.map((d, index) => (
          <path key={index} className="mascot-eye" d={d} />
        ))}
        <path className="mascot-mouth" d={face.mouth} />
      </g>
    </svg>
  );
}

/**
 * La misma cara que ya está dibujada en la página (la del `id`), sin repetir sus trazos: un <use> de SVG.
 * La acompañante de la landing la usa para no cargar dos veces la carcajada del hero.
 */
export function ChispaEcho({ of, expression }: { of: string; expression: Expression }) {
  return (
    <svg viewBox={`0 0 ${MASCOT_SIZE} ${MASCOT_SIZE}`} fill="currentColor" fillRule="evenodd" aria-hidden="true" data-mascot data-expression={expression}>
      <use href={`#${of}`} />
    </svg>
  );
}

/**
 * La sonrisa de la carcajada (boca con dientes y comisuras), tal cual: es la marca de Supercreador
 * (components/brand/supercreador-mark.tsx). Mismo dato que la cara del hero, no una copia.
 */
export const CHISPA_SMILE = FACES.carcajada.mouth;
