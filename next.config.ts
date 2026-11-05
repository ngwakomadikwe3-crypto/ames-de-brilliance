import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Separate cache for isolated integration tests; production keeps the default.
  distDir: process.env.NODE_ENV === 'development' ? process.env.AMES_QA_DIST_DIR || '.next' : '.next',
  transpilePackages: ["ames-engine"],
  ...(process.env.AMES_QA_LOW_MEMORY === '1' ? { experimental: { cpus: 1 } } : {}),
  // Private jobs, editable art and review evidence are not runtime website assets.
  outputFileTracingExcludes: { "/*": [
    "./.ames-cad/**/*", "./source-assets/**/*", "./docs/qa/**/*", "./share/**/*",
  ] },
};

export default nextConfig;
