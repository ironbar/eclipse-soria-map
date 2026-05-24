export type PlannedLayer = {
  id: string;
  label: string;
  description: string;
};

export const plannedEclipseLayers: PlannedLayer[] = [
  {
    id: "elevation",
    label: "Elevation",
    description: "MDT200 altitude tiles for the province of Soria.",
  },
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
