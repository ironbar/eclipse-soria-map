import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { plannedEclipseLayers, soriaBounds, soriaCity } from "./layers";
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
  new maplibregl.Marker({ color: "#0f766e" })
    .setLngLat(soriaCity)
    .setPopup(new maplibregl.Popup().setText("Soria"))
    .addTo(map);
});
