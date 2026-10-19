import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DBOS must run in the standalone worker, never inside a Next.js route bundle.
  serverExternalPackages: ["@dbos-inc/dbos-sdk", "@dbos-inc/otel"],
};

export default nextConfig;
