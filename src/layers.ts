export type PlannedLayer = {
  id: string;
  label: string;
  description: string;
};

export type RasterOverlayLayer = PlannedLayer & {
  sourceId: string;
  layerId: string;
  tiles: string[];
  bounds: [number, number, number, number];
  minzoom: number;
  maxzoom: number;
  opacity: number;
};

export const elevationLayer: RasterOverlayLayer = {
  id: "elevation",
  sourceId: "elevation-source",
  layerId: "elevation-layer",
  label: "Elevation",
  description: "Colorized MDT25 altitude tiles for the province of Soria.",
  tiles: ["./elevation/{z}/{x}/{y}.webp"],
  bounds: [-3.702471465561472, 40.9823210660595, -0.9787057485932676, 42.348649534943576],
  minzoom: 8,
  maxzoom: 11,
  opacity: 0.64,
};

export const plannedEclipseLayers: PlannedLayer[] = [
  {
    id: "horizon",
    label: "Horizon elevation",
    description: "Horizon angle toward the eclipse azimuth of 284 degrees.",
  },
  {
    id: "goodness",
    label: "Viewing quality",
    description: "Color-coded suitability layer for eclipse visibility.",
  },
];

export const soriaBounds: [[number, number], [number, number]] = [
  [-3.55, 40.95],
  [-1.45, 42.4],
];

export const soriaCity: [number, number] = [-2.466, 41.764];
