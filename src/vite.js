import { transformSync } from "@babel/core";
import { createFilter } from "@rollup/pluginutils";
import rsxBabelPlugin from "./babel-plugin-rsx.cjs";

export function rsxVitePlugin(options = {}) {
  const filter = createFilter(options.include || /\.rsx$/, options.exclude);

  return {
    name: "vite-plugin-rsx",
    enforce: "pre",

    transform(code, id) {
      if (!filter(id)) return null;

      const result = transformSync(code, {
        filename: id,
        plugins: [rsxBabelPlugin],
        presets: [
          [
            "@babel/preset-react",
            {
              runtime: "automatic",
            },
          ],
        ],
        sourceMaps: true,
        sourceFileName: id,
      });

      if (!result) return null;

      return {
        code: result.code,
        map: result.map,
      };
    },
  };
}

export default rsxVitePlugin;
