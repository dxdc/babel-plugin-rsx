# RSX Context (Read First)

RSX is an experimental JSX-like language compiled by a Babel plugin. The design centers around a custom component lifecycle managed via a ctx parameter, which is passed to each RSX component on mount.

## Architecture

- `.rsx` files are user code (no hooks, no React knowledge required)
- The Babel plugin transforms RSX into a React function component
- The ctx parameter contains:
  - Initial props (note: these go stale after any update call)
  - Four lifecycle methods:
    1. `view(cb: (props) => React.ReactNode)` — Register a render callback for initial mount
    2. `update(cb: (prevProps, nextProps) => void)` — Register a callback for prop changes
    3. `destroy(cb: () => void)` — Register a cleanup callback for unmount
    4. `render()` — Schedules a re-render; can be called directly by the component or after an update

## Lifecycle & Execution

- Each component is executed exactly once when mounted.
- All variables declared at the root level of the component are persistent for the duration of the mount.
- `update` is called after any prop change.
- `render` is called after an update or when invoked directly by the component via `render()`.
- After an update, the props in ctx become stale; use the callback parameters for the latest values.

## Notes

- The types for lifecycle callbacks are defined in `custom.d.ts`.
- The Babel plugin ensures the correct injection and wiring of lifecycle methods.

## Did I forget anything?

- If there are additional lifecycle hooks or behaviors, please update this file accordingly.
