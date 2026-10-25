# Wheel assets and placements

The CAD files in this folder are browser-ready glTF binary models. Their sidecar `.glb.json` files record the exact STEP input hash and the conversion settings.

| Browser model | Source part | Wheel type | Size after optimization |
|---|---|---|---:|
| `rev-41-1190-90mm-omni.glb` | REV-41-1190 | 90 mm omni | ~302 KB |
| `gobilda-3625-0100-0104-left-mecanum.glb` | goBILDA 3625-0100-0104 | 104 mm left-slant mecanum | ~1.4 MB |
| `gobilda-3625-0001-0104-right-mecanum.glb` | goBILDA 3625-0001-0104 | 104 mm right-slant mecanum | ~1.4 MB |
| `ftc-perimeter-revb.glb` | AndyMark am-0481b | FTC field perimeter, Rev B | ~3.6 MB |

The REV product page identifies REV-41-1190 as a 90 mm omni wheel and explains that its outer rollers freely spin perpendicular to its powered direction. goBILDA's assembly instructions identify SKU `3625-0100-0104` as left-slant and `3625-0001-0104` as right-slant, and specify the rollers should point diagonally outward from the chassis in a correct mecanum configuration.

The exact placement/rotation reference is [wheel-layouts.json](./wheel-layouts.json). It uses this basis:

- +X forward
- +Y up
- +Z robot-left

The goBILDA CAD files use a different source hub axis than the REV file. Keep the listed base rotation in a parent group, then animate the wheel inside that group around its listed `worldSpinAxis`; do not assume every asset spins around local Z.

## Field perimeter

The [field-layout.json](./field-layout.json) transform is already suitable for the same coordinate system. The CAD is centred in X/Z, has +Y up, and measures approximately `3.645067 × 0.342526 × 3.645067 m` after conversion. Its bottom extends `5.969 mm` below its source origin, so use the listed `Y=0.005969` translation to rest it on a simulator floor at world `Y=0`. The browser asset retains the detailed Rev B extrusion, fasteners, corner brackets, and panel geometry at 176,578 triangles. The two optional mid-field retention straps and their clips are excluded by CAD node name so they are not mistaken for field markings in the simulator.

Sources: [REV DUO Omni Wheels](https://www.revrobotics.com/DUO-Omni-Wheels/), [goBILDA FTC starter-bot assembly instructions](https://www.gobilda.com/content/user_manuals/3200-2526-0003_assembly-instructions.min.pdf), [goBILDA Strafer chassis instructions](https://www.gobilda.com/content/user_manuals/3209-0001-0007_assembly-instructions.min.pdf), and [AndyMark FTC Perimeter Kit](https://andymark.com/products/first-tech-challenge-perimeter-kit).
