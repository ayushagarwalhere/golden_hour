import type { NextConfig } from "next";

// Basic hardening for a site victims trust with their story.
// frame-ancestors / X-Frame-Options: nobody can wrap Golden Hour in a look-alike page.
// Microphone is allowed for this site only (speech input); camera and location never.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // a self-contained server for Docker / any Node host (see Dockerfile)
  output: "standalone",
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // the service worker must always be fresh so fixes reach people quickly
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
