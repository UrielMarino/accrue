import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Igual que en los tests: contra el código fuente de los paquetes, para que
    // un `dist` viejo no se disfrace de bug de pantalla.
    alias: {
      "@accrue/domain": src("../../packages/domain/src/index.ts"),
      "@accrue/contracts": src("../../packages/contracts/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    // El front habla con la API por el mismo origen: sin CORS y sin URL
    // hardcodeada que después haya que cambiar para el self-host.
    proxy: { "/api": { target: "http://localhost:3000", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
});
