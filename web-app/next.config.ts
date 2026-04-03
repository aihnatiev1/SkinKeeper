import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@skinkeeper/shared"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@skinkeeper/shared": path.resolve(__dirname, "../packages/skinkeeper-shared/src"),
    };
    return config;
  },
};

export default nextConfig;
