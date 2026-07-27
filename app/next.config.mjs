/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'bullmq', 'ioredis'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
