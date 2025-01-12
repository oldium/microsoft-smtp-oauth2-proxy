import type { NextConfig } from "next";
import NextBundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyser = NextBundleAnalyzer({
    enabled: process.env.ANALYZE === "true"
});

const nextConfig: NextConfig = withBundleAnalyser({
    /* config options here */
    output: "standalone"
});

export default nextConfig;
