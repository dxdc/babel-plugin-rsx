import React, { useState } from "react";
import styles from "./App.module.css";
import { CodeViewer } from "./components/CodeViewer";
import { getFilename, getSourceCode } from "./utils/sourceLoader";

/**
 * NOTE:
 * For now we statically register examples.
 * Later this can be auto-generated via Vite glob imports.
 */
import timerManifest from "./stop-watch/manifest.json";
import PerformanceTest from "./stop-watch/PerformanceTest.tsx";
import ReactTimer from "./stop-watch/ReactExample.tsx";
import RsxTimer from "./stop-watch/RsxExample.rsx";

type Example = {
  id: string;
  name: string;
  description: string;
  Rsx: React.ComponentType<Record<string, unknown>>;
  React: React.ComponentType<Record<string, unknown>>;
  standalone?: boolean;
};

const EXAMPLES: Example[] = [
  {
    id: "stop-watch",
    name: timerManifest.name,
    description: timerManifest.description,
    Rsx: RsxTimer,
    React: ReactTimer,
  },
  {
    id: "performance-test",
    name: "Performance Test",
    description: "Benchmark React vs RSX render performance",
    Rsx: PerformanceTest,
    React: PerformanceTest,
    standalone: true,
  },
];

type Tab = "demo" | "code";

export default function App() {
  const [activeExample, setActiveExample] = useState<string | null>(EXAMPLES[0]?.id ?? null);

  return (
    <div className={styles.app}>
      {/* Sidebar / Index */}
      <aside className={styles.sidebar}>
        <h2>RSX vs TSX</h2>
        <ul className={styles.exampleList}>
          {EXAMPLES.map((ex) => (
            <li
              key={ex.id}
              className={ex.id === activeExample ? styles.activeItem : undefined}
              onClick={() => setActiveExample(ex.id)}
            >
              <strong>{ex.name}</strong>
              <p>{ex.description}</p>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main Content */}
      <main className={styles.main}>
        {EXAMPLES.map((ex) =>
          ex.id === activeExample ? <ExampleView key={ex.id} example={ex} /> : null
        )}
      </main>
    </div>
  );
}

/* -------------------------------------------------- */
/* Example View */
/* -------------------------------------------------- */

function ExampleView({ example }: { example: Example }) {
  if (example.standalone) {
    return (
      <div className={styles.example} style={{ gridTemplateColumns: "1fr" }}>
        <example.Rsx />
      </div>
    );
  }

  return (
    <div className={styles.example}>
      <Panel title="RSX" Component={example.Rsx} exampleId={example.id} type="rsx" />
      <Panel title="React" Component={example.React} exampleId={example.id} type="react" />
    </div>
  );
}

/* -------------------------------------------------- */
/* Panel (Left / Right) */
/* -------------------------------------------------- */

function Panel({
  title,
  Component,
  exampleId,
  type,
}: {
  title: string;
  Component: React.ComponentType<Record<string, unknown>>;
  exampleId: string;
  type: "rsx" | "react";
}) {
  const [tab, setTab] = useState<Tab>("demo");

  return (
    <section className={styles.panel}>
      <header className={styles.panelHeader}>
        <h3>{title}</h3>
        <div className={styles.tabs}>
          <button
            className={tab === "demo" ? styles.activeTab : undefined}
            onClick={() => setTab("demo")}
          >
            Demo
          </button>
          <button
            className={tab === "code" ? styles.activeTab : undefined}
            onClick={() => setTab("code")}
          >
            Code
          </button>
        </div>
      </header>

      <div className={styles.panelBody}>
        {tab === "demo" ? (
          <Component label={`${title} Timer`} />
        ) : (
          <CodeViewer
            code={getSourceCode(exampleId, type)}
            language="tsx"
            filename={getFilename(exampleId, type)}
          />
        )}
      </div>
    </section>
  );
}
