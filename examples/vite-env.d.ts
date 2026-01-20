/// <reference types="vite/client" />

declare module "*.rsx?raw" {
  const content: string;
  export default content;
}

declare module "*.tsx?raw" {
  const content: string;
  export default content;
}

declare module "*.ts?raw" {
  const content: string;
  export default content;
}
