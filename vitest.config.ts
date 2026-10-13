import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    fileParallelism: false,
    // tests write to the database directly, so nothing may be kept in the shop cache (tests/shop-cache turns it on)
    env: { SHOP_CACHE_SECONDS: "0" },
  },
});
