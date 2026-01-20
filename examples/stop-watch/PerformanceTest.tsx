import { useCallback, useRef, useState } from "react";
import ReactTimer from "./ReactExample.tsx";
import RsxTimer from "./RsxExample.rsx";

interface PerfMetrics {
  renderCount: number;
  avgRenderTime: number;
  totalRenderTime: number;
  minRenderTime: number;
  maxRenderTime: number;
}

function usePerfTracker(label: string) {
  const metricsRef = useRef<PerfMetrics>({
    renderCount: 0,
    avgRenderTime: 0,
    totalRenderTime: 0,
    minRenderTime: Infinity,
    maxRenderTime: 0,
  });
  const lastRenderStart = useRef(0);

  const onRenderStart = useCallback(() => {
    lastRenderStart.current = performance.now();
  }, []);

  const onRenderEnd = useCallback(() => {
    const duration = performance.now() - lastRenderStart.current;
    const m = metricsRef.current;

    m.renderCount++;
    m.totalRenderTime += duration;
    m.avgRenderTime = m.totalRenderTime / m.renderCount;
    m.minRenderTime = Math.min(m.minRenderTime, duration);
    m.maxRenderTime = Math.max(m.maxRenderTime, duration);
  }, []);

  const getMetrics = useCallback(() => ({ ...metricsRef.current }), []);

  const reset = useCallback(() => {
    metricsRef.current = {
      renderCount: 0,
      avgRenderTime: 0,
      totalRenderTime: 0,
      minRenderTime: Infinity,
      maxRenderTime: 0,
    };
  }, []);

  return { onRenderStart, onRenderEnd, getMetrics, reset, label };
}

export default function PerformanceTest() {
  const [running, setRunning] = useState(false);
  const [instanceCount, setInstanceCount] = useState(1);
  const [results, setResults] = useState<{
    react: PerfMetrics;
    rsx: PerfMetrics;
  } | null>(null);
  const [testDuration, setTestDuration] = useState(5); // seconds

  const reactTracker = usePerfTracker("React");
  const rsxTracker = usePerfTracker("RSX");

  const runTest = useCallback(() => {
    // Reset metrics
    reactTracker.reset();
    rsxTracker.reset();
    setResults(null);

    // Start timers
    setRunning(true);

    // Stop after duration and collect results
    setTimeout(() => {
      setRunning(false);

      // Small delay to ensure final renders are counted
      setTimeout(() => {
        setResults({
          react: reactTracker.getMetrics(),
          rsx: rsxTracker.getMetrics(),
        });
      }, 100);
    }, testDuration * 1000);
  }, [testDuration, reactTracker, rsxTracker]);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui", color: "inherit" }}>
      <h1>Performance Test: React vs RSX</h1>

      {/* Controls */}
      <div
        style={{
          marginBottom: 20,
          display: "flex",
          gap: 16,
          alignItems: "center",
        }}
      >
        <label>
          Test Duration (s):
          <input
            type="number"
            value={testDuration}
            onChange={(e) => setTestDuration(Number(e.target.value))}
            min={1}
            max={30}
            style={{ marginLeft: 8, width: 60 }}
          />
        </label>

        <label>
          Instances:
          <input
            type="number"
            value={instanceCount}
            onChange={(e) => setInstanceCount(Math.max(1, Number(e.target.value)))}
            min={1}
            max={100}
            style={{ marginLeft: 8, width: 60 }}
          />
        </label>

        <button onClick={runTest} disabled={running} style={{ padding: "8px 16px", fontSize: 16 }}>
          {running ? `Running... (${testDuration}s)` : "Run Performance Test"}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            background: "rgba(128, 128, 128, 0.1)",
            borderRadius: 8,
          }}
        >
          <h2>
            Results ({testDuration}s test, {instanceCount} instance(s))
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #333" }}>
                <th style={{ textAlign: "left", padding: 8 }}>Metric</th>
                <th style={{ textAlign: "right", padding: 8 }}>RSX</th>
                <th style={{ textAlign: "right", padding: 8 }}>React</th>
                <th style={{ textAlign: "right", padding: 8 }}>Difference</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 8 }}>Render Count</td>
                <td style={{ textAlign: "right", padding: 8 }}>{results.rsx.renderCount}</td>
                <td style={{ textAlign: "right", padding: 8 }}>{results.react.renderCount}</td>
                <td style={{ textAlign: "right", padding: 8 }}>
                  {results.react.renderCount - results.rsx.renderCount}
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8 }}>Avg Render Time (ms)</td>
                <td style={{ textAlign: "right", padding: 8 }}>
                  {results.rsx.avgRenderTime.toFixed(3)}
                </td>
                <td style={{ textAlign: "right", padding: 8 }}>
                  {results.react.avgRenderTime.toFixed(3)}
                </td>
                <td style={{ textAlign: "right", padding: 8 }}>
                  {(results.react.avgRenderTime - results.rsx.avgRenderTime).toFixed(3)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8 }}>Total Render Time (ms)</td>
                <td style={{ textAlign: "right", padding: 8 }}>
                  {results.rsx.totalRenderTime.toFixed(2)}
                </td>
                <td style={{ textAlign: "right", padding: 8 }}>
                  {results.react.totalRenderTime.toFixed(2)}
                </td>
                <td style={{ textAlign: "right", padding: 8 }}>
                  {(results.react.totalRenderTime - results.rsx.totalRenderTime).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Side-by-side timers */}
      <div style={{ display: "flex", gap: 60, justifyContent: "center" }}>
        <div
          style={{
            padding: 24,
            background: "rgba(128, 128, 128, 0.05)",
            borderRadius: 12,
            minWidth: 320,
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 16, textAlign: "center" }}>
            RSX Timer {instanceCount > 1 ? `(${instanceCount}x)` : ""}
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
            {Array.from({ length: instanceCount }).map((_, i) => (
              <RsxTimer
                key={i}
                running={running}
                label={instanceCount > 1 ? `RSX #${i + 1}` : "RSX"}
                onRenderStart={rsxTracker.onRenderStart}
                onRenderEnd={rsxTracker.onRenderEnd}
              />
            ))}
          </div>
        </div>

        <div
          style={{
            padding: 24,
            background: "rgba(128, 128, 128, 0.05)",
            borderRadius: 12,
            minWidth: 320,
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 16, textAlign: "center" }}>
            React Timer {instanceCount > 1 ? `(${instanceCount}x)` : ""}
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
            {Array.from({ length: instanceCount }).map((_, i) => (
              <ReactTimer
                key={i}
                running={running}
                label={instanceCount > 1 ? `React #${i + 1}` : "React"}
                onRenderStart={reactTracker.onRenderStart}
                onRenderEnd={reactTracker.onRenderEnd}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div
        style={{
          marginTop: 40,
          padding: 16,
          background: "rgba(100, 150, 255, 0.1)",
          borderRadius: 8,
        }}
      >
        <h3>Additional Testing Methods:</h3>
        <ol>
          <li>
            <strong>Chrome DevTools Performance Tab:</strong> Record while running to see CPU/memory
            usage
          </li>
          <li>
            <strong>React DevTools Profiler:</strong> Shows component render counts and durations
          </li>
          <li>
            <strong>Memory Tab:</strong> Take heap snapshots before/after to compare memory usage
          </li>
          <li>
            <strong>Lighthouse:</strong> Run performance audit for overall metrics
          </li>
        </ol>
      </div>
    </div>
  );
}
