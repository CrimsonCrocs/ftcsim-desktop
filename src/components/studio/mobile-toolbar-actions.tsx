"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function MobileToolbarActions({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return <div className="mobile-toolbar-actions" ref={root}>
    <button ref={trigger} type="button" className="header-action" title="Build and tools"
      aria-label="Build and tools" aria-expanded={open} aria-controls="mobile-build-tools"
      onClick={() => setOpen(value => !value)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
    </button>
    {open && <div id="mobile-build-tools" className="mobile-toolbar-actions__panel" role="group" aria-label="Build and tools"
      onClick={(event) => { if ((event.target as Element).closest("button:not(:disabled)")) { setOpen(false); trigger.current?.focus(); } }}>
      {children}
    </div>}
  </div>;
}
