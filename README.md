# Eclipse Soria Map

## Goal

Create a webapplication that allows to visualize a map about the solar eclipse of 2026 in Soria. The app will
be hosted freely in Github Pages, so it needs to be standalone and as light as possible.

## Specification

We will precompute online the following layers that could be enabled or disabled by the user:

- Elevation/altitude of the province of Soria. This will be downloaded from MDT200 - 2ª cobertura, with a resolution of 25m
- Horizon elevation in degrees, in the direction of the eclipse which is 284 degrees azimut. Assuming flat earth and a height of the person of 1.5 meters
- Goodness of the site for seeing the eclipse. Red for points with an elevation higher than 7, yellow gradient from 7 to 5, green gradient from 5 to 0.

By default a political map of Soria will be shown, with cities, roads and rivers. This landmarks should be visible
when enabling our custom layers

## Current version

The current version of the app shows an interactive political map centered on the province of Soria, plus toggleable
elevation, horizon-elevation, and viewing-quality layers generated from CNIG MDT25 data.

## Technologies

- **Vite**: static frontend build tool. It keeps local development fast and produces files that can be hosted by
  GitHub Pages without a backend.
- **TypeScript**: adds type checking to the map configuration and future layer definitions.
- **MapLibre GL JS**: open-source WebGL map renderer used for the interactive political map.
- **OpenFreeMap Liberty style**: free vector basemap style used for the initial political map with roads, rivers,
  towns and labels.
- **GeoTIFF + proj4 + sharp**: preprocessing-only Node dependencies used to read the MDT files, project the raster
  data, colorize elevations, and generate compact WebP map tiles.

Future custom layers should be precomputed offline and published as static map tiles, preferably raster tiles or
PMTiles archives, so the GitHub Pages deployment stays lightweight.

## Elevation tiles

The raw CNIG MDT files are intentionally kept out of git because they are large. They should live locally in:

```text
mdt200/raw/
```

The checked-in custom layers are generated as static WebP XYZ tiles in:

```text
public/elevation/
public/horizon/
public/goodness/
```

Regenerate the elevation tiles after changing the source data or the color ramp:

```bash
npm run generate:elevation
```

Regenerate the horizon-elevation layer after changing the source data or calculation parameters:

```bash
npm run generate:horizon
```

Regenerate the viewing-quality layer after changing the source data, horizon calculation parameters, or color
thresholds:

```bash
npm run generate:goodness
```

The horizon calculation follows the README specification: it scans along eclipse azimuth 284 degrees, assumes flat
earth, and uses an observer height of 1.5 meters. The viewing-quality layer classifies that computed horizon angle:
green from 0 to 5 degrees, yellow from 5 to 7 degrees, and red above 7 degrees.

To keep the hosted app light, the generated layers currently use zoom levels 8 to 11. The elevation layer is about
1 MB, the horizon layer is about 6 MB, and the viewing-quality layer is about 5 MB.

## Local development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Vite will print a local URL, usually `http://localhost:5173/`.

Build the static site:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```
