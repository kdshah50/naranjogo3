/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "imagedelivery.net" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/fastapi/:path*",
        destination: `${process.env.FASTAPI_INTERNAL_URL || "http://localhost:8000"}/:path*`,
      },
    ];
  },
};
export default nextConfig;
