import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  agentRules: false,
  // The browser reaches the API through this origin, so the session cookie is first-party and
  // the API's cross-origin guard sees same-origin requests.
  rewrites() {
    return Promise.resolve([{ source: '/v1/:path*', destination: `${apiUrl}/v1/:path*` }]);
  },
};

export default nextConfig;
