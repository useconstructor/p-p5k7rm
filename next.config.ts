import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/api/products/*': ['./migrations/*.sql'], '/api/products': ['./migrations/*.sql'] },
};
export default nextConfig;
