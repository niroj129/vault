/** @type {import('next').NextConfig} */
const backend = new URL(process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000");

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: backend.protocol.replace(":", ""),
        hostname: backend.hostname,
        port: backend.port || "",
        pathname: "/media/**",
      },
    ],
  },
};

module.exports = nextConfig;
