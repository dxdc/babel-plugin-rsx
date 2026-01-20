# RSX — On‑Demand Rendered Components

**RSX** is a component model designed for **real‑time and imperative workloads** where React’s state, effects, and memoization layers become accidental complexity.

> **RSX = On‑Demand Rendered Components**
> You decide _when_ rendering happens.

RSX components look familiar to React developers, but behave very differently under the hood. They eliminate the need for hooks entirely—**including `useState`, `useEffect`, `useCallback`, `useMemo`, and `useRef`**—by making rendering an explicit operation instead of a side‑effect of state changes.

---

## Why RSX Exists

React excels at **declarative UI driven by application state**. But many real‑time systems are **not state‑driven UIs**:

- Timers, clocks, and stopwatches
- Game loops and input polling
- Media processing (audio/video analysis)
- Hardware and device bridges
- Animation engines and render pipelines
- High‑frequency data streams

In these domains, React often forces developers into patterns like:

- Deep `useEffect` chains
- `useCallback` for “stability”
- `useMemo` to fight re‑execution
- `useRef` as escape hatches
- Logic hidden inside custom hooks

The result is **indirect control**, harder reasoning, and fragile behavior.

RSX flips this model.

### Basic Structure

```jsx
export default function Example(ctx) {
  // Everything in this scope runs exactly once on
  // mount and persists for the duration of the component.

  // life cycle methods from the ctx param
  const { view, update, destroy, render } = ctx;

  // Initial props snapshot (mount only)
  const initialProps = ctx.props;

  // Persistent state
  let value = 0;

  function increment() {
    value++;
    render(); // explicit re-render
  }

  view((props) => {
    // The render function
    return <button onClick={increment}>{value}</button>;
  });

  update((prevProps, nextProps) => {
    // runs when props change
  });

  destroy(() => {
    // runs once on unmount
  });
}
```

---

## How to Setup

### 1. Install the Package

```bash
npm install babel-plugin-rsx
```

### 2. Configure Babel

Add the plugin to your Babel configuration. Choose the setup that matches your bundler:

#### Option A: Babel Config (works with any bundler)

Create or update your `babel.config.js`:

```javascript
module.exports = {
  presets: [
    "@babel/preset-react",
    "@babel/preset-typescript", // if using TypeScript
  ],
  plugins: ["babel-plugin-rsx"],
  // Ensure .rsx files are processed
  overrides: [
    {
      test: /\.rsx$/,
      presets: [["@babel/preset-react", { runtime: "automatic" }]],
    },
  ],
};
```

#### Option B: Webpack

```javascript
// webpack.config.js
module.exports = {
  resolve: {
    extensions: [".js", ".jsx", ".ts", ".tsx", ".rsx"],
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx|rsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-react", "@babel/preset-typescript"],
            plugins: ["babel-plugin-rsx"],
          },
        },
      },
    ],
  },
};
```

#### Option C: Vite

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { rsxPlugin } from "babel-plugin-rsx/vite";

export default defineConfig({
  resolve: {
    extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".rsx"],
  },
  plugins: [
    rsxPlugin(),
    react({
      include: /\.(jsx|tsx|rsx)$/,
      babel: {
        plugins: [require("babel-plugin-rsx")],
      },
    }),
  ],
});
```

### 3. Optional Add TypeScript Support

Add the RSX types to your `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["babel-plugin-rsx/types"],
  },
}
```

This provides full type support for `.rsx` files, including the `Ctx` type with `view`, `update`, `render`, `destroy`, and `props`.

You can also import the types directly if needed:

```typescript
import type { Ctx } from "babel-plugin-rsx";

interface MyProps {
  name: string;
}

export default function MyComponent({ view, render, props }: Ctx<MyProps>) {
  // ...
}
```

### 4. Create Your First RSX Component

Create a file with the `.rsx` extension:

```jsx
// Counter.rsx
export default function Counter({ view, render }) {
  let count = 0;

  function increment() {
    count++;
    render();
  }

  view((props) => (
    <>
      <label>{props.name}</label>
      <button onClick={increment}>Count: {count}</button>
    </>
  ));
}
```

### 5. Use It in Your React App

```tsx
import Counter from "./Counter.rsx";

