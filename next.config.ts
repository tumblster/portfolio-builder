import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No anunciar "X-Powered-By: Next.js" en las respuestas.
  poweredByHeader: false,
  images: {
    // Solo se optimizan nuestras imágenes (/media/<uuid>.webp) y sin parámetros en la URL.
    localPatterns: [{ pathname: "/media/**", search: "" }],
  },
};

export default nextConfig;
