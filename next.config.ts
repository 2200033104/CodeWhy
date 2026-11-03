
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/CodeWhy",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
