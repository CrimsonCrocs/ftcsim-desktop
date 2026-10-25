"use client";

import { useEffect, useState } from "react";
import type { SimulatorCameraFrames } from "@/lib/simulator-camera";
import type { SimulatedCameraFrame } from "@ftc-studio/opmode-protocol";
import styles from "./simulator-camera-preview.module.css";

export function SimulatorCameraPreview({ frames, robotId, cameras }: {
  frames: SimulatorCameraFrames; robotId: string; cameras: readonly { name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [image, setImage] = useState<SimulatedCameraFrame>();
  const camera = cameras.some(({ name }) => name === selected) ? selected : cameras[0]?.name;
  useEffect(() => {
    frames.requestPreview(robotId, open ? camera ?? null : null);
    return () => frames.requestPreview(robotId, null);
  }, [frames, robotId, open, camera]);
  useEffect(() => {
    if (!open) return;
    const refresh = () => setImage(frames.latest(robotId).find((frame) => frame.camera === camera));
    refresh();
    const timer = window.setInterval(refresh, 100);
    return () => window.clearInterval(timer);
  }, [open, frames, robotId, camera]);
  if (!cameras.length) return null;
  return <details className={styles.preview} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Webcams</summary>
    {open && <div className={styles.content}>
      {cameras.length > 1 ? <select aria-label="Webcam preview" value={camera} onChange={(event) => setSelected(event.target.value)}>
        {cameras.map(({ name }) => <option key={name}>{name}</option>)}
      </select> : <span>{camera}</span>}
      {/* Camera pixels are generated locally by the scene renderer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image?.camera === camera ? <img width={image.width} height={image.height} src={`data:image/jpeg;base64,${image.imageBase64}`} alt={`${camera}: rendered robot camera`} />
        : <p role="status">Waiting for camera frame…</p>}
    </div>}
  </details>;
}
