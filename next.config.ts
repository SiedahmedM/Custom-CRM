import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Allow production builds to complete even with ESLint warnings
    // Critical errors (syntax, type) will still fail the build
    ignoreDuringBuilds: false,
  },
  // Turbopack configuration
  turbopack: {
    // Add turbopack-specific optimizations if needed
  }
};

export default nextConfig;
