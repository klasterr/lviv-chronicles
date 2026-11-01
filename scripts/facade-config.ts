// Photo-based facades of the buildings on проспект Свободи. Each photo is rectified (4-point homography) into a flat panel that the
// game hangs on the street-facing wall of the OSM footprint (width = wall length from the GeoJSON, never from the photo).
// Corner coordinates are pixels in the 1920 px-wide Commons thumbnail: TL, TR, BR, BL of a rectangle lying in the facade plane.
//   groundH  : metres of shop level below the panel (the panel starts there; generic shopfront + POI signs are drawn below)
//   eaveM    : metres from the panel bottom to the cornice (the OSM-extruded wall ends here; the panel is taller where the roof/gables/dome rise above)
//   heightM  : real height of the quad (bottom edge to top edge); topExtra = extra panel above the quad as a fraction of heightM
//   sky      : how the sky is keyed out ('neutral' light grey overcast, 'blue' clear sky); leaves: also key dark foliage that hangs into the sky area above the facade; tint = colour of the shop level / plaster below the panel
// Heights are estimated from the photo scale (horizontal px/m of the wall, measured against the OSM wall length) - see docs/avenue-research.md.
export interface FacadeCfg {
  osm: string; key: string; title: string; houseNo: string
  quad: [number, number][]; heightM: number; topExtra: number; groundH: number; eaveM: number
  sky: 'neutral' | 'blue'; leaves?: boolean
  verts?: [number, number] // use the wall between these footprint vertices instead of the auto-detected frontage
  tint: number; roofColor: number
}

export const FACADES: FacadeCfg[] = [
  { osm: 'way/171080874', key: 'f35', houseNo: '35', title: 'Пасаж Феллерів.jpg', // 2023-01-31, Vikcos75, CC BY-SA 4.0 (Feller Passage; McDonald's is on its ground floor)
    quad: [[178, 301], [1713, 301], [1745, 1308], [142, 1308]], heightM: 17.1, topExtra: 0, groundH: 5.0, eaveM: 14.1, sky: 'neutral', tint: 0xe3cf93, roofColor: 0x8d4a45 },
  { osm: 'relation/254623', key: 'f20', houseNo: '20', title: 'Національний музей м.Львів.jpg', // 2025-05-18, Valchuk Taisiia, CC BY-SA 4.0 (Lviv National Museum)
    quad: [[138, 452], [1628, 553], [1692, 1215], [103, 1283]], heightM: 16.4, topExtra: 0.46, groundH: 0, eaveM: 16.4, sky: 'blue', verts: [0, 4], tint: 0xd5d1bd, roofColor: 0x7d8794 },
  { osm: 'relation/11543015', key: 'f27', houseNo: '27', title: 'Львів. Просп. Свободи 27.jpg', // 2016-07-24, CC BY-SA 4.0 (Opera Passage, red brick; pre-2022 photo, upper floors only)
    quad: [[238, 638], [1747, 626], [1901, 1494], [117, 1494]], heightM: 9.2, topExtra: 0.22, groundH: 10, eaveM: 9.2, sky: 'blue', leaves: true, tint: 0xd8bf72, roofColor: 0x6b4a40 },
  { osm: 'way/171080905', key: 'f29', houseNo: '29', title: 'Львів. Просп. Свободи 29.jpg', // 2016-07-24, CC BY-SA 4.0 (pre-2022 photo, upper floors only)
    quad: [[283, 500], [1752, 500], [1830, 1573], [128, 1573]], heightM: 13.3, topExtra: 0.05, groundH: 10.5, eaveM: 13.3, sky: 'blue', tint: 0xb9ae96, roofColor: 0x7a6a5a },
]
