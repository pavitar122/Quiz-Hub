/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // drop the X-Powered-By header (tiny bandwidth + info-leak cleanup)
  compress: true, // gzip/brotli text responses (default under `next start`, made explicit here)
};
export default nextConfig;
