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
  // Models, posters and studio light change by new file names (watch-v2.glb ...), so
  // browsers may keep them a week and refresh in the background after that. The JSON
  // indexes stay uncached so new pieces appear at once.
  async headers() {
    return [{ source: '/ames-engine/:path(.*\\.(?:glb|webp|hdr|jpg|png))', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' }] }];
  },
};

export default nextConfig;
