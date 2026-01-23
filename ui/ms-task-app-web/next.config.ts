import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: 'standalone',
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream', 'next-logger'],
}

export default nextConfig
