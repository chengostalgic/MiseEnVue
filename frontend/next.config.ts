import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  transpilePackages: ["@miseenvue/agent"],
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/api/**/*": ["./../data/out/**/*"],
  },
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
