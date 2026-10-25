"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export function useSimulatorFullscreen(target: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageFullscreen, setPageFullscreen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === target.current);
    document.addEventListener("fullscreenchange", sync);
    sync();
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [target]);

  useEffect(() => {
    if (!pageFullscreen || !target.current) return;
    const element = target.current;
    const inertElements = new Map<HTMLElement, boolean>();
    let current: HTMLElement | null = element;
    while (current?.parentElement) {
      for (const sibling of current.parentElement.children) {
        if (sibling !== current && sibling instanceof HTMLElement) {
          inertElements.set(sibling, sibling.inert);
          sibling.setAttribute("inert", "");
        }
      }
      current = current.parentElement;
      if (current === document.body) break;
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setPageFullscreen(false); }
      if (event.key !== "Tab") return;
      const controls = [...element.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), [tabindex='0']")]
        .filter(control => control.getClientRects().length > 0);
      const next = event.shiftKey ? controls.at(-1) : controls[0];
      if (document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) {
        event.preventDefault(); next?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      inertElements.forEach((wasInert, sibling) => {
        if (!wasInert) sibling.removeAttribute("inert");
      });
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, [pageFullscreen, target]);

  const toggleFullscreen = async () => {
    const element = target.current;
    if (!element) return;
    if (pageFullscreen) { setPageFullscreen(false); return; }
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
      } else {
        if (document.fullscreenElement) await document.exitFullscreen();
        if (element.requestFullscreen) await element.requestFullscreen();
        else setPageFullscreen(true);
      }
    } catch {
      // iPhone Safari and embedded browsers may not allow element fullscreen.
      // The in-page view keeps the same controls and an explicit exit path.
      setPageFullscreen(true);
    }
  };

  return { isFullscreen: isFullscreen || pageFullscreen, toggleFullscreen };
}
