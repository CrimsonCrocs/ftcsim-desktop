import { createElement, lazy, Suspense, type Attributes, type ComponentType, type ReactNode } from "react";
export default function dynamic<P extends object = object>(
  loader: () => Promise<ComponentType<P> | { default: ComponentType<P> }>,
  options: { ssr?: boolean; loading?: () => ReactNode } = {},
) {
  const Component = lazy(async () => {
    const loaded = await loader();
    return { default: typeof loaded === "object" && "default" in loaded ? loaded.default : loaded as ComponentType<P> };
  });
  return function DesktopDynamic(props: P) {
    return <Suspense fallback={options.loading?.() ?? null}>{createElement(Component, props as P & Attributes)}</Suspense>;
  };
}
