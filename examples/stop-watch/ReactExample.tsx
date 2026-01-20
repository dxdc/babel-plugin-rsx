import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface HighResTimerReactProps {
  label?: string;
  running?: boolean; // optional external control
  onRenderStart?: () => void;
  onRenderEnd?: () => void;
}

export default function ReactTimer({
  label = "React Timer",
  running: runningProp,
  onRenderStart,
  onRenderEnd,
}: HighResTimerReactProps) {
  // ------------------------------------------------------------
  // React state
  // ------------------------------------------------------------
  const [elapsedMs, setElapsedMs] = useState(0);
  const [frameMs, setFrameMs] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [running, setRunning] = useState<boolean>(!!runningProp);

  // ------------------------------------------------------------
  // Mutable refs (non-reactive)
  // ------------------------------------------------------------
  const startMsRef = useRef(0);
  const lastMsRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const targetFrameMsRef = useRef(16); // ~60fps

  const resetCounters = () => {
    accumulatedMsRef.current = 0;

    setElapsedMs(0);
    setFrameMs(0);
    setFrameCount(0);

    const now = performance.now();
    startMsRef.current = now;
    lastMsRef.current = now;
  };

  const reset = () => {
    setRunning(false);
    resetCounters();
  };

  // ------------------------------------------------------------
  // Sync external running prop (optional)
  // ------------------------------------------------------------
  useEffect(() => {
    if (typeof runningProp === "boolean") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRunning(runningProp);
    }
  }, [runningProp]);

  // ------------------------------------------------------------
  // RAF loop owned entirely by this effect
  // ------------------------------------------------------------
  useEffect(() => {
    function loop(now: number) {
      const delta = now - lastMsRef.current;

      if (delta >= targetFrameMsRef.current) {
        lastMsRef.current = now;
        setFrameCount((c) => c + 1);
        setFrameMs(delta);
        setElapsedMs(accumulatedMsRef.current + (now - startMsRef.current));
      }

      rafIdRef.current = requestAnimationFrame(loop);
    }

    if (running && rafIdRef.current === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      resetCounters();

      rafIdRef.current = requestAnimationFrame(loop);
    }

    if (!running && rafIdRef.current !== null) {
      const now = performance.now();
      accumulatedMsRef.current += now - startMsRef.current;

      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [running]);

  // ------------------------------------------------------------
  // Button handlers (pure state changes)
  // ------------------------------------------------------------
  const start = () => setRunning(true);
  const stop = () => setRunning(false);

  // ------------------------------------------------------------
  // Frame rate controls
  // ------------------------------------------------------------
  const increaseFrameRate = () => {
    targetFrameMsRef.current = Math.max(4, targetFrameMsRef.current - 4);
  };

  const decreaseFrameRate = () => {
    targetFrameMsRef.current = Math.min(100, targetFrameMsRef.current + 4);
  };

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------
  onRenderStart?.();

  // Track after render completes (via effect)
  useLayoutEffect(() => {
    onRenderEnd?.();
  });

  return (
    <div style={{ fontFamily: "monospace", width: 280, textAlign: "center" }}>
      <h3>{label}</h3>

      <div
        style={{
          fontSize: 32,
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        {elapsedMs.toFixed(1)}
      </div>

      <div
        style={{
          textAlign: "center",
          marginBottom: 8,
          fontSize: 12,
          color: "#888",
        }}
      >
        Frames: {frameCount}
      </div>

      <div style={{ textAlign: "center", marginBottom: 12 }}>
        Frame time: {frameMs.toFixed(2)} ms
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
        }}
      >
        <button onClick={start}>Start</button>
        <button onClick={stop}>Stop</button>
        <button onClick={reset}>Reset</button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          marginTop: 10,
        }}
      >
        <button onClick={increaseFrameRate}>Increase Frame Rate</button>
        <button onClick={decreaseFrameRate}>Decrease Frame Rate</button>
      </div>
    </div>
  );
}
