export type PlannedLayer = {
  id: string;
  label: string;
  description: string;
};

export type LegendStop = {
  value: string;
  color: string;
};

export type LayerLegend = {
  title: string;
  unit: string;
  gradient: string;
  stops: LegendStop[];
};

export type RasterOverlayLayer = PlannedLayer & {
  sourceId: string;
  layerId: string;
  tiles: string[];
  bounds: [number, number, number, number];
  minzoom: number;
  maxzoom: number;
  opacity: number;
  legend: LayerLegend;
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
  legend: {
    title: "Elevation",
    unit: "meters",
    gradient:
      "linear-gradient(90deg, #247065 0%, #62a45b 19%, #dac460 36%, #cd8b45 52%, #8e745e 69%, #e2e5de 88%, #ffffff 100%)",
    stops: [
      { value: "200", color: "#247065" },
      { value: "900", color: "#dac460" },
      { value: "1,650", color: "#8e745e" },
      { value: "2,350", color: "#ffffff" },
    ],
  },
};

export const horizonLayer: RasterOverlayLayer = {
  id: "horizon",
  sourceId: "horizon-source",
  layerId: "horizon-layer",
  label: "Horizon elevation",
  description: "Horizon angle toward the eclipse azimuth of 284 degrees.",
  tiles: ["./horizon/{z}/{x}/{y}.webp"],
  bounds: [-3.702471465561472, 40.9823210660595, -0.9787057485932676, 42.348649534943576],
  minzoom: 8,
  maxzoom: 11,
  opacity: 0.7,
  legend: {
    title: "Horizon elevation",
    unit: "degrees",
    gradient:
      "linear-gradient(90deg, #2a8475 0%, #5ba785 18%, #f5d36f 40%, #e6844f 64%, #b73f4e 82%, #702f48 100%)",
    stops: [
      { value: "0", color: "#5ba785" },
      { value: "2", color: "#f5d36f" },
      { value: "5", color: "#e6844f" },
      { value: "8+", color: "#b73f4e" },
    ],
  },
};

export const goodnessLayer: RasterOverlayLayer = {
  id: "goodness",
  sourceId: "goodness-source",
  layerId: "goodness-layer",
  label: "Viewing quality",
  description: "Color-coded suitability layer for eclipse visibility.",
  tiles: ["./goodness/{z}/{x}/{y}.webp"],
  bounds: [-3.702471465561472, 40.9823210660595, -0.9787057485932676, 42.348649534943576],
  minzoom: 8,
  maxzoom: 11,
  opacity: 0.72,
  legend: {
    title: "Viewing quality",
    unit: "horizon degrees",
    gradient:
      "linear-gradient(90deg, #1e8754 0%, #55ab56 35%, #a7c953 58%, #f4cd53 75%, #eb9949 86%, #cc3743 100%)",
    stops: [
      { value: "0", color: "#1e8754" },
      { value: "5", color: "#a7c953" },
      { value: "7", color: "#eb9949" },
      { value: ">7", color: "#cc3743" },
    ],
  },
};

export const plannedEclipseLayers: PlannedLayer[] = [];

export const customLayers = [elevationLayer, horizonLayer, goodnessLayer];

export const soriaBounds: [[number, number], [number, number]] = [
  [-3.55, 40.95],
  [-1.45, 42.4],
];

export const soriaCity: [number, number] = [-2.466, 41.764];
