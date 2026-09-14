import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // [MEDICION] Permite que el build de produccion del proyecto SEO escriba en
  // un directorio propio y no pelee con el .next de `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
