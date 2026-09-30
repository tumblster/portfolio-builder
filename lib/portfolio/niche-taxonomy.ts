/*
 * Taxonomía de nichos (ronda 30/09 · 7.1): las sugerencias del autocompletado al confirmar nichos.
 * Nichos habituales del contenido UGC en español. No es una lista cerrada: el creador puede agregar uno propio
 * (se valida igual, con nicheFromLabel), y los que sugirió la IA para su perfil también aparecen.
 */
export const NICHE_TAXONOMY: readonly string[] = [
  "Belleza",
  "Maquillaje",
  "Skincare",
  "Cuidado del cabello",
  "Moda",
  "Lifestyle",
  "Viajes",
  "Fitness",
  "Bienestar",
  "Salud",
  "Nutrición",
  "Recetas",
  "Cocina",
  "Gastronomía",
  "Comida saludable",
  "Café",
  "Hogar",
  "Decoración",
  "Limpieza",
  "Maternidad",
  "Familia",
  "Bebés",
  "Mascotas",
  "Tecnología",
  "Gaming",
  "Apps",
  "Negocios",
  "Emprendimiento",
  "Finanzas personales",
  "Marketing",
  "Productividad",
  "Educación",
  "Idiomas",
  "Libros",
  "Cine y series",
  "Música",
  "Arte",
  "Fotografía",
  "Diseño",
  "Humor",
  "Deportes",
  "Outdoor",
  "Autos",
  "Sostenibilidad",
  "DIY",
  "Bodas",
  "Moda infantil",
  "Joyería",
  "Accesorios",
];

/** Para comparar sin mayúsculas ni tildes: "Gastronomía" y "gastronomia" son lo mismo. */
export const foldText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .trim();
