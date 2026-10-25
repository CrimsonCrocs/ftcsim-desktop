"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  clampPaneSize,
  resizeFromKey,
  resizeFromPointer,
  type PaneBounds,
} from "@/lib/pane-layout";

type ResizeHandleProps = {
  label: string;
  orientation: "horizontal" | "vertical";
  value: number;
  bounds: PaneBounds;
  defaultValue: number;
  direction: 1 | -1;
  onResize: (value: number) => void;
};

type PointerStart = {
  pointerId: number;
  position: number;
  value: number;
};

export function ResizeHandle({
  label,
  orientation,
  value,
  bounds,
  defaultValue,
  direction,
  onResize,
}: ResizeHandleProps) {
  const pointerStart = useRef<PointerStart | null>(null);

  const positionFromPointer = (event: PointerEvent<HTMLDivElement>) => (
    orientation === "vertical" ? event.clientX : event.clientY
  );

  const finishPointerResize = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerStart.current?.pointerId !== event.pointerId) return;
    pointerStart.current = null;
    document.documentElement.classList.remove("is-resizing-panes");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = resizeFromKey(event.key, value, direction, bounds, event.shiftKey ? 40 : 16);
    if (next === null) return;
    event.preventDefault();
    onResize(next);
  };

  return (
    <div
      className={`resize-handle resize-handle--${orientation}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} pixels`}
      title={`${label}. Drag or use arrow keys; double-click to reset.`}
      onDoubleClick={() => onResize(clampPaneSize(defaultValue, bounds))}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        pointerStart.current = {
          pointerId: event.pointerId,
          position: positionFromPointer(event),
          value,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        document.documentElement.classList.add("is-resizing-panes");
      }}
      onPointerMove={(event) => {
        const start = pointerStart.current;
        if (!start || start.pointerId !== event.pointerId) return;
        onResize(resizeFromPointer(
          start.value,
          start.position,
          positionFromPointer(event),
          direction,
          bounds,
        ));
      }}
      onPointerUp={finishPointerResize}
      onPointerCancel={finishPointerResize}
      onLostPointerCapture={() => {
        pointerStart.current = null;
        document.documentElement.classList.remove("is-resizing-panes");
      }}
    />
  );
}
