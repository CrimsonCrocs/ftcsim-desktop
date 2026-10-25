import { useMemo } from "react";
function navigate(path: string, replace = false) {
  if (!path.startsWith("/")) throw new Error("Desktop navigation requires a local route");
  window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function useRouter() {
  return useMemo(() => ({ push: (p: string) => navigate(p), replace: (p: string) => navigate(p,true),
    refresh: () => window.location.reload(), back: () => window.history.back(), prefetch: async () => undefined }), []);
}
export function usePathname() { return window.location.pathname; }
export function useSearchParams() { return new URLSearchParams(window.location.search); }
