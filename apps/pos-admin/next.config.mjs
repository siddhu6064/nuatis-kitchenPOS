import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nuatis/pos-shared"],
};

// withSentryConfig wraps the Next.js build to enable Sentry instrumentation.
// Source map upload is disabled until SENTRY_AUTH_TOKEN is available (post first deploy).
export default withSentryConfig(nextConfig, {
  silent: true,          // suppress Sentry build output in CI / Vercel logs
  disableLogger: true,   // tree-shake Sentry logger in production bundles
  sourcemaps: {
    disable: true,       // deferred until SENTRY_AUTH_TOKEN is provisioned
  },
});
