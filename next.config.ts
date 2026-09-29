import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.MOTORSCOUT_BUILD_ID ? {
    deploymentId: process.env.MOTORSCOUT_BUILD_ID,
    assetPrefix: `/_releases/${process.env.MOTORSCOUT_BUILD_ID}`,
  } : {}),
};

export default nextConfig;
