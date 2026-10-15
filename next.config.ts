import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// הערה: cacheComponents ו-partialPrefetching (ברירת המחדל של התבנית) כבויים בכוונה.
// האפליקציה דינמית כולה ומאחורי התחברות; המצב הקפדני רק מסבך את העבודה בשלב הזה.
const nextConfig: NextConfig = {
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
