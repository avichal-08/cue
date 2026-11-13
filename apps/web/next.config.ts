import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@cue/core'],
  devIndicators: false,
};

export default config;
