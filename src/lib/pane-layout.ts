export type PaneLayout = {
  project: number;
  simulator: number;
  bottom: number;
};

export type PaneBounds = {
  min: number;
  max: number;
};

export const PANE_LAYOUT_DEFAULTS: PaneLayout = {
  project: 377,
  simulator: 430,
  bottom: 190,
};

export const PANE_LAYOUT_LIMITS = {
  project: { min: 260, max: 520 },
  simulator: { min: 290, max: 720 },
  bottom: { min: 132, max: 560 },
  editorWidth: 420,
  compactEditorWidth: 300,
  narrowEditorWidth: 240,
  editorHeight: 180,
  railWidth: 40,
  splitterSize: 5,
  projectCollapseWidth: 1120,
} as const;

export function clampPaneSize(value: number, bounds: PaneBounds): number {
  if (!Number.isFinite(value)) return bounds.min;
  return Math.min(Math.max(Math.round(value), bounds.min), bounds.max);
}

export function resizeFromPointer(
  startValue: number,
  startPosition: number,
  currentPosition: number,
  direction: 1 | -1,
  bounds: PaneBounds,
): number {
  return clampPaneSize(startValue + (currentPosition - startPosition) * direction, bounds);
}

export function resizeFromKey(
  key: string,
  value: number,
  direction: 1 | -1,
  bounds: PaneBounds,
  step = 16,
): number | null {
  if (key === "Home") return bounds.min;
  if (key === "End") return bounds.max;

  const physicalDelta = {
    ArrowLeft: -step,
    ArrowUp: -step,
    ArrowRight: step,
    ArrowDown: step,
  }[key];

  if (physicalDelta === undefined) return null;
  return clampPaneSize(value + physicalDelta * direction, bounds);
}

function editorMinimumForWidth(workbenchWidth: number): number {
  if (workbenchWidth <= 900) return PANE_LAYOUT_LIMITS.narrowEditorWidth;
  if (workbenchWidth <= PANE_LAYOUT_LIMITS.projectCollapseWidth) {
    return PANE_LAYOUT_LIMITS.compactEditorWidth;
  }
  return PANE_LAYOUT_LIMITS.editorWidth;
}

export function getPaneBounds(
  preferred: PaneLayout,
  workbenchWidth: number,
  workbenchHeight: number,
  projectOpen: boolean,
  simulatorOpen: boolean,
): Record<keyof PaneLayout, PaneBounds> {
  const projectVisible = projectOpen && workbenchWidth > PANE_LAYOUT_LIMITS.projectCollapseWidth;
  const editorMinimum = editorMinimumForWidth(workbenchWidth);
  const visibleSplitters = Number(projectVisible) + Number(simulatorOpen);
  const paneBudget = Math.max(
    0,
    workbenchWidth
      - PANE_LAYOUT_LIMITS.railWidth * 2
      - PANE_LAYOUT_LIMITS.splitterSize * visibleSplitters
      - editorMinimum,
  );

  const projectMax = projectVisible
    ? paneBudget - (simulatorOpen ? PANE_LAYOUT_LIMITS.simulator.min : 0)
    : PANE_LAYOUT_LIMITS.project.max;
  const simulatorMax = simulatorOpen
    ? paneBudget - (projectVisible ? PANE_LAYOUT_LIMITS.project.min : 0)
    : PANE_LAYOUT_LIMITS.simulator.max;
  const bottomMax = workbenchHeight - PANE_LAYOUT_LIMITS.editorHeight - PANE_LAYOUT_LIMITS.splitterSize;

  return {
    project: {
      min: PANE_LAYOUT_LIMITS.project.min,
      max: Math.max(
        PANE_LAYOUT_LIMITS.project.min,
        Math.min(PANE_LAYOUT_LIMITS.project.max, projectMax),
      ),
    },
    simulator: {
      min: PANE_LAYOUT_LIMITS.simulator.min,
      max: Math.max(
        PANE_LAYOUT_LIMITS.simulator.min,
        Math.min(PANE_LAYOUT_LIMITS.simulator.max, simulatorMax),
      ),
    },
    bottom: {
      min: PANE_LAYOUT_LIMITS.bottom.min,
      max: Math.max(
        PANE_LAYOUT_LIMITS.bottom.min,
        Math.min(PANE_LAYOUT_LIMITS.bottom.max, bottomMax),
      ),
    },
  };
}

export function fitPaneLayout(
  preferred: PaneLayout,
  workbenchWidth: number,
  workbenchHeight: number,
  projectOpen: boolean,
  simulatorOpen: boolean,
): PaneLayout {
  const bounds = getPaneBounds(
    preferred,
    workbenchWidth,
    workbenchHeight,
    projectOpen,
    simulatorOpen,
  );
  const projectVisible = projectOpen && workbenchWidth > PANE_LAYOUT_LIMITS.projectCollapseWidth;

  let project = clampPaneSize(preferred.project, bounds.project);
  let simulator = clampPaneSize(preferred.simulator, bounds.simulator);

  if (projectVisible && simulatorOpen) {
    const editorMinimum = editorMinimumForWidth(workbenchWidth);
    const paneBudget = workbenchWidth
      - PANE_LAYOUT_LIMITS.railWidth * 2
      - PANE_LAYOUT_LIMITS.splitterSize * 2
      - editorMinimum;
    const overflow = project + simulator - paneBudget;

    if (overflow > 0) {
      const simulatorReduction = Math.min(
        overflow,
        simulator - PANE_LAYOUT_LIMITS.simulator.min,
      );
      simulator -= simulatorReduction;
      project -= Math.min(
        overflow - simulatorReduction,
        project - PANE_LAYOUT_LIMITS.project.min,
      );
    }
  }

  return {
    project,
    simulator,
    bottom: clampPaneSize(preferred.bottom, bounds.bottom),
  };
}

