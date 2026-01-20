import type { Plugin } from "vite";

export interface RsxVitePluginOptions {
  include?: string | RegExp | (string | RegExp)[];
  exclude?: string | RegExp | (string | RegExp)[];
}

export function rsxVitePlugin(options?: RsxVitePluginOptions): Plugin;
export default rsxVitePlugin;
