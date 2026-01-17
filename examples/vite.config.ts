import { defineConfig } from 'vite'
//import path from "node:path";
import react from '@vitejs/plugin-react'
//
//import { createRequire } from "module";
import { transform as esbuildTransform } from "esbuild";
import type { Plugin } from "vite";
//const require = createRequire(import.meta.url);

function rsxImportAnalysisPlugin(): Plugin {
  return {
    name: "vite-rsx-import-analysis",
    enforce: "pre",

    async transform(code, id) {
      if (!id.endsWith(".rsx")) return null;

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
  publicDir: '',
  
  resolve: {
    extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".rsx"],
  },
  plugins: [
    rsxImportAnalysisPlugin(),
    react({
      include: /\.(jsx|tsx|rsx)$/,
      babel: {
        plugins: [
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("../src/babel-plugin-rsx.cjs"),
        ],
      },
    }),
  ]
})
