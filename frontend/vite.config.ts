/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the build works under any GitHub Pages sub-path
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { fs: { allow: [".."] } },
  build: { chunkSizeWarningLimit: 2000 }, // Plotly is ~1 MB by itself
  // one worker: keeps memory low on machines with little free commit memory
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
