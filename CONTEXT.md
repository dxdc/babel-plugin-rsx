# RSX Context (Read First)

We are building an experimental JSX-like language called RSX compiled by a Babel plugin.

## Architecture
- `.rsx` files are user code (no hooks, no React knowledge)
- The Babel plugin transforms RSX into a React function component
- A small runtime module `react-raw.ts` exposes:
  - bindRender(fn)
  - render()

## Semantics (NON-NEGOTIABLE)
1. `bindRender(fn)`:
   - Called ONCE per component mount
   - `fn` MUST synchronously force a React re-render (e.g. setState)
   - react-raw.ts knows nothing about React

2. `render()` (from react-raw):
   - Callable from RSX user code
   - Only schedules a host re-render
   - Does NOT call view() directly

3. React re-render:
   - Re-runs the compiled component function
   - Transformer-generated code recomputes view()
   - JSX returned → DOM updates

## Known Failure
- Calling render() does NOT update the DOM
- Likely cause: Babel plugin injects bindRender incorrectly
  - unguarded (runs every render)
  - wrong import path (duplicate module)
  - name shadowing of render()