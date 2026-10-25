"use client";

import { useEffect, useState } from "react";

export function BuildElapsedTime({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1_000));
  return <span className="build-elapsed-time" role="timer" aria-label="Build elapsed time">
    Elapsed {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
  </span>;
}
