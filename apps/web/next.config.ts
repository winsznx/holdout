import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const config: NextConfig = {
  transpilePackages: ['@holdout/engine', '@holdout/llm', '@holdout/bitget', '@holdout/skill'],
  reactStrictMode: true,
};

initOpenNextCloudflareForDev();

export default config;
