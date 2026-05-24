import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromFile } from "geotiff";
import proj4 from "proj4";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const inputDir = path.join(rootDir, "mdt200", "raw");
const outputDir = path.join(rootDir, "public", "elevation");
const metadataPath = path.join(outputDir, "metadata.json");

const tileSize = 256;
const minZoom = 8;
const maxZoom = 12;
const cellSizeMeters = 10_000;
const noDataThreshold = -1000;
const sourceProjection =
  "+proj=utm +zone=30 +ellps=GRS80 +units=m +no_defs +type=crs";

proj4.defs("EPSG:25830", sourceProjection);

const ramp = [
  [200, [36, 112, 101]],
  [550, [98, 164, 91]],
  [900, [218, 196, 96]],
  [1250, [205, 139, 69]],
  [1650, [142, 116, 94]],
  [2050, [226, 229, 222]],
  [2350, [255, 255, 255]],
];

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToTileY(lat, z) {
  const radians = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) *
      2 ** z,
  );
}

function tilePointToLonLat(x, y, z) {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lon, lat];
}

function colorForElevation(value) {
  if (!Number.isFinite(value) || value < noDataThreshold) {
    return [0, 0, 0, 0];
  }

  for (let i = 0; i < ramp.length - 1; i++) {
    const [fromValue, fromColor] = ramp[i];
    const [toValue, toColor] = ramp[i + 1];

    if (value <= toValue) {
      const t = Math.max(0, Math.min(1, (value - fromValue) / (toValue - fromValue)));
      return [
        Math.round(fromColor[0] + (toColor[0] - fromColor[0]) * t),
        Math.round(fromColor[1] + (toColor[1] - fromColor[1]) * t),
        Math.round(fromColor[2] + (toColor[2] - fromColor[2]) * t),
        230,
      ];
    }
  }

  return [255, 255, 255, 230];
}

function keyForPoint(x, y) {
  return `${Math.floor(x / cellSizeMeters)}:${Math.floor(y / cellSizeMeters)}`;
}

function addToSpatialIndex(index, tile) {
  const [minX, minY, maxX, maxY] = tile.bbox;
  const minCellX = Math.floor(minX / cellSizeMeters);
  const maxCellX = Math.floor(maxX / cellSizeMeters);
  const minCellY = Math.floor(minY / cellSizeMeters);
  const maxCellY = Math.floor(maxY / cellSizeMeters);

  for (let x = minCellX; x <= maxCellX; x++) {
    for (let y = minCellY; y <= maxCellY; y++) {
      const key = `${x}:${y}`;
      const existing = index.get(key);
      if (existing) {
        existing.push(tile);
      } else {
        index.set(key, [tile]);
      }
    }
  }
}

function sampleElevation(x, y, index) {
  const candidates = index.get(keyForPoint(x, y));

  if (!candidates) {
    return undefined;
  }

  for (const tile of candidates) {
    const [minX, minY, maxX, maxY] = tile.bbox;

    if (x < minX || x >= maxX || y < minY || y >= maxY) {
      continue;
    }

    const col = Math.floor(((x - minX) / (maxX - minX)) * tile.width);
    const row = Math.floor(((maxY - y) / (maxY - minY)) * tile.height);

    if (col < 0 || row < 0 || col >= tile.width || row >= tile.height) {
      continue;
    }

    const value = tile.data[row * tile.width + col];
    if (Number.isFinite(value) && value > noDataThreshold) {
      return value;
    }
  }

  return undefined;
}

function projectedTileCorners(x, y, z) {
  const topLeft = proj4("EPSG:4326", "EPSG:25830", tilePointToLonLat(x, y, z));
  const topRight = proj4("EPSG:4326", "EPSG:25830", tilePointToLonLat(x + 1, y, z));
  const bottomLeft = proj4("EPSG:4326", "EPSG:25830", tilePointToLonLat(x, y + 1, z));
  const bottomRight = proj4(
    "EPSG:4326",
    "EPSG:25830",
    tilePointToLonLat(x + 1, y + 1, z),
  );

  return { topLeft, topRight, bottomLeft, bottomRight };
}

function interpolateProjectedPoint(corners, column, row) {
  const u = (column + 0.5) / tileSize;
  const v = (row + 0.5) / tileSize;
  const topX = corners.topLeft[0] + (corners.topRight[0] - corners.topLeft[0]) * u;
  const topY = corners.topLeft[1] + (corners.topRight[1] - corners.topLeft[1]) * u;
  const bottomX =
    corners.bottomLeft[0] + (corners.bottomRight[0] - corners.bottomLeft[0]) * u;
  const bottomY =
    corners.bottomLeft[1] + (corners.bottomRight[1] - corners.bottomLeft[1]) * u;

  return [topX + (bottomX - topX) * v, topY + (bottomY - topY) * v];
}

