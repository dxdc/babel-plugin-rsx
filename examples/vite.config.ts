import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import { rsxVitePlugin } from "../src/vite.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  publicDir: "",

  resolve: {
    extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".rsx"],
  },
  plugins: [
    rsxVitePlugin(),
    react({
      include: /\.(jsx|tsx|rsx)$/,
    }),
  ],
});
