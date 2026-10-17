import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// הערה: cacheComponents ו-partialPrefetching (ברירת המחדל של התבנית) כבויים בכוונה.
// האפליקציה דינמית כולה ומאחורי התחברות; המצב הקפדני רק מסבך את העבודה בשלב הזה.
const nextConfig: NextConfig = {
  // מסמך מצורף לדיווח עד 5MB (ברירת המחדל של server actions היא 1MB)
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // לא ניתן להטמעה ב-iframe (clickjacking)
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          // קישורי איפוס והזמנה נושאים טוקן ב-URL: לא לשלוח אותו הלאה ב-Referer
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
