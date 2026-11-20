import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 서버 없이 여는 단일 HTML 빌드 (npm run build:static)
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist-static",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    lib: {
      entry: "static/main.tsx",
      formats: ["iife"],
      name: "AiOffice",
      fileName: () => "office.js",
      cssFileName: "office",
    },
  },
});
