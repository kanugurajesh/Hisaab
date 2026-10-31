import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp", "@google-cloud/storage"],
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
