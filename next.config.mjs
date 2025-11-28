import withPWA from '@ducanh2912/next-pwa';

const withPWAFn = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV !== 'production',
  runtimeCaching: [
    {
      urlPattern: /^https?.*/i,
      handler: 'NetworkFirst',
      options: { cacheName: 'http-cache' },
    },
  ],
});

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    turbo: { rules: {} },
  },
};

export default withPWAFn(nextConfig);
