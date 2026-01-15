# RSX — On‑Demand Rendered Components

**RSX** is a component model designed for **real‑time and imperative workloads** where React’s state, effects, and memoization layers become accidental complexity.

> **RSX = On‑Demand Rendered Components**
> You decide *when* rendering happens.

RSX components look familiar to React developers, but behave very differently under the hood. They eliminate the need for hooks entirely—**including `useState`, `useEffect`, `useCallback`, `useMemo`, and `useRef`**—by making rendering an explicit operation instead of a side‑effect of state changes.

---

## Why RSX Exists

React excels at **declarative UI driven by application state**. But many real‑time systems are **not state‑driven UIs**:

* Timers, clocks, and stopwatches
* Game loops and input polling
* Media processing (audio/video analysis)
* Hardware and device bridges
* Animation engines and render pipelines
* High‑frequency data streams

In these domains, React often forces developers into patterns like:

* Deep `useEffect` chains
* `useCallback` for “stability”
* `useMemo` to fight re‑execution
* `useRef` as escape hatches
* Logic hidden inside custom hooks

The result is **indirect control**, harder reasoning, and fragile behavior.

RSX flips this model.



### Basic Structure

```jsx
export default function Example(ctx) {

  // Everything in this scope runs exactly once on 
  // mount and persists for the duration of the component.

  // life cycle methods from the ctx param
  const {view, update, destroy, render} = ctx;
  
    // Initial props snapshot (mount only)
  const initialProps = ctx.props;

  // Persistent state
  let value = 0;

  function increment() {
    value++;
    render(); // explicit re-render
  }

  view((props)=>{
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

## Simple RSX Example: Timeout-Based Update

This example shows where RSX shines: **imperative, time-driven updates** without hooks, effects, or memoization.

### RSX Component

```jsx
export default function TimeoutExample({view, render}) {

  let message = "Waiting...";

  // run once on mount
  setTimeout(() => {
    message = "Done!";
    render(); // explicit re-render
  }, 1000);

  view(()=>{
    return <div>{message}</div>;
  })
}

```

## The Core Idea: Render On Demand

In RSX:

* **Rendering is explicit**
* **Logic runs once**, not on every re‑render
* **Local variables behave like real variables**
* **You call `render()` only when output must change**

There is no implicit reactivity.

> If nothing meaningful changed, nothing renders.

This matches how real‑time systems already work.

---

## Why RSX Needs No Hooks (Including `memo`)

Hooks exist to compensate for **React’s re‑execution model**:

| React Hook    | Why It Exists                 |
| ------------- | ----------------------------- |
| `useState`    | Triggers renders indirectly   |
| `useEffect`   | Run code *after* render       |
| `useCallback` | Prevent identity churn        |
| `useMemo`     | Prevent recomputation         |
| `useRef`      | Persist values across renders |

RSX removes the root cause:

* The component function does **not re‑execute** on updates
* Variables persist naturally
* Side‑effects are just normal code
* Updates are intentional

Because nothing re‑runs implicitly:

* `memo` is unnecessary
* `callback` stability is irrelevant
* dependency arrays disappear

There is nothing to “optimize around.”

---

## What Types of Components Are Perfect for RSX

RSX shines where **imperative control beats declarative diffusion**.

### Ideal Use Cases

* **Timers & schedulers**
* **Animation loops** (`requestAnimationFrame`)
* **Gamepad, MIDI, HID, or sensor input**
* **Audio / video analysis**
* **Streaming or polling systems**
* **Canvas / WebGL / WebGPU renderers**
* **Electron IPC bridges**
* **High‑frequency UI updates**

If a component:

* Does work continuously
* Talks to hardware or external systems
* Maintains internal mutable state
* Should *not* re‑run on every parent render

…it’s likely a strong RSX candidate.

---

## Designed to Be Used *With* React

RSX is **not a replacement for React**.

It is meant to be **sprinkled into existing JSX projects**:

* Use React for layouts, routing, forms, and data fetching
* Use RSX for hot paths and real‑time subsystems

RSX components:

* Mount inside normal React trees
* Coexist with JSX components
* Do not affect React’s mental model elsewhere

Think of RSX as:

> **A precision tool inside a declarative framework**

---

## Works Natively with TypeScript

RSX supports TypeScript end‑to‑end:

* Typed props
* Typed local state
* Typed helpers and APIs
* Full IDE inference

Because RSX avoids hook indirection:

* Types are flatter
* Control flow is obvious
* Fewer generics and wrapper types

The result is **clearer typings with less ceremony**.

---

## Easier to Read, Easier for AI to Write

RSX code is:

* Linear
* Explicit
* Single‑pass

There are no hidden lifecycles, no dependency arrays, and no hook rules.

This makes RSX:

* Easier for humans to reason about
* **Far less error‑prone when generated by AI**

AI systems struggle with:

* Hook ordering rules
* Dependency correctness
* Memoization correctness
* Effect timing

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

## Rule of Thumb

- Use **React** when state *describes* the UI  
- Use **RSX** when events or time *drive* the UI

> RSX works best **selectively**, alongside React — not everywhere.



