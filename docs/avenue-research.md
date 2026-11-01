# проспект Свободи: research notes (content/realism pass)

Date of research: 2026-10-31. Everything below is either **verified** (photo or OSM tag cited) or marked *guess*.

## Data sources
| Source | Used for | Licence |
|---|---|---|
| `export.geojson` (OSM, never modified) | footprints, `building:levels`, `start_date`, `building:colour`, road geometry, `lanes`, `surface`, `lane_markings` | ODbL |
| Overpass API, one query for the bbox of the GeoJSON -> `data/osm-poi.json` (`npm run poi`) | 3057 nodes: shops/cafes (names for signs), benches, waste baskets, bicycle parking, street lamps, bus stops, trees, crossings, McDonald's | ODbL |
| Wikimedia Commons categories `Category:Svobody Avenue, Lviv`, `Category:<N> Svobody Avenue, Lviv`, `Category:Lviv Opera House` | facade photos, signage reference, colours | CC BY / CC BY-SA, per file in `public/photos/CREDITS.txt` |
| ambientCG (API) | PBR textures | CC0 |
| zaxid.net (March 2026 article) / vikna.tv list of Lviv McDonald's | address of the restaurant (text only, nothing copied) | n/a |

## McDonald's
* Address: **проспект Свободи, 35** (zaxid.net 2026-03 lists it among the working Lviv restaurants; older vikna.tv list has it too).
* OSM: node `3234371410` (`amenity=fast_food`, `brand=McDonald's`, `opening_hours=Mo-Su 07:00-23:00`, `outdoor_seating=yes`, `indoor_seating=yes`, `toilets=yes`) lies inside the footprint **`way/171080874`** (`addr:housenumber=35`, `building:levels=4`, `start_date=1800` in OSM, `roof:shape=quadruple_saltbox`). Verified by point-in-polygon on the projected data (node is 1.7 m from the east wall).
* The building is the *Feller Passage* (Пасаж Феллерів), a yellow Art-Nouveau/historicist block with a red sheet-metal roof, balcony railing above the shop level and a central arched passage. Verified from Commons "Пасаж Феллерів.jpg" (2023-01-31, Vikcos75) and "Пасаж Феллерів 2025.jpg" (2025-11-30, Бондар Володимир): the signage is identical in both photos, i.e. current.
* Layout of the ground floor, left (south) to right (north), measured against the 26.5 m OSM wall: "Напої та тютюн" (black fascia), "Appleroom.ua" (black fascia), arched passage with teal "Камера схову / Luggage room" sign, two McDonald's units (white outlined "McDonald's" letters pinned straight on the yellow wall, small golden arches between them, yellow awning under the left sign, high clerestory windows, lit dining room, glass door in the right unit). Drawn procedurally in `src/world/avenue/ground-front.ts` (logo redrawn, no photo pixels used) plus a 3D awning.
* Not modelled: a terrace. OSM says `outdoor_seating=yes` but neither photo shows tables (the pavement is ~2.5 m deep, winter photos) - *unverified, left out*.
* Heritage constraint visible in the photos: no illuminated box signs, letters directly on the facade; followed.

## Facades
Four photo panels (rectified by a 4-point homography, `scripts/prepare-photos.ts`, config + corner pixels in `scripts/facade-config.ts`), hung on the street-facing wall of the OSM footprint; panel width = wall length from the GeoJSON (`scripts/frontage.ts`), photo only supplies the look:

| no. | OSM | photo (date) | notes |
|---|---|---|---|
| 35 | way/171080874 | Пасаж Феллерів.jpg (2023-01) | upper floors + gables; ground floor hand-drawn |
| 20 | relation/254623 | Національний музей м.Львів.jpg (2025-05) | whole facade incl. dome; wall chord = footprint vertices 0..4 (26 m, the real facade looks wider: panel is squeezed horizontally) |
| 27 | relation/11543015 | Львів. Просп. Свободи 27.jpg (**2016-07**) | Opera Passage, red brick; no 2022+ frontal photo exists |
| 29 | way/171080905 | Львів. Просп. Свободи 29.jpg (**2016-07**) | no 2022+ frontal photo |

