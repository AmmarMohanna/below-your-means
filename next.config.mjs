/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  // Optimize for production
  poweredByHeader: false,
  
  // External packages for server-side (better-sqlite3 needs native bindings)
  serverExternalPackages: ['better-sqlite3'],
  
  // Headers for PWA
  async headers() {
    return [
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
