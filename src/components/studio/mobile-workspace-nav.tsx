"use client";

export type MobileWorkspaceView = "files" | "code" | "simulation" | "output";

const views: { id: MobileWorkspaceView; label: string; path: string }[] = [
  { id: "files", label: "Files", path: "M3 7V5h6l2 2h10v13H3V7Z" },
  { id: "code", label: "Code", path: "m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" },
  { id: "simulation", label: "Simulation", path: "m8 4 13 8-13 8V4Z" },
  { id: "output", label: "Output", path: "M3 4h18v16H3V4Zm3 4 3 3-3 3m6 1h5" },
];

export function MobileWorkspaceNav({ view, onChange, hasProblems, blocksOnly = false }: {
  view: MobileWorkspaceView;
  onChange: (view: MobileWorkspaceView) => void;
  hasProblems: boolean;
  blocksOnly?: boolean;
}) {
  return <nav className="mobile-workspace-nav" aria-label="Workspace views">
    {views.map(({ id, label, path }) => {
      const displayLabel = blocksOnly && id === "files" ? "OpModes" : label;
      const iconPath = blocksOnly && id === "files"
        ? "M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z"
        : path;
      return (
        <button key={id} type="button"
          aria-label={displayLabel}
          aria-current={view === id ? "page" : undefined}
          onClick={() => onChange(id)}
          aria-controls={id === "code" ? "editor-workspace" : `mobile-${id}-view`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d={iconPath} />
          </svg>
          <span>{displayLabel}{id === "output" && hasProblems && <span className="mobile-workspace-nav__alert" aria-label="has errors">!</span>}</span>
        </button>
      );
    })}
  </nav>;
}
