import react from "@vitejs/plugin-react";
import { transform as esbuildTransform } from "esbuild";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rsxPlugin = require("../src/babel-plugin-rsx.cjs");

function rsxImportAnalysisPlugin(): Plugin {
  return {
    name: "vite-rsx-import-analysis",
    enforce: "pre",

    async transform(code, id) {
      if (!id.endsWith(".rsx")) return null;
      if (id.includes("?raw")) return null;

      const result = await esbuildTransform(code, {
        loader: "jsx",
        jsx: "automatic",
        sourcemap: true,
        sourcefile: id,
      });

      return {
        code: result.code,
        map: result.map || null,
      };
    },
  };
}
//

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  publicDir: "",

  resolve: {
    extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".rsx"],
  },
  plugins: [
    rsxImportAnalysisPlugin(),
    react({
      include: /\.(jsx|tsx|rsx)$/,
      babel: {
        plugins: [rsxPlugin],
      },
    }),
  ],
});
