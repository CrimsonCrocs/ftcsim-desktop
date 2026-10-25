"use client";
import { createContext } from "react";
import type { CadModelAsset } from "@/lib/cad/assets";

export const CadAssetReaderContext = createContext<(asset: CadModelAsset) => Promise<ArrayBuffer>>(async () => { throw new Error("The project CAD asset reader is unavailable."); });
