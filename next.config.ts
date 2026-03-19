import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  experimental: {
    optimizePackageImports: ['date-fns', 'qrcode.react', '@supabase/supabase-js'],
  },
};

export default nextConfig;
