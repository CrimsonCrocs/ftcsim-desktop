"use client";

import { useSyncExternalStore } from "react";

// Also cover phones held sideways; desktop windows retain their split panes.
const MOBILE_QUERY = "(max-width: 767px), (max-width: 1023px) and (pointer: coarse)";
function subscribe(notify: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

export function useMobileWorkspace() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
}
