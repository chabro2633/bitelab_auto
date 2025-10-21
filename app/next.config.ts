import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // 캐시 무효화 설정
  generateBuildId: async () => {
    // 빌드마다 고유한 ID 생성으로 캐시 무효화
    return `build-${Date.now()}`;
  },
  
  // 정적 파일 캐시 헤더 설정
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
