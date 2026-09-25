import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const gateway = process.env.SHUACREW_GATEWAY ?? "http://127.0.0.1:7420";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Workspace packages (ui) use the app's single copy of React and motion.
  resolve: { dedupe: ["react", "react-dom", "motion"] },
  server: {
    port: 5173,
    proxy: {
      "/api": gateway,
      "/ws": { target: gateway.replace(/^http/, "ws"), ws: true },
    },
  },
  build: {
    // Existing Mac windows may still import a prior build's lazy chunks. Content-hashed
    // assets are immutable; retain them across local updates until those windows reload.
    emptyOutDir: false,
    target: "es2023",
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Keep the first paint small: heavy views load when they are opened.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "router", test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: "motion", test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/ },
          ],
        },
      },
    },
  },
});
