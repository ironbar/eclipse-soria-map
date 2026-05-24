import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromFile } from "geotiff";
import proj4 from "proj4";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const inputDir = path.join(rootDir, "mdt200", "raw");
const outputDir = path.join(rootDir, "public", "horizon");
const metadataPath = path.join(outputDir, "metadata.json");

const outputTileSize = 256;
const analysisTileSize = 64;
const minZoom = 8;
const maxZoom = 11;
const noDataThreshold = -1000;
const demGridResolution = 100;
const observerHeightMeters = 1.5;
const eclipseAzimuthDegrees = 284;
const maxDistanceMeters = 80_000;
const cellSizeMeters = 10_000;
const sourceProjection =
  "+proj=utm +zone=30 +ellps=GRS80 +units=m +no_defs +type=crs";

proj4.defs("EPSG:25830", sourceProjection);

const azimuthRadians = (eclipseAzimuthDegrees * Math.PI) / 180;
const rayUnitX = Math.sin(azimuthRadians);
const rayUnitY = Math.cos(azimuthRadians);

const ramp = [
  [-1, [42, 132, 117, 170]],
  [0, [91, 167, 133, 185]],
  [2, [245, 211, 111, 205]],
  [5, [230, 132, 79, 220]],
  [8, [183, 63, 78, 232]],
  [12, [112, 47, 72, 240]],
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

function sampleSourceElevation(x, y, index) {
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

function colorForHorizon(value) {
  if (!Number.isFinite(value)) {
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
        Math.round(fromColor[3] + (toColor[3] - fromColor[3]) * t),
      ];
    }
  }

  return ramp.at(-1)[1];
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
  const u = (column + 0.5) / analysisTileSize;
  const v = (row + 0.5) / analysisTileSize;
  const topX = corners.topLeft[0] + (corners.topRight[0] - corners.topLeft[0]) * u;
  const topY = corners.topLeft[1] + (corners.topRight[1] - corners.topLeft[1]) * u;
  const bottomX =
    corners.bottomLeft[0] + (corners.bottomRight[0] - corners.bottomLeft[0]) * u;
  const bottomY =
    corners.bottomLeft[1] + (corners.bottomRight[1] - corners.bottomLeft[1]) * u;

  return [topX + (bottomX - topX) * v, topY + (bottomY - topY) * v];
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

async function loadSourceTiles() {
  const filenames = (await readdir(inputDir)).filter((name) => name.endsWith(".tif")).sort();
  const sourceTiles = [];
  const spatialIndex = new Map();
  const sourceBounds = [Infinity, Infinity, -Infinity, -Infinity];

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

    sourceBounds[0] = Math.min(sourceBounds[0], bbox[0]);
    sourceBounds[1] = Math.min(sourceBounds[1], bbox[1]);
    sourceBounds[2] = Math.max(sourceBounds[2], bbox[2]);
    sourceBounds[3] = Math.max(sourceBounds[3], bbox[3]);

    sourceTiles.push(tile);
    addToSpatialIndex(spatialIndex, tile);
  }

  return { sourceTiles, spatialIndex, sourceBounds };
}

function buildDemGrid(sourceBounds, spatialIndex) {
  const minX = Math.floor(sourceBounds[0] / demGridResolution) * demGridResolution;
  const minY = Math.floor(sourceBounds[1] / demGridResolution) * demGridResolution;
  const maxX = Math.ceil(sourceBounds[2] / demGridResolution) * demGridResolution;
  const maxY = Math.ceil(sourceBounds[3] / demGridResolution) * demGridResolution;
  const width = Math.ceil((maxX - minX) / demGridResolution);
  const height = Math.ceil((maxY - minY) / demGridResolution);
  const data = new Float32Array(width * height);

  data.fill(Number.NaN);

  for (let row = 0; row < height; row++) {
    const y = maxY - (row + 0.5) * demGridResolution;

    for (let col = 0; col < width; col++) {
      const x = minX + (col + 0.5) * demGridResolution;
      const value = sampleSourceElevation(x, y, spatialIndex);

      if (value !== undefined) {
        data[row * width + col] = value;
      }
    }
  }

  return { minX, minY, maxX, maxY, width, height, data };
}

