"use client";

import { Component, Suspense, useEffect, type ReactNode } from "react";

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}

/** A slow or failed part cannot hide its loaded siblings. */
export class WorldAssetBoundary extends Component<{
  children: ReactNode;
  onReady: () => void;
  onError: () => void;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() {
    if (this.state.failed) return null;
    return <Suspense fallback={null}>{this.props.children}<Ready onReady={this.props.onReady} /></Suspense>;
  }
}
