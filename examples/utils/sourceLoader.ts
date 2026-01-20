// Source code for examples - loaded at build time via Vite's ?raw import
import rsxTimerSource from "../stop-watch/RsxExample.rsx?raw";
import reactTimerSource from "../stop-watch/ReactExample.tsx?raw";

export const SOURCE_CODE: Record<string, { rsx: string; react: string }> = {
  "stop-watch": {
    rsx: rsxTimerSource,
    react: reactTimerSource,
  },
};

export function getSourceCode(exampleId: string, type: "rsx" | "react"): string {
  return SOURCE_CODE[exampleId]?.[type] ?? "// Source code not found";
}

export function getFilename(exampleId: string, type: "rsx" | "react"): string {
  const baseName = exampleId
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");

  return type === "rsx" ? `${baseName}Example.rsx` : `${baseName}Example.tsx`;
}
