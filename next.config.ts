import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
        output: "export" as const,
        basePath: "/yizi-xunwu",
        assetPrefix: "/yizi-xunwu/",
        // The GitHub Pages build does not use the Cloudflare-only D1 files.
        typescript: { ignoreBuildErrors: true },
      }
    : {}),
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
