import { defineConfig } from "vitest/config";
import path from "node:path";

// מקומית: DATABASE_URL מ-.env.local. ב-CI: ממשתנה סביבה.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, ".env.local"));
} catch {}

// בדיקות מול Neon (ענף dev). יוצרות ארגון משלהן ומוחקות אותו בסוף.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
