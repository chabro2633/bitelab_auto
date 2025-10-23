/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@vercel/kv'],
  experimental: {
    serverComponentsExternalPackages: ['@vercel/kv'],
  },
};

module.exports = nextConfig;