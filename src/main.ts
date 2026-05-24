import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  customLayers,
  elevationLayer,
  goodnessLayer,
  horizonLayer,
  plannedEclipseLayers,
  soriaBounds,
  soriaCity,
  type RasterOverlayLayer,
} from "./layers";
import "./styles.css";

type BasemapLayerState = {
  id: string;
  visibility: "visible" | "none";
};

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
      <aside id="legend" class="legend-panel" aria-label="Active layer legend" hidden></aside>
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
  captureBasemapLayerState();
  syncCustomLayerState();

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
  if (toggle?.checked && isOnlyCheckedCustomLayer(layer)) {
    map.setLayoutProperty(layer.layerId, "visibility", "visible");
  }
}

function bindLayerToggle(layer: RasterOverlayLayer) {
  document
    .querySelector<HTMLInputElement>(`#${layer.id}-toggle`)
    ?.addEventListener("change", (event) => {
      const isVisible = (event.target as HTMLInputElement).checked;

      if (isVisible) {
        customLayers
          .filter((customLayer) => customLayer.id !== layer.id)
          .forEach((customLayer) => {
            const toggle = document.querySelector<HTMLInputElement>(
              `#${customLayer.id}-toggle`,
            );
            if (toggle) {
              toggle.checked = false;
            }
          });
      }

      syncCustomLayerState();
    });
}

function isOnlyCheckedCustomLayer(layer: RasterOverlayLayer) {
  return customLayers.every((customLayer) => {
    const toggle = document.querySelector<HTMLInputElement>(`#${customLayer.id}-toggle`);
    return customLayer.id === layer.id ? toggle?.checked : !toggle?.checked;
  });
}

function syncCustomLayerState() {
  const activeLayer = customLayers.find((layer) => {
    const toggle = document.querySelector<HTMLInputElement>(`#${layer.id}-toggle`);
    return toggle?.checked;
  });

  customLayers.forEach((layer) => {
    const isVisible = activeLayer?.id === layer.id;
    const toggle = document.querySelector<HTMLInputElement>(`#${layer.id}-toggle`);
    const option = toggle?.closest(".layer-option");

    if (map.getLayer(layer.layerId)) {
      map.setLayoutProperty(layer.layerId, "visibility", isVisible ? "visible" : "none");
    }

    option?.classList.toggle("selected", isVisible);
  });

  renderLegend(activeLayer);
  syncBasemap(activeLayer !== undefined);
}

const originalBasemapLayerStates: BasemapLayerState[] = [];

function captureBasemapLayerState() {
  map.getStyle().layers.forEach((layer) => {
    if (customLayers.some((customLayer) => customLayer.layerId === layer.id)) {
      return;
    }

    originalBasemapLayerStates.push({
      id: layer.id,
      visibility: layer.layout?.visibility === "none" ? "none" : "visible",
    });
  });
}

function syncBasemap(hasActiveOverlay: boolean) {
  originalBasemapLayerStates.forEach((layerState) => {
    if (!map.getLayer(layerState.id)) {
      return;
    }

    const nextVisibility = hasActiveOverlay
      ? getOverlayBasemapVisibility(layerState.id)
      : layerState.visibility;

    map.setLayoutProperty(layerState.id, "visibility", nextVisibility);
  });
}

function getOverlayBasemapVisibility(layerId: string) {
  if (isReferenceLayer(layerId)) {
    return "visible";
  }

  return "none";
}

function isReferenceLayer(layerId: string) {
  const id = layerId.toLowerCase();

  return (
    id.includes("label") ||
    id.includes("name") ||
    id.includes("place") ||
    id.includes("city") ||
    id.includes("town") ||
    id.includes("village") ||
    id.includes("road") ||
    id.includes("highway") ||
    id.includes("street") ||
    id.includes("rail") ||
    id.includes("boundary") ||
    id.includes("admin") ||
    id.includes("border")
  );
}

function renderLegend(layer: RasterOverlayLayer | undefined) {
  const legend = document.querySelector<HTMLElement>("#legend");

  if (!legend) {
    return;
  }

  if (!layer) {
    legend.hidden = true;
    legend.innerHTML = "";
    return;
  }

  legend.hidden = false;
  legend.innerHTML = `
    <div class="legend-heading">
      <strong>${layer.legend.title}</strong>
      <span>${layer.legend.unit}</span>
    </div>
    <div class="legend-bar" style="background: ${layer.legend.gradient}"></div>
    <div class="legend-stops">
      ${layer.legend.stops
        .map(
          (stop) => `
            <span>
              <i style="background: ${stop.color}"></i>
              ${stop.value}
            </span>
          `,
        )
        .join("")}
    </div>
  `;
}

customLayers.forEach(bindLayerToggle);
