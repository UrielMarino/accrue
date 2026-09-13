import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // Los tests corren contra el CÓDIGO FUENTE de los paquetes, no contra su
    // `dist`. Sin esto, `@accrue/contracts` resuelve a un build que puede no
    // existir o estar viejo, y los schemas llegan `undefined` — un fallo que
    // parece un bug de la ruta y no lo es.
    alias: {
      "@accrue/domain": src("./packages/domain/src/index.ts"),
      "@accrue/contracts": src("./packages/contracts/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    environment: "node",
  },
});
