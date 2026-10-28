import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "favicon.png",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-192.png",
        "icon-maskable-512.png",
        "badge-96.png",
        "opengraph.jpg",
        "screenshot-mobile.jpg",
        "screenshot-desktop.jpg",
        "manifest.webmanifest",
        "shared-manifest.webmanifest",
      ],
      manifest: false,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,jpg,jpeg,svg,webmanifest,woff2,ttf}"],
        // Keep the initial app shell available offline, while report exporters
        // are fetched only when a user asks to export a report.
        maximumFileSizeToCacheInBytes: 768 * 1024,
        globIgnores: [
          "assets/exceljs.min-*.js",
          "assets/html2canvas.esm-*.js",
          "assets/jspdf.es.min-*.js",
          "assets/jspdf.plugin.autotable-*.js",
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return;

          if (/\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
          if (id.includes("/@supabase/")) return "supabase-vendor";
          if (id.includes("/recharts/") || /\/node_modules\/(d3-[^/]+|internmap)\//.test(id)) return "charts-vendor";
          if (id.includes("/date-fns/")) return "date-vendor";
          if (id.includes("/react-hook-form/") || id.includes("/@hookform/")) return "forms-vendor";
          if (id.includes("/@radix-ui/")) return "radix-vendor";

          return undefined;
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
