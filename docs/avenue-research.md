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

## Shevchenko monument (research 2026-11, text sources only, no photos copied)
Facts (**verified** in several text sources: uk/ru Wikipedia, 24tv.ua, prostobank.com, lia.lvivcenter.org):
* Prosp. Svobody, opened **24 Aug 1992**, completed 1996. Sculptors brothers Volodymyr and Andriy Sukhorski, architects Yurii Dyba and Yurii Khromei (spelled Kromei in one source); competition 1988-89.
* Bronze figure **4.45 m**, cast in Argentina (Monte Grande, near Buenos Aires; diaspora funds, organised by Vasyl Ivanytskyi), shipped via Hamburg. Granite pedestal (sign "Т. Шевченко" on it, per a photo caption on lia.lvivcenter.org); a monument that looks dark, almost black; plaza paved with granite tiles of several kinds; the square is full of flowers.
* To the poet's left a bronze stele **"Хвиля національного відродження"**, ~**12 m**, reliefs on both sides (added 1995-96). Front: Kyivan Rus to early 20th c. - Perebendia with a boy, mother from "Kateryna", Haidamaky scene, invaders (sultan, king, officer, monk), Cossacks, Hetman Sahaidachny on horseback in the centre with Mazepa, Khmelnytskyi, Olha, Yaroslav, Volodymyr, Skovoroda, Shashkevych, Franko..., an Oranta with angels and a halo on top. Back: 20th century - a millstone with the dates 1918-22, 1932-33, 1941-45, 1986, famine scene, a tree with national figures in its roots, destroyed churches, Siberian exile, Chornobyl bell, dissidents behind bars (Stus, Symonenko).
* *Not found in any text source (modelled as a guess)*: the poet's pose and clothing, pedestal height and the number of steps, the exact inscription (used "Т. Г. ШЕВЧЕНКО / 1814 – 1861"), what the stele's top edge looks like.
Model (`src/world/monument.ts`): figure ~7.4 m with pedestal, stele 12 m with the Oranta, reliefs as stylised canvas silhouettes (embossed look by an offset dark/light copy). The pedestal and the number of steps are *guesses* tuned to the old footprint (4.2 m square apron).

## Textures
* `sett`: PavingStones150 -> **PavingStones147** (fine grey granite setts, tile 5 m); `paving` (boulevard, pavements): PavingStones138 -> **PavingStones109** (grey granite slabs). Both ambientCG CC0, 1K, run through `scripts/optimize-textures.mjs`.
* Sky/roof/plaster/asphalt/grass unchanged. No better copper/patina set was adopted for the dome (the dome is vertex-coloured geometry).

## Cost of the avenue layer (headless SwiftShader, view at the McDonald's)
+9 draw calls, +5k triangles in view (40 vs 31 draws, 42k vs 37k tris). Textures: facade atlas 2048x1232 WebP (380 KB, ~10 MB GPU), sign atlas 1024x1024 canvas (4 MB), ground-front canvas 1280x256 (1.3 MB). Everything instanced goes through `CulledInstances`.

## Reproduce
`npm run poi` (optional, refreshes `data/osm-poi.json`) -> `npm run prepare-data` -> `npm run photos` (needs network, writes the atlas + `facades.generated.ts` + `CREDITS.txt`).

## Opera interior (src/opera/, researched 2026-11-01)
Facts used for the stylised interior (nothing copied, no photos; the hall is hand-built geometry plus canvas paintings drawn in `src/opera/atlas.ts`):
* Architect Zygmunt Gorgolewski, opened 4 Oct 1900, Renaissance Revival with Neo-Baroque forms. Footprint about **45 x 95 m**; main facade: composite portico on Corinthian columns of a colossal order and a triple arcade, three entrances in niches flanked by Tuscan columns; Comedy and Tragedy in niches beside the main entrance; pediment field 4.2 x 20 m ("Joys and sufferings of life", A. Popiel); Glory on the top. Marble elements were made in Vienna.
* **Vestibule**: rectangular, 18.5 m high, two- and three-storey loggias around a central volume lit by a large multi-section roof lantern; stone balustrades on the second floor, metal on the third; stucco frieze with cameos; the first flight of the staircase on the axis. -> modelled as a hall with a skylight, a double-height foyer and **two** straight marble flights (the real plan differs: *simplification*, because `Colliders.addFloor` only slopes along z).
* **Foyer** ("Mirror hall"): 7.5 x 35 m, split by arches, four big mirrors on each end wall, three ceiling paintings (S. Debicki: Poetry, Music, Choreography), sculpture groups over the arches. -> upper foyer gallery with six mirrors and three painted ceiling panels with those titles.
* **Auditorium**: four tiers, plan in the shape of a lyre (horseshoe), **44 boxes**, about **1000** seats (sources differ: 813 / 1000 / 1002 / 1100), no blind seats; the proscenium arch is crowned by a genius and an angel with the coat of arms of Lviv (P. Wojtowicz); main ceiling plafond is round and divided into **ten sectors** with allegorical figures (S. Rejchan), ten medallions with portraits of actors; the orchestra plafond "Triumph of Glory"; a large crystal chandelier in the centre.
* **Curtains**: the main curtain "Parnassus" is a painting by Henryk Siemiradzki (Apollo's altar, Pythia, Themis, eight muses), first lowered 13 Jan 1901, it is not rolled up but goes into a metal fireproof case; the iron safety curtain shows Lviv from the Stryiskyi hill (Jan Dull). The brief asked for a *red* curtain, so the model draws red velvet drapes with gold braid, not the painting.
* Stage structure: metal construction made at the Sanok wagon works; the stage size is not given in the sources (modelled 40 x 13.5 m, *guess*).
* Not found in any source (invented): ticket-office and cloakroom positions, the box-office windows, statues of muses in the foyer, the stage set pieces, colours of the upholstery (red velvet is the common description).
* Sources: [Wikipedia (en)](https://en.wikipedia.org/wiki/Lviv_Opera), [Wikipedia (uk)](https://uk.wikipedia.org/wiki/Львівський_театр_опери_та_балету) (interior section: vestibule, foyer, auditorium, curtain, dimensions), summaries of [lia.lvivcenter.org](https://lia.lvivcenter.org/en/objects/opera-house/), [lviv.travel](https://lviv.travel/en/places/attractions/teatr-operi-ta-baletu-im-solomiyi-krushelnitskoyi), [Telegraf (uk, 2025-12)](https://news.telegraf.com.ua/ukr/obshhestvo/2025-12-31/5929469-on-na-20-grivnevoy-banknote-istoriya-glavnogo-simvola-goroda-lvovskogo-opernogo-teatra-foto).
* **Door**: the existing 2016-12 facade photo (`public/photos/opera_front.webp`, 2048 x 1565) is hung as a 62.8 x 48 m panel 0.2 m before the front side of the footprint's OBB (`operaFront` in `world/landmarks.ts`). The middle arch of the three at the bottom is at 470 of 1024 px of the photo width, ground level, i.e. **-2.6 m** from the panel centre (checked visually: the yellow marker ring lies on it).