function sampleDemGrid(x, y, grid) {
  if (x < grid.minX || x >= grid.maxX || y < grid.minY || y >= grid.maxY) {
    return undefined;
  }

  const col = Math.floor((x - grid.minX) / demGridResolution);
  const row = Math.floor((grid.maxY - y) / demGridResolution);

  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) {
    return undefined;
  }

  const value = grid.data[row * grid.width + col];
  return Number.isFinite(value) ? value : undefined;
}

function nextRayDistance(distance) {
  if (distance < 5_000) {
    return distance + 100;
  }

  if (distance < 30_000) {
    return distance + 250;
  }

  return distance + 500;
}

function calculateHorizonAngle(x, y, grid) {
  const observerGround = sampleDemGrid(x, y, grid);

  if (observerGround === undefined) {
    return undefined;
  }

  const observerElevation = observerGround + observerHeightMeters;
  let maxAngle = -90;
  let sawTerrain = false;

  for (let distance = 100; distance <= maxDistanceMeters; distance = nextRayDistance(distance)) {
    const sampleX = x + rayUnitX * distance;
    const sampleY = y + rayUnitY * distance;
    const terrainElevation = sampleDemGrid(sampleX, sampleY, grid);

    if (terrainElevation === undefined) {
      break;
    }

    sawTerrain = true;
    const angle =
      (Math.atan2(terrainElevation - observerElevation, distance) * 180) / Math.PI;
    if (angle > maxAngle) {
      maxAngle = angle;
    }
  }

  return sawTerrain ? maxAngle : undefined;
}

async function writeTile(z, x, y, grid, stats) {
  const pixels = Buffer.alloc(analysisTileSize * analysisTileSize * 4);
  const corners = projectedTileCorners(x, y, z);
  let hasData = false;

  for (let row = 0; row < analysisTileSize; row++) {
    for (let column = 0; column < analysisTileSize; column++) {
      const [sourceX, sourceY] = interpolateProjectedPoint(corners, column, row);
      const value = calculateHorizonAngle(sourceX, sourceY, grid);
      const [red, green, blue, alpha] = colorForHorizon(value);
      const offset = (row * analysisTileSize + column) * 4;

      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = alpha;

      if (alpha > 0) {
        hasData = true;
        stats.min = Math.min(stats.min, value);
        stats.max = Math.max(stats.max, value);
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
      width: analysisTileSize,
      height: analysisTileSize,
      channels: 4,
    },
  })
    .resize(outputTileSize, outputTileSize, { kernel: "cubic" })
    .webp({ quality: 70, alphaQuality: 80, effort: 5 })
    .toFile(tilePath);

  return true;
}

async function main() {
  await stat(inputDir);
  console.log("Loading MDT GeoTIFFs...");
  const { sourceTiles, spatialIndex, sourceBounds } = await loadSourceTiles();
  const bounds = lonLatBoundsForSourceBounds(sourceBounds);
  console.log(`Loaded ${sourceTiles.length} GeoTIFFs.`);
  console.log("Building 100m DEM analysis grid...");
  const grid = buildDemGrid(sourceBounds, spatialIndex);
  console.log(`DEM grid: ${grid.width} x ${grid.height}`);

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  let writtenTiles = 0;
  const zoomSummary = {};
  const stats = { min: Infinity, max: -Infinity };

  for (let z = minZoom; z <= maxZoom; z++) {
    const xStart = lonToTileX(bounds[0], z);
    const xEnd = lonToTileX(bounds[2], z);
    const yStart = latToTileY(bounds[3], z);
    const yEnd = latToTileY(bounds[1], z);
    let zoomTiles = 0;

    for (let x = xStart; x <= xEnd; x++) {
      for (let y = yStart; y <= yEnd; y++) {
        if (await writeTile(z, x, y, grid, stats)) {
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
        tileSize: outputTileSize,
        analysisTileSize,
        demGridResolution,
        minzoom: minZoom,
        maxzoom: maxZoom,
        bounds,
        sourceProjection: "EPSG:25830",
        sourceFiles: sourceTiles.length,
        observerHeightMeters,
        eclipseAzimuthDegrees,
        maxDistanceMeters,
        minHorizonDegrees: stats.min,
        maxHorizonDegrees: stats.max,
        tiles: writtenTiles,
        zooms: zoomSummary,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Horizon range: ${stats.min.toFixed(2)}° - ${stats.max.toFixed(2)}°.`);
  console.log(`Wrote ${writtenTiles} tiles to ${path.relative(rootDir, outputDir)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
