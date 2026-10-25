"use client";

import { useState, type InputHTMLAttributes } from "react";

/** Preserve incomplete input (empty, minus, decimal) while editing. Valid values
 * update the preview immediately; leaving an incomplete entry restores the last value. */
export function CadNumberInput({ value, onValueChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value: number; onValueChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value)), [editing, setEditing] = useState(false);
  return <input {...props} type="number" value={editing ? draft : String(value)} onFocus={() => { setDraft(String(value)); setEditing(true); }} onChange={(event) => {
    setDraft(event.target.value);
    if (event.target.value.trim() && Number.isFinite(event.currentTarget.valueAsNumber)) onValueChange(event.currentTarget.valueAsNumber);
  }} onBlur={() => setEditing(false)} />;
}
