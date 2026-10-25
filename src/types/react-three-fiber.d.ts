import type { ThreeElements } from "@react-three/fiber";

/* eslint-disable @typescript-eslint/no-empty-object-type -- JSX module augmentation must use interfaces. */

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module "react/jsx-dev-runtime" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
