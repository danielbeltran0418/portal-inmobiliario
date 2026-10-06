import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // No anunciar el framework en cada respuesta (X-Powered-By).
  poweredByHeader: false,
};

export default nextConfig;