async function loadSourceTiles() {
  const filenames = (await readdir(inputDir)).filter((name) => name.endsWith(".tif")).sort();
  const sourceTiles = [];
  const spatialIndex = new Map();
  const sourceBounds = [Infinity, Infinity, -Infinity, -Infinity];
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (const filename of filenames) {
    const tiff = await fromFile(path.join(inputDir, filename));
    const image = await tiff.getImage();
    const [data] = await image.readRasters();
    const bbox = image.getBoundingBox();
    const tile = {
      filename,
      bbox,
      width: image.getWidth(),
      height: image.getHeight(),
      data,
    };

    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      if (Number.isFinite(value) && value > noDataThreshold) {
        minElevation = Math.min(minElevation, value);
        maxElevation = Math.max(maxElevation, value);
      }
    }

    sourceBounds[0] = Math.min(sourceBounds[0], bbox[0]);
    sourceBounds[1] = Math.min(sourceBounds[1], bbox[1]);
    sourceBounds[2] = Math.max(sourceBounds[2], bbox[2]);
    sourceBounds[3] = Math.max(sourceBounds[3], bbox[3]);

    sourceTiles.push(tile);
    addToSpatialIndex(spatialIndex, tile);
  }

  return { sourceTiles, spatialIndex, sourceBounds, minElevation, maxElevation };
}

function lonLatBoundsForSourceBounds(bounds) {
  const corners = [
    [bounds[0], bounds[1]],
    [bounds[0], bounds[3]],
    [bounds[2], bounds[1]],
    [bounds[2], bounds[3]],
  ].map((point) => proj4("EPSG:25830", "EPSG:4326", point));

  return [
    Math.min(...corners.map((corner) => corner[0])),
    Math.min(...corners.map((corner) => corner[1])),
    Math.max(...corners.map((corner) => corner[0])),
    Math.max(...corners.map((corner) => corner[1])),
  ];
}

async function writeTile(z, x, y, spatialIndex) {
  const pixels = Buffer.alloc(tileSize * tileSize * 4);
  const corners = projectedTileCorners(x, y, z);
  let hasData = false;

  for (let row = 0; row < tileSize; row++) {
    for (let column = 0; column < tileSize; column++) {
      const [sourceX, sourceY] = interpolateProjectedPoint(corners, column, row);
      const value = sampleElevation(sourceX, sourceY, spatialIndex);
      const [red, green, blue, alpha] = colorForElevation(value);
      const offset = (row * tileSize + column) * 4;

      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = alpha;

      if (alpha > 0) {
        hasData = true;
      }
    }
  }

  if (!hasData) {
    return false;
  }

  const tilePath = path.join(outputDir, String(z), String(x), `${y}.webp`);
  await mkdir(path.dirname(tilePath), { recursive: true });
  await sharp(pixels, {
    raw: {
      width: tileSize,
      height: tileSize,
      channels: 4,
    },
  })
    .webp({ quality: 72, alphaQuality: 80, effort: 5 })
    .toFile(tilePath);

  return true;
}

async function main() {
  await stat(inputDir);
  console.log("Loading MDT GeoTIFFs...");
  const { sourceTiles, spatialIndex, sourceBounds, minElevation, maxElevation } =
    await loadSourceTiles();
  const bounds = lonLatBoundsForSourceBounds(sourceBounds);
  console.log(`Loaded ${sourceTiles.length} GeoTIFFs.`);
  console.log(`Elevation range: ${minElevation.toFixed(1)}m - ${maxElevation.toFixed(1)}m.`);

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  let writtenTiles = 0;
  const zoomSummary = {};

  for (let z = minZoom; z <= maxZoom; z++) {
    const xStart = lonToTileX(bounds[0], z);
    const xEnd = lonToTileX(bounds[2], z);
    const yStart = latToTileY(bounds[3], z);
    const yEnd = latToTileY(bounds[1], z);
    let zoomTiles = 0;

    for (let x = xStart; x <= xEnd; x++) {
      for (let y = yStart; y <= yEnd; y++) {
        if (await writeTile(z, x, y, spatialIndex)) {
          writtenTiles++;
          zoomTiles++;
        }
      }
    }

    zoomSummary[z] = zoomTiles;
    console.log(`Zoom ${z}: ${zoomTiles} tiles`);
  }

  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        tileFormat: "webp",
        tileSize,
        minzoom: minZoom,
        maxzoom: maxZoom,
        bounds,
        sourceProjection: "EPSG:25830",
        sourceFiles: sourceTiles.length,
        minElevation,
        maxElevation,
        tiles: writtenTiles,
        zooms: zoomSummary,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote ${writtenTiles} tiles to ${path.relative(rootDir, outputDir)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