Panel heights are estimated from the photo scale (horizontal px/m of the wall) - good to maybe +-1.5 m, *estimate*.
Other avenue buildings get a plaster colour from photos (`src/world/avenue/tints.ts`, eyeballed) and a style from OSM `start_date` (pre-1830 and post-1945 plain, historicist era with pilasters/arches). Grand Hotel (no. 13) is rose pink (2025 photos); a rectified panel was not possible (all frontal photos cropped / dusk).
Opera: the existing 2016-12 photo was kept. Newer ones (2023-2026) are oblique or have crowds / night lighting; a rectified replacement would be the next step. *Not done.*

Season/lighting note: the adopted photos are from January (no. 35), May (no. 20) and July evening (nos. 27, 29), while trees and lawns in the game are late-October. The photos carry baked light; this is a known mismatch.

## Street details (all data-driven, `scripts/layout-poi.ts`)
* **Shop signs**: 96 OSM-named shops/cafes/bars/hotels within 60 m of the avenue, placed on the nearest street-facing wall edge, one 1024x1024 canvas atlas, one mesh. Names are real OSM names; fascia colours are *guesses* (hash of the name).
* **Furniture at mapped positions**: 60 benches, 31 waste baskets, 21 bicycle racks, 14 street lamps, 11 bus stops, 172 trees (the boulevard rows of the earlier layout are kept; mapped nodes within 2.2-3 m of a generated one are dropped). Models are generic (*not* the exact Lviv models).
* **Zebra crossings**: 42, from `highway=crossing` nodes lying on carriageways (`crossing=unmarked` skipped), drawn as faint pale stripes (on the real cobbles they are barely visible).
* **Kerb bollards**: 315 grey granite hemispheres along the building-side kerb of the avenue carriageways every 4 m. Their presence is verified in the 2023/2025 photos; the positions are *derived* (OSM has only 2 `barrier=bollard` nodes).
* **Cycle lanes**: `highway=cycleway` + asphalt now red (photo: red lane along the boulevard side of the carriageway).
* **Lane markings**: only where OSM says `lane_markings=yes` (Doroshenka street; the avenue itself is unmarked in OSM and in the photos).
* **Carriageway width** from `lanes` x 3.1 m (3 lanes = 9.3 m west, 2 lanes = 6.2 m east); `layout-avenue.ts` uses the real widths for the boulevard width.
* Not done: tram/trolley wires (OSM `trolley_wire` ways exist), roof shapes (`roof:shape`), pedestrian-zone signs, bus shelters.

## Textures
* `sett`: PavingStones150 -> **PavingStones147** (fine grey granite setts, tile 5 m); `paving` (boulevard, pavements): PavingStones138 -> **PavingStones109** (grey granite slabs). Both ambientCG CC0, 1K, run through `scripts/optimize-textures.mjs`.
* Sky/roof/plaster/asphalt/grass unchanged. No better copper/patina set was adopted for the dome (the dome is vertex-coloured geometry).

## Cost of the avenue layer (headless SwiftShader, view at the McDonald's)
+9 draw calls, +5k triangles in view (40 vs 31 draws, 42k vs 37k tris). Textures: facade atlas 2048x1232 WebP (380 KB, ~10 MB GPU), sign atlas 1024x1024 canvas (4 MB), ground-front canvas 1280x256 (1.3 MB). Everything instanced goes through `CulledInstances`.

## Reproduce
`npm run poi` (optional, refreshes `data/osm-poi.json`) -> `npm run prepare-data` -> `npm run photos` (needs network, writes the atlas + `facades.generated.ts` + `CREDITS.txt`).
