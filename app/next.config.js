/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js App Router는 자동으로 API 라우트를 처리합니다
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;