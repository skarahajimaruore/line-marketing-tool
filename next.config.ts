import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lockfile が複数ある場合でも、このアプリ直下を解決ルートとして固定する
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
