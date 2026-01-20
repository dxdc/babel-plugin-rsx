export default function RsxTimer({ view, update, render, destroy, props }) {
  // ------------------------------------------------------------
  // Persistent instance state
  // ------------------------------------------------------------
  let startMs = 0;
  let lastMs = 0;
  let elapsedMs = 0;
  let frameMs = 0;
  let frameCount = 0;

  let rafId = null;
  let targetFrameMs = 16; // ~60fps default
  let accumulatedMs = 0;

  // ------------------------------------------------------------
  // View (pure projection)
  // ------------------------------------------------------------
  view((props) => {
    if (props.onRenderStart) {
      props.onRenderStart();
    }
    const currentValue = elapsedMs.toFixed(1);

    const result = (
      <div style={{ fontFamily: "monospace", width: 280, textAlign: "center" }}>
        <h3>{props.label}</h3>

        <div
          style={{
            fontSize: 32,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          {currentValue}
        </div>

        <div style={{ textAlign: "center", marginBottom: 8, fontSize: 12, color: "#888" }}>
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

    // Track render time if callback provided
    if (props.onRenderEnd) {
      props.onRenderEnd();
    }

    return result;
  });

  // ------------------------------------------------------------
  // Update (prop-driven reactions)
  // ------------------------------------------------------------
  update((prev, next) => {
    if (!prev?.running && next?.running) {
      reset();
      start();
    } else if (prev?.running && !next?.running) {
      stop();
    }
  });

  // ------------------------------------------------------------
  // Destroy
  // ------------------------------------------------------------
  destroy(() => {
    stop();
  });

  // ------------------------------------------------------------
  // Internal logic
  // ------------------------------------------------------------
  function start() {
    if (rafId !== null) return;

    const now = performance.now();
    startMs = now;
    lastMs = now;

    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId === null) return;

    const now = performance.now();
    accumulatedMs += now - startMs;

    cancelAnimationFrame(rafId);
    rafId = null;
  }

  function reset() {
    stop();

    accumulatedMs = 0;
    frameCount = 0;

    const now = performance.now();
    startMs = now;
    lastMs = now;
    elapsedMs = 0;
    frameMs = 0;
    render();
  }

  function tick(now) {
    const delta = now - lastMs;

    if (delta >= targetFrameMs) {
      frameCount++;
      frameMs = delta;
      elapsedMs = accumulatedMs + (now - startMs);
      lastMs = now;
      render();
    }

    rafId = requestAnimationFrame(tick);
  }

  function increaseFrameRate() {
    targetFrameMs = Math.max(4, targetFrameMs - 4);
  }

  function decreaseFrameRate() {
    targetFrameMs = Math.min(100, targetFrameMs + 4);
  }
}
