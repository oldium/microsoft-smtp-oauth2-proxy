import type { NextConfig } from "next";
import NextBundleAnalyzer from "@next/bundle-analyzer";
import fsExtra from "fs-extra";
import path from "path";
import { fileURLToPath } from "node:url";

const withBundleAnalyser = NextBundleAnalyzer({
    enabled: process.env.ANALYZE === "true"
});

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default () => {
    // noinspection UnnecessaryLocalVariableJS
    const nextConfig: NextConfig = withBundleAnalyser({
        /* config options here */
        output: "standalone",
        // Ensure we can import the local server package from server components without bundling it
        serverExternalPackages: [
            "@vscode/sqlite3",
            "@ms-smtp/common",
            "@ms-smtp/lib",
            "@ms-smtp/server",
        ],
        outputFileTracingRoot: fsExtra.pathExistsSync(path.join(currentDirectory, "package-lock.json")) ? currentDirectory : undefined,
        allowedDevOrigins: [
            "127.0.0.1",
            "[::1]"
        ],
        typescript: {
            tsconfigPath: process.env.NODE_ENV === "production" ?
                "./tsconfig.build.json" :
                "./tsconfig.json"
        }
    });

    return nextConfig;
}
