/** Wall of a building facing the avenue (scripts/frontage.ts): a = left end seen from the street, b = right end, n = outward normal, off = bulge of the real wall out of the chord. */
export interface Front { a: number[]; b: number[]; n: number[]; len: number; off: number; dist: number }

/** Part of city.json produced by scripts/layout-poi.ts from OSM nodes (data/osm-poi.json) and the footprints. */
export interface AvenueData {
  fronts: Record<string, Front>
  signs: number[][]      // [x, z, nx, nz, width, textIndex] shop signs on street-facing walls
  signTexts: string[]
  osm: {
    benches: number[][]  // [x, z, yaw]
    bins: number[][]     // [x, z]
    bikes: number[][]    // [x, z, yaw]
    lamps: number[][]    // [x, z, yaw]
    hydrants: number[][]
    stops: number[][]    // [x, z, yaw]
    trees: number[][]    // [x, z, seed, kind]
  }
  crossings: number[][]  // [x, z, yaw of the road, road width]
  bollards: number[][]   // [x, z]
  laneMarks: number[][][] // polylines of carriageways with lane_markings=yes: dashed centre line
}
