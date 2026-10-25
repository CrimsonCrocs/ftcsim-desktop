import { Gamepad2, Hammer, Play } from "lucide-react";
import { useId } from "react";

/** Reserve a transparent badge recess while keeping the normal run icon's scale. */
export function BuildActionIcon({ kind }: { kind: "play" | "game" }) {
  const mask = useId();
  const RunIcon = kind === "play" ? Play : Gamepad2;
  const hammer = { x: 10, y: 10, width: 14, height: 14, style: { width: 14, height: 14, strokeWidth: 2.5 } };
  return <svg className="header-action__build-composite" viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <mask id={mask} maskUnits="userSpaceOnUse" x={0} y={0} width={24} height={24}>
        <rect width="24" height="24" fill="white" />
        <circle cx={17} cy={17} r={7.5} fill="black" />
      </mask>
    </defs>
    <g mask={`url(#${mask})`}>
      <RunIcon width={24} height={24} style={{ width: 24, height: 24 }} />
    </g>
    <Hammer {...hammer} />
  </svg>;
}
