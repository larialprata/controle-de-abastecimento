import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Evita "504 Outdated Optimize Dep" / ERR_ABORTED ao carregar @react-google-maps/api em dev
  optimizeDeps: {
    include: ["@react-google-maps/api", "@googlemaps/js-api-loader"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});
