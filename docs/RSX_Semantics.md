# RSX Component Execution & Lifecycle Specification

This document defines the **runtime semantics of an RSX component**. It is intentionally descriptive and normative, not tutorial. The goal is to allow automated systems (LLMs, code generators, analyzers) to correctly construct RSX components from prompts.

---

## 1. RSX Component Shape

An RSX component is authored as a single exported function in a `.rsx` file.

```ts
export default function Component(ctx, ref?) {
  // root scope
}
```

### Function Parameters

| Parameter | Required | Description                                            |
| --------- | -------- | ------------------------------------------------------ |
| `ctx`     | yes      | Lifecycle context object injected by the RSX compiler  |
| `ref`     | no       | Optional forwarded React ref; passed through unchanged |

The function signature is preserved to remain compatible with React's component calling convention.

---

## 2. Execution Model (Critical Invariant)

### **The RSX component body executes exactly once per mounted instance.**

- The user-authored function body is **not re-executed** on React re-renders.
- There is no equivalent to React's render phase for user code.
- All user logic runs during a single initialization phase guarded by an internal instance flag.

React may invoke the outer component function multiple times, but RSX guarantees that **user code runs once and only once per instance**.

---

## 3. Instance Lifetime & Persistence

### Root-Scope Persistence

All variables declared in the root scope of the RSX component:

```ts
let count = 0;
let timerId;
function increment() { ... }
```

have the following properties:

- They are allocated **once** per component instance
- They persist for the **entire mounted lifetime** of the component
- They are stored on an internal per-instance object
- Reads and writes always resolve to the same instance-scoped storage

There is no concept of re-initialization, re-render execution, or closure recreation.

> **RSX variables behave like instance fields, not render-scoped locals.**

---

## 4. The `ctx` Lifecycle Context

The RSX compiler injects a stable `ctx` object into the component. This object exposes lifecycle registration and control primitives.

### 4.1 `ctx.view(fn)`

Registers the view function.

```ts
ctx.view((props) => JSX);
```

**Semantics**

- Stores `fn` as the component's view callback
- The function is **never redefined or re-registered implicitly**
- Must return JSX (or `null`)

**Invocation**

- Called internally whenever RSX performs a render pass
- Receives the **current props snapshot**

---

### 4.2 `ctx.update(fn)`

Registers a props update handler.

```ts
ctx.update((prevProps, nextProps) => { ... })
```

**Semantics**

- Invoked automatically when React props change
- Runs **after mount**, never during initialization
- Receives previous and next props by reference

**Ordering**

1. `update(prev, next)`
2. implicit render

---

### 4.3 `ctx.destroy(fn)`

Registers a cleanup handler.

```ts
ctx.destroy(() => { ... })
```

**Semantics**

- Stored once during initialization
- Invoked exactly once on unmount
- Guaranteed to run before instance disposal

---

### 4.4 `ctx.render()`

Explicitly schedules a render.

```ts
ctx.render();
```

**Semantics**

- Forces execution of the registered `view` callback
- Triggers a React re-render via an internal state tick
- Safe to call from any event, timer, or external system

**Important**

- Calling `render()` does **not** re-execute user code
- Only the view function is re-evaluated

---

### 4.5 `ctx.props`

A getter that returns the current props snapshot.

```ts
const initialProps = ctx.props;
```

**Semantics**

- On mount: reflects props passed during first render
- After mount: updated automatically before `update()` is called
- Read-only; mutation is illegal

Values read from `ctx.props` in root scope are captured once and will not update unless explicitly reassigned in `update()`.

---

## 5. Initialization Sequence (Exact Order)

For each mounted RSX component instance:

1. Internal instance storage is created
2. `ctx` object is constructed
3. User component body executes **once**, receiving `ctx`
4. Registered lifecycle callbacks are stored
5. Initial `view()` is executed once
6. JSX output is returned to React

At no point is the user body executed again.

---

## 6. Update Sequence

On subsequent React renders:

1. Props are compared by reference
2. If unchanged → no user code runs
3. If changed:
   - `update(prevProps, nextProps)` is invoked
   - `view(nextProps)` is executed

4. JSX output is returned

---

## 7. Return Semantics

- User `return` statements are ignored
- The RSX runtime exclusively controls what is returned
- The rendered value is the result of the most recent `view()` execution

If no view has produced output, `null` is returned.

---

## 8. Hook Restrictions (Hard Rules)

### **All hooks are banned in user-authored RSX code.**

RSX components must not invoke:

- React built-in hooks
- Custom hooks
- Hook-like abstractions

Formally:

> **Any function whose name matches `/^use[A-Z]/` is prohibited inside `.rsx` files.**

This includes, but is not limited to:

- `useState`
- `useEffect`
- `useMemo`
- `useCallback`
- `useContext`
- `useMyProvider`

Violations are compile-time errors.

### Rationale

- RSX user code executes once per instance
- Hooks assume repeated render-phase execution
- Dependency arrays, memoization, and effect scheduling have no semantic meaning in RSX

RSX replaces hook functionality with explicit lifecycle primitives:

| React Hook          | RSX Equivalent                    |
| ------------------- | --------------------------------- |
| `useState`          | root-scope variables + `render()` |
| `useEffect([])`     | root-scope execution              |
| `useEffect(dep)`    | `update(prev, next)`              |
| `useEffect cleanup` | `destroy()`                       |
| `useMemo`           | explicit caching / update logic   |
| `useCallback`       | stable functions by default       |

> **Compiler-injected hooks are permitted; user-authored hooks are not.**

---

## 9. Integrating RSX with Providers and Shared State

RSX does not call providers or hooks directly. Instead, it integrates with shared state using one of two explicit patterns.

---

### 9.1 Pattern A (Recommended): Upstream Store / Dual Adapter

**Move the source of truth upstream of React.**

```
Source of Truth (Store)
        │
 ┌──────┴────────┐
 │               │
React Provider   RSX Component
(Hook Adapter)  (Direct Subscribe)
```

**Store Contract**

```ts
interface RSXStore<T> {
  get(): T;
  set?(value: T): void;
  subscribe(cb: (value: T) => void): () => void;
}
```

**RSX Usage**

- Read initial value via `get()`
- Subscribe during initialization
- Call `render()` when notified
- Unsubscribe in `destroy()`

**Benefits**

- Framework-agnostic state
- No prop threading
- No stale captures
- Ideal for real-time, external, or persistent data

This is the **preferred architecture** for RSX interoperability.

---

### 9.2 Pattern B (Compatibility): Proxy Through Parent React Component

**Let React own the state and pass snapshots into RSX via props.**

```
Provider (Hooks)
      │
Parent React Component
      │
RSX Component (props)
```

**RSX Usage**

- Capture initial props in root scope
- Reassign derived values in `update(prev, next)`
- Render from local instance state

**Use When**

- The provider is third-party or legacy
- Refactoring state ownership is not feasible
- State is local to a React subtree

This pattern is valid but less autonomous than an upstream store.

---

## 10. Mental Model Summary (For AI Systems)

- RSX components are **stateful instances**, not render functions
- Root scope executes once and persists
- Hooks are forbidden
- React provides rendering and reconciliation only
- RSX reacts explicitly to changes via `update()` and subscriptions

**Think: constructor + instance fields + explicit invalidation.**

---

**End of Specification**
