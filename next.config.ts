import type { NextConfig } from "next";
import { RECEIPT_SERVER_ACTION_BODY_LIMIT } from "./lib/receipt-upload";

const isVercelDeployment = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Receipt uploads go through Server Actions; keep headroom above the
      // file size limit for multipart encoding overhead.
      bodySizeLimit: RECEIPT_SERVER_ACTION_BODY_LIMIT,
    },
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              [
                "script-src",
                "'self'",
                "'unsafe-inline'",
                "'unsafe-eval'",
                isVercelDeployment ? "https://vercel.live" : "",
              ]
                .filter(Boolean)
                .join(" "),
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
