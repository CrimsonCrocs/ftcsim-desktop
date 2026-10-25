# goBILDA 96 mm mecanum wheel CAD

These GLBs are converted from the official [goBILDA 96 mm Mecanum Wheel Set CAD](https://www.gobilda.com/96mm-mecanum-wheel-set-70a-durometer-bearing-supported-rollers/), SKU 3213-3606-0002. The official page links the STEP ZIP at [https://www.gobilda.com/content/step_files/3213-3606-0002.zip](https://www.gobilda.com/content/step_files/3213-3606-0002.zip).

The STEP assemblies provide the actual two steel side plates, central core, 10 diagonal roller assemblies, and their hardware. They contain no color assignments; the conversion applies documented steel, polymer, rubber, and fastener materials using CAD part names. Roller barrels and plate apertures remain modeled after the recorded tessellation and simplification steps. CAD ownership remains with goBILDA LLC; the source was downloaded through the public product-page link. This provenance does not assert broader licensing or redistribution terms.

## Asset contract

- Units: metres. Nominal diameter: 0.096 m.
- Origin: centered on the source full-assembly bounding box. Post-simplification output center residual is recorded per asset (at most 0.004 mm).
- Axle: local Z; face plane: XY. +X is right, +Y is up, and +Z points toward the viewed face. Rotate about -Z for positive physical wheel speed.
- Left/right: the XZ projection of the roller axle at the ground-contact side (-Y), viewed from +Z, determines the sign. Angles use the equivalent axis vector with +X component and `theta = atan2(-axisZ, axisX)`, matching the simulator traction vector `(+cos(theta), 0, -sin(theta))`. From the STEP roller-cover geometry, the left assembly measures about −46.53° at the bottom and the right about +46.43°, so wheel-left matches negative tractionAngle and wheel-right matches positive tractionAngle. At the top (+Y), the signs reverse: left +46.53°, right −46.43°. The axis is estimated from each roller cover's principal geometry axis. No rotation or mirroring is applied.

| Asset | Slant | Bytes | Triangles | Draw calls | SHA-256 |
|---|---|---:|---:|---:|---|
| left | left-slant | 769,996 | 40,924 | 4 | 0374b21dc9d5ec6a3e647e0838e3684381d77a3e3d961ada444488eda4b98d45 |
| right | right-slant | 690,740 | 36,622 | 4 | c0ef564dc2a489cb613d16d03a2e93a0fa8eda753f9bc30281630dc4fd6b6bc8 |

See [provenance.json](./provenance.json) for source and output hashes, each asset’s center translation, material values, post-optimization dimensions, and vertex/triangle counts. Rebuild from the official ZIP with `node tools/cad-convert/build-gobilda-mecanum.mjs`; pass `--offline-zip /path/to/3213-3606-0002.zip` to use a local copy. The helper checks the pinned official archive hash before conversion.