function App() {
  return (
    <div>
      <h1>My App</h1>
      <Counter name="Count clicks" />
    </div>
  );
}
```

## The Core Idea: Render On Demand

In RSX:

- **Rendering is explicit**
- **Logic runs once**, not on every re‑render
- **Local variables behave like real variables**
- **You call `render()` only when output must change**

There is no implicit reactivity.

> If nothing meaningful changed, nothing renders.

This matches how real‑time systems already work.

---

## Why RSX Needs No Hooks (Including `memo`)

Hooks exist to compensate for **React’s re‑execution model**:

| React Hook    | Why It Exists                 |
| ------------- | ----------------------------- |
| `useState`    | Triggers renders indirectly   |
| `useEffect`   | Run code _after_ render       |
| `useCallback` | Prevent identity churn        |
| `useMemo`     | Prevent recomputation         |
| `useRef`      | Persist values across renders |

RSX removes the root cause:

- The component function does **not re‑execute** on updates
- Variables persist naturally
- Side‑effects are just normal code
- Updates are intentional

Because nothing re‑runs implicitly:

- `memo` is unnecessary
- `callback` stability is irrelevant
- dependency arrays disappear

There is nothing to “optimize around.”

---

## Why `render()` in RSX Is Faster

When you call `render()` in RSX, you skip the overhead that React incurs on every update:

| React (on every render)                      | RSX (on `render()`)                |
| -------------------------------------------- | ---------------------------------- |
| Re‑executes entire component function        | Only re‑runs the `view()` callback |
| Runs all hooks sequentially                  | No hooks to run                    |
| Compares dependency arrays (`useMemo`, etc.) | No dependency tracking             |
| Recreates closures and inline functions      | Functions created once, persist    |
| Checks `memo` wrappers for prop changes      | No memo wrappers needed            |
| Schedules effects, flushes effect cleanup    | Side‑effects are imperative code   |

### The Real Cost of Hooks

In React, even a "simple" component with a few hooks pays these costs **every render**:

```jsx
function ReactTimer() {
  const [time, setTime] = useState(0);           // hook 1
  const intervalRef = useRef(null);              // hook 2
  const start = useCallback(() => { ... }, []);  // hook 3 + dep check
  const stop = useCallback(() => { ... }, []);   // hook 4 + dep check

  useEffect(() => { ... }, [time]);              // hook 5 + dep check + cleanup

  return <div>{time}</div>;
}
```

Every frame: 5 hook calls, 3 dependency array comparisons, potential effect scheduling.

### RSX Equivalent

```jsx
function RsxTimer({ view, render }) {
  let time = 0;
  let intervalId = null;

  function start() {
    intervalId = setInterval(() => {
      time++;
      render();
    }, 1000);
  }
  function stop() {
    clearInterval(intervalId);
  }

  view(() => <div>{time}</div>);
}
```

On `render()`: just the `view()` callback runs. No hook overhead. No comparisons.

### The performance gap widens with:

- **High‑frequency updates** (60fps animations, real‑time data)
- **Many instances** (100+ timers, particles, list items)
- **Complex hook graphs** (effects depending on effects)

---

## What Types of React Components Are Perfect for RSX conversion?

RSX shines where **imperative control beats declarative diffusion**.

### Ideal Use Cases

- **Timers & schedulers**
- **Animation loops** (`requestAnimationFrame`)
- **Gamepad, MIDI, HID, or sensor input**
- **Audio / video analysis**
- **Streaming or polling systems**
- **Canvas / WebGL / WebGPU renderers**
- **Electron IPC bridges**
- **High‑frequency UI updates**

If a component:

- Does work continuously
- Talks to hardware or external systems
- Maintains internal mutable state
- Uses many `useRefs` as escape hatches and `useCallbacks` for stabilization
- Should _not_ re‑run on every parent render
- Has tangled or deeply nested `useEffect` chains

…it’s likely a strong RSX candidate.

---

## Designed to Be Used _With_ React

RSX is **not a replacement for React**.

It is meant to be **sprinkled into existing JSX projects**:

- Use React for layouts, routing, forms, and data fetching
- Use RSX for hot paths and real‑time subsystems

```jsx
import ReactComponet from 'ReactComponet.tsx'
import RsxComponet from 'RsxComponet.rsx'
...
<div>
 <ReactComponet name={hello world}/>
 <RsxComponet name={hello world}/>
</div>
```

RSX components:

- Mount inside normal React trees
- Coexist with JSX components
- Do not affect React’s mental model elsewhere

---

## Works Natively with TypeScript

RSX supports TypeScript end‑to‑end:

- Typed props
- Typed local state
- Typed helpers and APIs
- Full IDE inference

Because RSX avoids hook indirection:

- Types are flatter
- Control flow is obvious
- Fewer generics and wrapper types

The result is **clearer typings with less ceremony**.

---

## Easier to Read, Easier for AI to Write

RSX code is:

- Linear
- Explicit
- Single‑pass

There are no hidden lifecycles, no dependency arrays, and no hook rules.

This makes RSX:

- Easier for humans to reason about
- **Far less error‑prone when generated by AI**

AI systems struggle with:

- Hook ordering rules
- Dependency correctness
- Memoization correctness
- Effect timing

RSX removes these failure modes entirely.

> What you see is what runs.

---

## Mental Model Summary

| React                  | RSX                      |
| ---------------------- | ------------------------ |
| State‑driven           | Event‑driven             |
| Implicit re‑execution  | Explicit rendering       |
| Hooks manage lifetimes | Code manages itself      |
| Optimization via memo  | No optimization required |

---

## When to Avoid RSX

RSX is not a general replacement for React. Prefer JSX + hooks when:

- The component is mostly **declarative UI** (forms, lists, layout, content)
- UI is **derived from app or server state**
- Updates are **infrequent or user-driven**
- The component is meant to be **highly composable or generic**
- React’s **conventions and consistency** are more important than control

## Further Reading

- [RSX Component Execution & Lifecycle Specification](docs/RSX_Semantics.md)
- [Common RSX Examples](docs/examples.md)
