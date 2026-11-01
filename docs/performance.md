# Performance notes

Goal: 60 fps on an integrated GPU, fast load, low memory, and headroom for the content work.
FPS cannot be measured headless (SwiftShader), so `npm run perf` checks hardware-independent budgets instead.

## Regression guard

```
npm run perf            # vite build, serve dist/, headless Chrome, compare with scripts/perf-budget.json (exit 1 on failure)
node scripts/perf.mjs --url http://localhost:5173/   # measure a running dev server (sizes still come from dist/)
node scripts/perf.mjs --root <dir>                   # measure another built copy (before/after)
```

Measured at 5 viewpoints (spawn, avenue, townhall, aerial, plaza, see `VIEWS` in `src/perf.ts`): draw calls and triangles
(steady frame, the frame that re-renders the shadow map, and `?noshadow`), programs, textures, estimated texture MB
(w*h*4*1.33), geometry MB, meshes, scene build ms, JS heap, gzip size of JS, texture bytes, `city.json` gzip.
`window.perfReport()` in the console returns the same data. When you add content on purpose, raise the budget in the same change.

## What the frame looks like

| Part | Mechanism | Where |
|---|---|---|
| Buildings | one mesh per 400 m chunk for all facades (texture array, `tile` vertex attribute) + one mesh per roof material | `city.ts`, `materials.ts` `facadeMaterial` |
| Roads | single chunk, 1 draw per (surface, layer) material, indexed, no culling (about 5k triangles) | `city.ts` |
| Flat ground (lawn, granite, curbs) | merged per material | `props.ts` end of the ground/bed code |
| Props (trees, benches, lamps...) | `instanced()` -> `CulledInstances`: per-instance frustum + distance culling + LOD, 1-3 draws per type | `instancing.ts` |
| Shadows | 2048 map, +-70 m, centre snapped to 128 texels (8.75 m) in light space, re-rendered only when the snap changes | `sky.ts` |
| Ground plane | `renderOrder = 1`: drawn after buildings/roads so early-z skips covered pixels | `main.ts` |
| Resolution | adaptive pixel-ratio ladder 1.5 -> 0.65 when the average frame exceeds 21 ms (`?nogov` disables) | `game.ts` |
| Loading | `compileAsync` + one warm-up frame behind the loading screen (no shader/texture-upload hitch in the first seconds) | `main.ts` |
| Misc | far plane 700 (fog is opaque at 600), sky dome radius 500, context-loss handling, Timer pauses on hidden tab, no per-frame allocations in player/colliders | `game.ts`, `sky.ts` |

## Extension points (how to add content without adding draw calls)

* **Per-building facade** (a shop front, McDonald's, a hand-drawn tile): in your module call
  `extraFacadeTiles['mcdonalds'] = (g, S) => { ...draw on the S x S canvas, 1 bay x 1 storey, plaster already painted... }` at module top level
  (before `loadMaterials()` runs), then get the layer with `mats.facadeLayer('mcdonalds')`. In `city.ts` the layers come from
  `mats.facadeLayer(kind, style)`; to override a building, pick another layer for its `tile` there (e.g. from a `facade` field in `LANDMARKS`).
  All layers have the same size (`FACADE_RES`, currently 512 px = 160 px/m; each layer costs 1.4 MB of GPU memory at 512, 5.6 MB at 1024).
  The mesh stays one per chunk.
* **New instanced prop**: use `instanced(geo, mat, items, place, cast, { maxDist, lods })` in `props.ts`. Give anything with more than ~100 triangles
  a cheaper `lods` entry. Never set `frustumCulled = false` on instances yourself.
* **Small unique meshes** (landmark models): fine up to a few dozen; each costs one draw call plus one shadow draw. Merge pieces that share a
  material (`mergeGeometries`) and share materials/textures between landmarks.
* **New chunked geometry** (extruded details): `Chunks.batch(x, z, material)` then `batch.add()/tri()`. Prefer indexed vertices. Attributes are packed
  (Int8 normals, Uint8 colours). A new material = a new draw call per chunk, so prefer the facade array or a texture atlas over new materials.
* **Photos**: each loaded photo is uncompressed on the GPU (w*h*4*1.33). 2048x1565 RGBA = 17 MB. Keep panels as small as the viewing distance allows,
  pack them into one atlas/material, and prefer a smaller size over more quality (the GPU copy does not depend on the WebP file size).
* **Textures**: run `npm run textures` (fetch + `scripts/optimize-textures.mjs`) so maps are right-sized. Roughness 512, colours/normals of surfaces that
  are not walked on 512.

## Draw-call and triangle budgets (rule of thumb)

Steady frame <= 80 draws, <= 160k triangles, texture memory <= 75 MB, 24 programs (raised once for the first photo-facade content). The shadow-map frame adds the casters in the shadow frustum.
Per-chunk meshes multiply by the number of visible chunks: keep the number of materials per chunk small.

## Not done / ideas

* KTX2/Basis compression (4-8x less GPU memory and faster upload): needs the basis transcoder (~600 kB wasm) and an encoder (`toktx`/`basisu`), neither is installed.
* Instance LOD for buildings (simplified far facades): scene has only ~40k building triangles, not worth it yet; revisit if details multiply it.
* Depth-bias based road layers (would collapse road materials to 3): polygonOffset interplay with granite/lawn/inlay is fragile.
* Real GPU timings: use Chrome DevTools Performance or `EXT_disjoint_timer_query_webgl2` on target hardware.
