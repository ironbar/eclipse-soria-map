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

The first version of the app shows an interactive political map centered on the province of Soria. The custom
eclipse layers are not implemented yet, but the UI and code structure already reserve the layer controls for:

- Elevation
- Horizon elevation
- Viewing quality

## Technologies

- **Vite**: static frontend build tool. It keeps local development fast and produces files that can be hosted by
  GitHub Pages without a backend.
- **TypeScript**: adds type checking to the map configuration and future layer definitions.
- **MapLibre GL JS**: open-source WebGL map renderer used for the interactive political map.
- **OpenFreeMap Liberty style**: free vector basemap style used for the initial political map with roads, rivers,
  towns and labels.

Future custom layers should be precomputed offline and published as static map tiles, preferably raster tiles or
PMTiles archives, so the GitHub Pages deployment stays lightweight.

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
