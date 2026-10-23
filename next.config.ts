import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets the dev server's scripts load when the app is opened at http://127.0.0.1:3000 (the Claude browser pane).
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
