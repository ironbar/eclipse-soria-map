import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  elevationLayer,
  goodnessLayer,
  horizonLayer,
  plannedEclipseLayers,
  soriaBounds,
  soriaCity,
  type RasterOverlayLayer,
} from "./layers";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root element was not found.");
}

app.innerHTML = `
  <main class="map-shell">
    <section class="map-header" aria-label="Map context">
      <div>
        <p class="eyebrow">Solar eclipse 2026</p>
        <h1>Soria visibility map</h1>
      </div>
      <div class="status-pill">Political map</div>
    </section>
    <section class="map-stage" aria-label="Interactive political map of Soria">
      <div id="map" class="map"></div>
      <aside class="layer-panel" aria-label="Map layers">
        <h2>Layers</h2>
        <label class="layer-option active">
          <input type="checkbox" checked disabled />
          <span>
            <strong>Political map</strong>
            <small>Towns, roads, rivers, terrain context</small>
          </span>
        </label>
        <label class="layer-option" title="${elevationLayer.description}">
          <input id="elevation-toggle" type="checkbox" />
          <span>
            <strong>${elevationLayer.label}</strong>
            <small>MDT25 color relief</small>
          </span>
        </label>
        <label class="layer-option" title="${horizonLayer.description}">
          <input id="horizon-toggle" type="checkbox" />
          <span>
            <strong>${horizonLayer.label}</strong>
            <small>Azimuth 284 degrees</small>
          </span>
        </label>
        <label class="layer-option" title="${goodnessLayer.description}">
          <input id="goodness-toggle" type="checkbox" />
          <span>
            <strong>${goodnessLayer.label}</strong>
            <small>Green best, red blocked</small>
          </span>
        </label>
        <div class="planned-layers">
          ${plannedEclipseLayers
            .map(
              (layer) => `
                <label class="layer-option disabled" title="${layer.description}">
                  <input type="checkbox" disabled />
                  <span>
                    <strong>${layer.label}</strong>
                    <small>Coming soon</small>
                  </span>
                </label>
              `,
            )
            .join("")}
        </div>
      </aside>
    </section>
  </main>
`;

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: soriaCity,
  zoom: 8.4,
  minZoom: 7,
  maxZoom: 16,
  maxBounds: soriaBounds,
});

map.addControl(
  new maplibregl.NavigationControl({
    visualizePitch: true,
  }),
  "top-right",
);

map.addControl(
  new maplibregl.ScaleControl({
    maxWidth: 140,
    unit: "metric",
  }),
  "bottom-left",
);

map.once("load", () => {
  const firstSymbolLayer = map
    .getStyle()
    .layers.find((layer) => layer.type === "symbol")?.id;

  addRasterOverlay(elevationLayer, firstSymbolLayer, "Elevation: CNIG MDT25 2nd coverage");
  addRasterOverlay(horizonLayer, firstSymbolLayer, "Horizon: computed from CNIG MDT25");
  addRasterOverlay(goodnessLayer, firstSymbolLayer, "Viewing quality: computed from CNIG MDT25");

  new maplibregl.Marker({ color: "#0f766e" })
    .setLngLat(soriaCity)
    .setPopup(new maplibregl.Popup().setText("Soria"))
    .addTo(map);
});

function addRasterOverlay(
  layer: RasterOverlayLayer,
  beforeLayerId: string | undefined,
  attribution: string,
) {
  map.addSource(layer.sourceId, {
    type: "raster",
    tiles: layer.tiles,
    bounds: layer.bounds,
    minzoom: layer.minzoom,
    maxzoom: layer.maxzoom,
    tileSize: 256,
    attribution,
  });

  map.addLayer(
    {
      id: layer.layerId,
      type: "raster",
      source: layer.sourceId,
      layout: {
        visibility: "none",
      },
      paint: {
        "raster-opacity": layer.opacity,
        "raster-fade-duration": 120,
      },
    },
    beforeLayerId,
  );

  const toggle = document.querySelector<HTMLInputElement>(`#${layer.id}-toggle`);
  if (toggle?.checked) {
    map.setLayoutProperty(layer.layerId, "visibility", "visible");
  }
}

function bindLayerToggle(layer: RasterOverlayLayer) {
  document
    .querySelector<HTMLInputElement>(`#${layer.id}-toggle`)
    ?.addEventListener("change", (event) => {
      const isVisible = (event.target as HTMLInputElement).checked;

      if (!map.getLayer(layer.layerId)) {
        return;
      }

      map.setLayoutProperty(
        layer.layerId,
        "visibility",
        isVisible ? "visible" : "none",
      );
    });
}

bindLayerToggle(elevationLayer);
bindLayerToggle(horizonLayer);
bindLayerToggle(goodnessLayer);
