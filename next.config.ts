import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "imapflow", "mailparser", "nodemailer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
