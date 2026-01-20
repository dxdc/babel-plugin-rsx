import { transformSync } from "@babel/core";
import { describe, expect, it } from "vitest";
import rsxPlugin from "../src/babel-plugin-rsx.cjs";

function transform(code: string, filename = "test.rsx") {
  const result = transformSync(code, {
    plugins: [rsxPlugin],
    filename,
    presets: ["@babel/preset-react"],
  });
  return result?.code || "";
}

describe("babel-plugin-rsx", () => {
  describe("file extension filtering", () => {
    it("transforms .rsx files", () => {
      const input = `export default function App({ view }) {
        let count = 0;
        view(() => <div>{count}</div>);
      }`;
      const output = transform(input, "App.rsx");
      expect(output).toContain("__instance");
      expect(output).toContain("useRef");
    });

    it("skips non-.rsx files", () => {
      const input = `export default function App() {
        let count = 0;
        return <div>{count}</div>;
      }`;
      const output = transform(input, "App.tsx");
      expect(output).not.toContain("__instance");
    });

    it("skips .jsx files", () => {
      const input = `export default function App() {
        let count = 0;
        return <div>{count}</div>;
      }`;
      const output = transform(input, "App.jsx");
      expect(output).not.toContain("__instance");
    });
  });

  describe("instance variable transformation", () => {
    it("transforms let declarations to instance properties", () => {
      const input = `export default function App({ view, render }) {
        let count = 0;
        function increment() {
          count++;
          render();
        }
        view(() => <button onClick={increment}>{count}</button>);
      }`;
      const output = transform(input);
      expect(output).toContain("__instance");
    });

    it("preserves initial values", () => {
      const input = `export default function App({ view }) {
        let name = "hello";
        let num = 42;
        view(() => <div>{name}</div>);
      }`;
      const output = transform(input);
      expect(output).toContain('"hello"');
      expect(output).toContain("42");
    });

    it("handles null initial values", () => {
      const input = `export default function App({ view }) {
        let ref = null;
        view(() => <div ref={ref} />);
      }`;
      expect(() => transform(input)).not.toThrow();
    });
  });

  describe("hook banning", () => {
    it("throws error for useState", () => {
      const input = `import { useState } from 'react';
      export default function App({ view }) {
        const [x, setX] = useState(0);
        view(() => <div>{x}</div>);
      }`;
      expect(() => transform(input)).toThrow(/useState.*not allowed/);
    });

    it("throws error for useMemo", () => {
      const input = `import { useMemo } from 'react';
      export default function App({ view }) {
        const val = useMemo(() => 42, []);
        view(() => <div>{val}</div>);
      }`;
      expect(() => transform(input)).toThrow(/useMemo.*not allowed/);
    });
  });

  describe("props handling", () => {
    it("throws error when mutating props", () => {
      const input = `export default function App({ view, props }) {
        props.value = 123;
        view(() => <div />);
      }`;
      expect(() => transform(input)).toThrow(/Props are immutable/);
    });

    it("allows reading props", () => {
      const input = `export default function App({ view, props }) {
        let initial = props.value;
        view((p) => <div>{p.name}</div>);
      }`;
      expect(() => transform(input)).not.toThrow();
    });
  });

  describe("lifecycle methods", () => {
    it("preserves view callback", () => {
      const input = `export default function App({ view }) {
        view(() => <div>Hello</div>);
      }`;
      const output = transform(input);
      expect(output).toContain("__rsx_viewCb");
    });

    it("preserves update callback", () => {
      const input = `export default function App({ view, update }) {
        update((prev, next) => console.log(prev, next));
        view(() => <div />);
      }`;
      const output = transform(input);
      expect(output).toContain("__rsx_updateCb");
    });

    it("preserves destroy callback", () => {
      const input = `export default function App({ view, destroy }) {
        destroy(() => console.log('cleanup'));
        view(() => <div />);
      }`;
      const output = transform(input);
      expect(output).toContain("__rsx_destroyCb");
    });
  });

  describe("render triggering", () => {
    it("generates force update mechanism", () => {
      const input = `export default function App({ view, render }) {
        let x = 0;
        function inc() { x++; render(); }
        view(() => <button onClick={inc}>{x}</button>);
      }`;
      const output = transform(input);
      expect(output).toContain("__rsxForceUpdate");
    });
  });

  describe("edge cases", () => {
    it("handles empty component", () => {
      const input = `export default function App({ view }) {
        view(() => null);
      }`;
      expect(() => transform(input)).not.toThrow();
    });

    it("handles component with no view call", () => {
      const input = `export default function App() {
        // No view registered
      }`;
      expect(() => transform(input)).not.toThrow();
    });

    it("handles multiple variables", () => {
      const input = `export default function App({ view }) {
        let a = 1;
        let b = 2;
        let c = 3;
        view(() => <div>{a + b + c}</div>);
      }`;
      expect(() => transform(input)).not.toThrow();
      const output = transform(input);
      expect(output).toContain("__instance");
    });

    it("handles functions defined in component", () => {
      const input = `export default function App({ view, render }) {
        let count = 0;

        function increment() {
          count++;
          render();
        }

        function decrement() {
          count--;
          render();
        }

        view(() => (
          <div>
            <button onClick={decrement}>-</button>
            <span>{count}</span>
            <button onClick={increment}>+</button>
          </div>
        ));
      }`;
      expect(() => transform(input)).not.toThrow();
    });
  });
});
