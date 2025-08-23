import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Allow production builds to complete even with ESLint warnings
    // Critical errors (syntax, type) will still fail the build
    ignoreDuringBuilds: false,
  },
  experimental: {
    turbo: {
      rules: {
        // Turbo-specific optimizations for faster builds
      }
    }
  }
};

export default nextConfig;
