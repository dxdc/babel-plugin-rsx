declare module "*.rsx" {
  export type Ctx<P = Record<string, unknown>> = {
    props: P;
    view: (cb: (props: P) => React.ReactNode) => void;
    update: (cb: (prev: P, next: P) => void) => void;
    render: () => void;
    destroy: (cb: () => void) => void;
  };
  import * as React from "react";
  type RSXComponent = ((ctx: Ctx, ref?: React.Ref<unknown>) => void) &
    React.FC<Record<string, unknown>>;
  const Component: RSXComponent;
  export default Component;
}
