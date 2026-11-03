// Opening copy of Cell 10 — paste into one Observable JavaScript or TypeScript cell.
// Attach restaurants_paris.geojson, basemap_paris_AOI.geojson, AOI.geojson,
// and eiffel_buffers.geojson before running. All four use EPSG:2154.
import * as cell00OpeningPlot from "npm:@observablehq/plot";
import * as cell00OpeningHtl from "npm:htl";
import * as cell00OpeningD3 from "npm:d3";

// EDIT THE TITLE AND SUBTITLE HERE.
const cell00OpeningTitle = "The Eiffel-proximate Tourist Trap Effect";
const cell00OpeningSubtitle = "Weighted-Rating Distance Decay";
// Didot is used when available; the remaining fonts are local fallbacks.
const cell00OpeningFont = 'Didot, "Bodoni MT", Georgia, serif';

// EDIT THESE COLORS: keys match the basemap's source attribute exactly.
const cell00OpeningBasemapColors = {
  "Parcs": "#F0F4F2",
  "La Seine": "#F6F8FA",
  "Tour Eiffel": "#563B22",
  "batiments": "#F5F5F5"
};
const cell00OpeningBackground = "#ffffff";
const cell00OpeningUnknownSourceColor = "#eeeeee";
const cell00OpeningMissingRatingColor = "#929292";
const cell00OpeningVignetteStartMeters = 1500; // Fade starts at the outer buffer.
const cell00OpeningVignetteStrength = 1; // White opacity at the farthest map corner, from 0 to 1.
const cell00OpeningRingDashLength = 5;
const cell00OpeningRingDashGap = 7;
const cell00OpeningRingOpacity = 0.67; // 33% transparent.
// Both restaurant points and band outlines use this same 1–5 rating scale.
const cell00OpeningRatingScale = {
  type: "linear",
  domain: [1, 1.5, 2.5, 3.5, 4.5, 5],
  range: ["#a50026", "#a50026", "#f6a09a", "#a6cee3", "#08306b", "#08306b"],
  interpolate: "rgb",
  clamp: true,
  label: "Restaurant rating / median rating in band"
};

const [cell00OpeningRestaurants, cell00OpeningBasemap, cell00OpeningAOI, cell00OpeningBuffers] = await Promise.all([
  FileAttachment("restaurants_paris.geojson").json(),
  FileAttachment("basemap_paris_AOI.geojson").json(),
  FileAttachment("AOI.geojson").json(),
  FileAttachment("eiffel_buffers.geojson").json()
]);
for (const [name, data] of Object.entries({
  restaurants: cell00OpeningRestaurants, basemap: cell00OpeningBasemap,
  AOI: cell00OpeningAOI, buffers: cell00OpeningBuffers
})) {
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features))
    throw new Error(`${name} must be a GeoJSON FeatureCollection.`);
}

// Points use the precomputed Lambert-93 distance from the Eiffel Tower.
const cell00OpeningPoints = cell00OpeningRestaurants.features.flatMap(feature => {
  const p = feature.properties ?? {};
  const xy = feature.geometry?.coordinates;
  const distance = p.distance_from_eiffeltower_m;
  if (feature.geometry?.type !== "Point" || !Array.isArray(xy) ||
      !Number.isFinite(xy[0]) || !Number.isFinite(xy[1]) ||
      !Number.isFinite(distance) || distance < 0 || distance > 1500) return [];
  const rating = Number.isFinite(p.rating) && p.rating >= 1 && p.rating <= 5 ? p.rating : null;
  return [{x: xy[0], y: xy[1], distance, rating, name: p.restaurant_name || "Unnamed restaurant"}];
});

// Each outline represents only its own 250 m annulus, not the cumulative circle.
// Bands include the lower edge and exclude the upper edge, except 1500 m is included.
const cell00OpeningBands = [250, 500, 750, 1000, 1250, 1500].map(radius => {
  const lower = radius - 250;
  const ratings = cell00OpeningPoints.filter(p => p.rating !== null && p.distance >= lower &&
    (radius === 1500 ? p.distance <= radius : p.distance < radius)).map(p => p.rating);
  return {lower, radius, n: ratings.length,
    mean: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    median: ratings.length ? cell00OpeningD3.median(ratings) : null};
});

const cell00OpeningBufferFeatures = cell00OpeningBuffers.features.map(feature => {
  const match = /^buffer_(\d+)m$/.exec(feature.properties?.layer ?? "");
  const band = cell00OpeningBands.find(d => d.radius === Number(match?.[1]));
  if (!band) throw new Error(`Unrecognized buffer layer: ${feature.properties?.layer}`);
  return {...feature, properties: {...feature.properties, ...band}};
});
if (cell00OpeningBufferFeatures.length !== cell00OpeningBands.length ||
    new Set(cell00OpeningBufferFeatures.map(f => f.properties.radius)).size !== cell00OpeningBands.length)
  throw new Error("Expected one buffer for each radius from 250 to 1500 m.");

// Find the southeast vertex of each supplied ring; north is positive y in EPSG:2154.
// This uses the actual buffer geometry and needs no additional tower-point attachment.
const cell00OpeningRingLabels = cell00OpeningBufferFeatures.map(feature => {
  const ring = feature.geometry.coordinates[0][0];
  const centerX = (Math.min(...ring.map(p => p[0])) + Math.max(...ring.map(p => p[0]))) / 2;
  const centerY = (Math.min(...ring.map(p => p[1])) + Math.max(...ring.map(p => p[1]))) / 2;
  const [x, y] = ring.reduce((best, p) =>
    (p[0] - centerX) - (p[1] - centerY) > (best[0] - centerX) - (best[1] - centerY) ? p : best);
  return {...feature.properties, x, y, label: feature.properties.median === null ? "—" : feature.properties.median.toFixed(3)};
});
const cell00OpeningMapWidth = Math.max(240, Math.min(width, 1100));
const cell00OpeningMapHeight = Math.round(cell00OpeningMapWidth * 0.86);
// Fit an explicit planar projection to the AOI, with north up and an 8 px margin.
// Reuse this exact projection for the scale bar below.
const cell00OpeningProjection = cell00OpeningD3.geoIdentity().reflectY(true)
  .fitExtent([[8, 8], [cell00OpeningMapWidth - 8, cell00OpeningMapHeight - 8]], cell00OpeningAOI);
// Center the fade on the buffer geometry and size it in the projected map's pixels.
const cell00OpeningCenterRing = cell00OpeningBufferFeatures[0].geometry.coordinates[0][0];
const cell00OpeningCenter = [
  (Math.min(...cell00OpeningCenterRing.map(p => p[0])) + Math.max(...cell00OpeningCenterRing.map(p => p[0]))) / 2,
  (Math.min(...cell00OpeningCenterRing.map(p => p[1])) + Math.max(...cell00OpeningCenterRing.map(p => p[1]))) / 2
];
const [cell00OpeningVignetteX, cell00OpeningVignetteY] = cell00OpeningProjection(cell00OpeningCenter);
const cell00OpeningFadeStartPoint = cell00OpeningProjection([cell00OpeningCenter[0] + cell00OpeningVignetteStartMeters, cell00OpeningCenter[1]]);
const cell00OpeningFadeStart = Math.hypot(cell00OpeningFadeStartPoint[0] - cell00OpeningVignetteX, cell00OpeningFadeStartPoint[1] - cell00OpeningVignetteY);
const cell00OpeningFadeRadius = Math.max(...[[0, 0], [cell00OpeningMapWidth, 0], [0, cell00OpeningMapHeight], [cell00OpeningMapWidth, cell00OpeningMapHeight]]
  .map(([x, y]) => Math.hypot(x - cell00OpeningVignetteX, y - cell00OpeningVignetteY)));
const cell00OpeningFadeOffset = Math.min(100, 100 * cell00OpeningFadeStart / cell00OpeningFadeRadius);
const cell00OpeningFadeId = `cell00Opening-fade-${Math.random().toString(36).slice(2)}`;
// Draw buildings first and the tower last, regardless of feature order in the file.
const cell00OpeningSources = [...new Set(cell00OpeningBasemap.features.map(f => f.properties?.source))];
const cell00OpeningSourceOrder = ["batiments", ...cell00OpeningSources.filter(source =>
  !["batiments", "Parcs", "La Seine", "Tour Eiffel"].includes(source)),
  "Parcs", "La Seine", "Tour Eiffel"].filter(source => cell00OpeningSources.includes(source));
const cell00OpeningMap = cell00OpeningPlot.plot({
  width: cell00OpeningMapWidth,
  height: cell00OpeningMapHeight,
  margin: 8,
  projection: cell00OpeningProjection,
  color: cell00OpeningRatingScale,
  style: {background: cell00OpeningBackground, color: "#1f2933", fontFamily: cell00OpeningFont},
  marks: [
    // Separate marks make every source color a literal, independent of the rating scale.
    ...cell00OpeningSourceOrder.map(source =>
      cell00OpeningPlot.geo(cell00OpeningBasemap.features.filter(f => f.properties?.source === source), {
        fill: cell00OpeningBasemapColors[source] ?? cell00OpeningUnknownSourceColor, stroke: "none"
      })),
    // The fade is above the basemap but below all circles, points, and labels.
    () => cell00OpeningHtl.svg`<g pointer-events="none">
      <defs><radialGradient id=${cell00OpeningFadeId} gradientUnits="userSpaceOnUse"
        cx=${cell00OpeningVignetteX} cy=${cell00OpeningVignetteY} r=${cell00OpeningFadeRadius}>
        <stop offset="0%" stop-color="white" stop-opacity="0" />
        <stop offset=${`${cell00OpeningFadeOffset}%`} stop-color="white" stop-opacity="0" />
        <stop offset=${`${cell00OpeningFadeOffset + (100 - cell00OpeningFadeOffset) * 0.15}%`}
          stop-color="white" stop-opacity=${cell00OpeningVignetteStrength * 0.72} />
        <stop offset=${`${cell00OpeningFadeOffset + (100 - cell00OpeningFadeOffset) * 0.45}%`}
          stop-color="white" stop-opacity=${cell00OpeningVignetteStrength * 0.96} />
        <stop offset="100%" stop-color="white" stop-opacity=${cell00OpeningVignetteStrength} />
      </radialGradient></defs>
      <rect x="0" y="0" width=${cell00OpeningMapWidth} height=${cell00OpeningMapHeight} fill=${`url(#${cell00OpeningFadeId})`} />
    </g>`,
    cell00OpeningPlot.geo(cell00OpeningBufferFeatures.filter(f => f.properties.median !== null), {
      fill: "none", stroke: f => f.properties.median, strokeWidth: 2,
      strokeDasharray: `${cell00OpeningRingDashLength},${cell00OpeningRingDashGap}`,
      strokeOpacity: cell00OpeningRingOpacity, strokeLinecap: "round",
      title: f => `${f.properties.lower}–${f.properties.radius} m band\nMedian rating: ${f.properties.median.toFixed(3)} / 5\nRated restaurants: ${f.properties.n}`
    }),
    cell00OpeningPlot.geo(cell00OpeningBufferFeatures.filter(f => f.properties.median === null), {
      fill: "none", stroke: cell00OpeningMissingRatingColor, strokeWidth: 2,
      strokeDasharray: `${cell00OpeningRingDashLength},${cell00OpeningRingDashGap}`,
      strokeOpacity: cell00OpeningRingOpacity, strokeLinecap: "round",
      title: f => `${f.properties.lower}–${f.properties.radius} m band\nNo rated restaurants`
    }),
    cell00OpeningPlot.dot(cell00OpeningPoints.filter(p => p.rating === null), {
      x: "x", y: "y", r: 3 * 96 / 72, fill: cell00OpeningMissingRatingColor, stroke: "none",
      title: p => `${p.name}\nNo rating\nDistance: ${Math.round(p.distance)} m`
    }),
    // SVG paints later points on top: draw high-rated blue before low-rated red.
    cell00OpeningPlot.dot(cell00OpeningPoints.filter(p => p.rating !== null).sort((a, b) => b.rating - a.rating), {
      x: "x", y: "y", r: 3 * 96 / 72, fill: "rating", stroke: "none",
      title: p => `${p.name}\nRating: ${p.rating.toFixed(2)} / 5\nDistance: ${Math.round(p.distance)} m`
    }),
    // Labels and outlines use the same band median and shared rating scale.
    cell00OpeningPlot.text(cell00OpeningRingLabels.filter(d => d.median !== null), {
      x: "x", y: "y", text: "label", fill: "median", stroke: "white", strokeWidth: 3,
      paintOrder: "stroke", fontFamily: cell00OpeningFont, fontSize: 11, fontWeight: 600,
      title: d => `${d.lower}–${d.radius} m band\nMedian rating: ${d.label} / 5\nRated restaurants: ${d.n}`
    }),
    cell00OpeningPlot.text(cell00OpeningRingLabels.filter(d => d.median === null), {
      x: "x", y: "y", text: "label", fill: cell00OpeningMissingRatingColor,
      stroke: "white", strokeWidth: 3, paintOrder: "stroke", fontFamily: cell00OpeningFont, fontSize: 11, fontWeight: 600,
      title: d => `${d.lower}–${d.radius} m band\nNo rated restaurants`
    })
  ]
});

// Measure 500 projected metres in SVG pixels so the bar stays correct when resized.
const cell00OpeningScaleStart = cell00OpeningProjection([648000, 6862000]);
const cell00OpeningScaleEnd = cell00OpeningProjection([648500, 6862000]);
const cell00OpeningScaleLength = Math.hypot(cell00OpeningScaleEnd[0] - cell00OpeningScaleStart[0],
  cell00OpeningScaleEnd[1] - cell00OpeningScaleStart[1]);
// Center the scale and its headings together, with room for the CRS text.
const cell00OpeningScaleCenterX = Math.max(90, 18 + cell00OpeningScaleLength / 2);
const cell00OpeningScaleX = cell00OpeningScaleCenterX - cell00OpeningScaleLength / 2;
const cell00OpeningScaleY = cell00OpeningMapHeight - 27;

// These decorations use SVG coordinates; their positions scale with the map.
cell00OpeningMap.append(cell00OpeningHtl.svg`<g pointer-events="none" font-family=${cell00OpeningFont} fill="#303940">
  <g aria-label="Scale bar, 0 to 500 metres">
    <text x=${cell00OpeningScaleCenterX} y=${cell00OpeningScaleY - 46} text-anchor="middle" font-size="10" font-weight="600">RGF93 / Lambert-93 · EPSG:2154</text>
    <text x=${cell00OpeningScaleCenterX} y=${cell00OpeningScaleY - 23} text-anchor="middle" font-size="10" font-weight="600">Scale 1:10,000</text>
    <text x=${cell00OpeningScaleX} y=${cell00OpeningScaleY - 8} font-size="10">0</text>
    <text x=${cell00OpeningScaleX + cell00OpeningScaleLength} y=${cell00OpeningScaleY - 8} font-size="10" text-anchor="end">500 m</text>
    <rect x=${cell00OpeningScaleX} y=${cell00OpeningScaleY} width=${cell00OpeningScaleLength / 2} height="5" fill="#303940" />
    <rect x=${cell00OpeningScaleX + cell00OpeningScaleLength / 2} y=${cell00OpeningScaleY} width=${cell00OpeningScaleLength / 2} height="5"
      fill="white" stroke="#303940" stroke-width="0.8" />
  </g>
</g>`);

const cell00OpeningLegend = cell00OpeningPlot.legend({
  color: {...cell00OpeningRatingScale, label: "TripAdvisor Mean Rating"},
  width: Math.min(cell00OpeningMapWidth - 80, 140), height: 46,
  marginLeft: 8, marginRight: 8, ticks: [1, 5], tickFormat: ".0f",
  style: {fontFamily: cell00OpeningFont}
});
// Keep legend text readable over the map without an opaque panel.
cell00OpeningLegend.querySelectorAll("text").forEach(text => {
  text.setAttribute("stroke", "white");
  text.setAttribute("stroke-width", "3");
  text.setAttribute("stroke-linejoin", "round");
  text.setAttribute("paint-order", "stroke");
});
// A dashed gradient echoes the ring outlines and shares the point rating scale.
const cell00OpeningMedianLegendWidth = Math.min(cell00OpeningMapWidth - 80, 140);
const cell00OpeningMedianLegendColor = cell00OpeningD3.scaleLinear().domain(cell00OpeningRatingScale.domain)
  .range(cell00OpeningRatingScale.range).interpolate(cell00OpeningD3.interpolateRgb).clamp(true);
const cell00OpeningMedianLegendSpan = cell00OpeningMedianLegendWidth - 16;
// Give each dash a literal color, avoiding SVG gradient references on a zero-height line.
const cell00OpeningMedianLegendStep = cell00OpeningRingDashLength + cell00OpeningRingDashGap;
const cell00OpeningMedianLegendDashes = Array.from({length: Math.ceil(cell00OpeningMedianLegendSpan / cell00OpeningMedianLegendStep)}, (_, i) => {
  const start = i * cell00OpeningMedianLegendStep;
  const end = Math.min(start + cell00OpeningRingDashLength, cell00OpeningMedianLegendSpan);
  const rating = 1 + 4 * (start + end) / (2 * cell00OpeningMedianLegendSpan);
  return {x1: 8 + start, x2: 8 + end, color: cell00OpeningMedianLegendColor(rating)};
});
const cell00OpeningMedianLegend = cell00OpeningHtl.svg`<svg width=${cell00OpeningMedianLegendWidth} height="34"
  viewBox=${`0 0 ${cell00OpeningMedianLegendWidth} 34`} role="img" aria-label="Band Median Rating, from 1 to 5">
  <g font-family=${cell00OpeningFont} font-size="9" fill="#27343c" stroke="white"
    stroke-width="2" stroke-linejoin="round" paint-order="stroke">
    <text x="8" y="9" font-weight="600">Distance Band Median Rating</text>
    <text x="8" y="31">1</text>
    <text x=${cell00OpeningMedianLegendWidth - 8} y="31" text-anchor="end">5</text>
  </g>
  ${cell00OpeningMedianLegendDashes.map(dash => cell00OpeningHtl.svg`<line x1=${dash.x1} x2=${dash.x2}
    y1="18" y2="18" stroke=${dash.color} stroke-width="2" stroke-opacity=${cell00OpeningRingOpacity} stroke-linecap="round" />`)}
</svg>`;

// Overview uses the full Paris point dataset from Cell 02 with a muted color scale.
// The actual AOI geometry, rather than an approximated square, is outlined in brown.
const cell00OpeningInsetRatingScale = {
  type: "linear", domain: [1, 5], range: ["#c2c2c2", "#666666"],
  interpolate: "rgb", clamp: true
};
const cell00OpeningInsetPoints = cell00OpeningRestaurants.features.flatMap(feature => {
  const xy = feature.geometry?.coordinates;
  if (feature.geometry?.type !== "Point" || !Array.isArray(xy) ||
      !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return [];
  const rating = feature.properties?.rating;
  return [{x: xy[0], y: xy[1],
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null}];
});
const cell00OpeningInsetWidth = Math.round(0.75 * Math.min(190, Math.max(70, Math.round(cell00OpeningMapWidth * 0.22))));
const cell00OpeningInsetAOIColor = "#bd8b63";
const cell00OpeningInset = cell00OpeningPlot.plot({
  width: cell00OpeningInsetWidth,
  height: Math.round(cell00OpeningInsetWidth * 0.83),
  margin: 4,
  projection: {type: "reflect-y", domain: {type: "MultiPoint",
    coordinates: cell00OpeningInsetPoints.map(p => [p.x, p.y])}},
  color: cell00OpeningInsetRatingScale,
  style: {background: "transparent", fontFamily: cell00OpeningFont},
  marks: [
    cell00OpeningPlot.dot(cell00OpeningInsetPoints.filter(p => p.rating === null), {
      x: "x", y: "y", r: 0.85, fill: cell00OpeningMissingRatingColor, stroke: "none"
    }),
    cell00OpeningPlot.dot(cell00OpeningInsetPoints.filter(p => p.rating !== null).sort((a, b) => b.rating - a.rating), {
      x: "x", y: "y", r: 0.85, fill: "rating", stroke: "none"
    }),
    cell00OpeningPlot.geo(cell00OpeningAOI, {fill: "none", stroke: cell00OpeningInsetAOIColor, strokeWidth: 3})
  ]
});

// Self-contained version of Cell 07's unadjusted GAM and sensitivity fits.
const cell00OpeningGamRows = cell00OpeningRestaurants.features.map(f => ({...f.properties,
  rating: f.properties?.rating, distance: f.properties?.distance_from_eiffeltower_m
})).filter(d => Number.isFinite(d.rating) && Number.isFinite(d.distance) &&
  d.distance >= 0 && d.distance <= 1500);
if (cell00OpeningGamRows.length < 30) throw new Error("Too few ratings and distances for the GAM.");
const cell00OpeningGamMin = Math.min(...cell00OpeningGamRows.map(d => d.distance));
const cell00OpeningGamMax = Math.max(...cell00OpeningGamRows.map(d => d.distance));
function cell00OpeningGamSpec(k, min = cell00OpeningGamMin, max = cell00OpeningGamMax) {
  const degree = 3, interior = k - degree - 1;
  if (k < 4 || !(max > min)) throw new Error("Invalid spline specification.");
  return {k, min, max, knots: [...Array(4).fill(0),
    ...Array.from({length: interior}, (_, i) => (i + 1) / (interior + 1)), ...Array(4).fill(1)]};
}
function cell00OpeningGamBasis(distance, spec) {
  if (distance < spec.min - 1e-9 || distance > spec.max + 1e-9) throw new Error("Prediction outside observed range.");
  const x = Math.max(0, Math.min(1, (distance - spec.min) / (spec.max - spec.min)));
  if (x === 1) return Array.from({length: spec.k}, (_, i) => +(i === spec.k - 1));
  const t = spec.knots;
  let b = Array.from({length: t.length - 1}, (_, i) => +(t[i] <= x && x < t[i + 1]));
  for (let p = 1; p <= 3; p++) b = Array.from({length: t.length - p - 1}, (_, i) =>
    (t[i + p] > t[i] ? (x - t[i]) / (t[i + p] - t[i]) * b[i] : 0) +
    (t[i + p + 1] > t[i + 1] ? (t[i + p + 1] - x) / (t[i + p + 1] - t[i + 1]) * b[i + 1] : 0));
  return b;
}
function cell00OpeningGamPenalty(k, p) {
  const s = Array.from({length: p}, () => Array(p).fill(0));
  for (let i = 0; i < k - 2; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++)
    s[i + a][i + b] += [1, -2, 1][a] * [1, -2, 1][b];
  return s;
}
// Cholesky factorization solves the small positive-definite penalized system;
// fail explicitly on rank deficiency instead of quietly adding a ridge penalty.
function cell00OpeningGamCholesky(a) {
  const n = a.length, l = Array.from({length: n}, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let v = a[i][j];
    for (let k = 0; k < j; k++) v -= l[i][k] * l[j][k];
    if (i === j) { if (!(v > 1e-12)) throw new Error("Rank-deficient model matrix."); l[i][j] = Math.sqrt(v); }
    else l[i][j] = v / l[j][j];
  }
  return l;
}
function cell00OpeningGamSolve(l, b) {
  const n = b.length, y = Array(n), x = Array(n);
  for (let i = 0; i < n; i++) { let v = b[i]; for (let j = 0; j < i; j++) v -= l[i][j] * y[j]; y[i] = v / l[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let v = y[i]; for (let j = i + 1; j < n; j++) v -= l[j][i] * x[j]; x[i] = v / l[i][i]; }
  return x;
}
const cell00OpeningGamDot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cell00OpeningGamLambdas = Array.from({length: 29}, (_, i) => 10 ** (-4 + i * 0.25));
function cell00OpeningGamFit(rows, spec, controls = () => [], lambdas = cell00OpeningGamLambdas) {
  const x = rows.map(d => [...cell00OpeningGamBasis(d.distance, spec), ...controls(d)]), y = rows.map(d => d.rating);
  const n = x.length, p = x[0].length;
  if (n <= p) throw new Error("Not enough observations for the model.");
  const cross = Array.from({length: p}, () => Array(p).fill(0)), xy = Array(p).fill(0);
  let yy = 0;
  for (let r = 0; r < n; r++) { yy += y[r] ** 2; for (let i = 0; i < p; i++) {
    xy[i] += x[r][i] * y[r]; for (let j = 0; j <= i; j++) cross[i][j] += x[r][i] * x[r][j];
  }}
  for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) cross[j][i] = cross[i][j];
  const penalty = cell00OpeningGamPenalty(spec.k, p);
  let best = null;
  const smoothingScores = [];
  for (const lambda of lambdas) {
    let l; try { l = cell00OpeningGamCholesky(cross.map((row, i) => row.map((v, j) => v + lambda * penalty[i][j]))); } catch { continue; }
    const beta = cell00OpeningGamSolve(l, xy);
    let edf = 0;
    for (let j = 0; j < p; j++) edf += cell00OpeningGamSolve(l, cross.map(row => row[j]))[j];
    // Algebraic SSE avoids repeated passes over observations for each lambda.
    const sse = Math.max(0, yy - 2 * cell00OpeningGamDot(beta, xy) + cell00OpeningGamDot(beta, cross.map(row => cell00OpeningGamDot(row, beta))));
    const gcv = n * sse / (n - edf) ** 2;
    if (Number.isFinite(gcv)) smoothingScores.push({lambda, gcv});
    if (Number.isFinite(gcv) && (!best || gcv < best.gcv)) best = {beta, edf, sse, gcv, lambda};
  }
  if (!best) throw new Error("No numerically valid fit; inspect the model matrix.");
  const mean = y.reduce((a, b) => a + b, 0) / n, sst = y.reduce((a, b) => a + (b - mean) ** 2, 0);
  const predict = (distance, controlVector = Array(p - spec.k).fill(0)) => cell00OpeningGamDot([...cell00OpeningGamBasis(distance, spec), ...controlVector], best.beta);
  const fitted = x.map(row => cell00OpeningGamDot(row, best.beta));
  return {...best, n, spec, fitted, smoothingScores, residuals: y.map((v, i) => v - fitted[i]), predict,
    rmse: Math.sqrt(best.sse / n), residualSD: Math.sqrt(best.sse / (n - best.edf)), r2: sst > 0 ? 1 - best.sse / sst : null};
}

const cell00OpeningGamSpec10 = cell00OpeningGamSpec(10);
const cell00OpeningGamPrimary = cell00OpeningGamFit(cell00OpeningGamRows, cell00OpeningGamSpec10);
const cell00OpeningGamLeaveOneOut = cell00OpeningGamRows.filter(row => row.distance < 250).map(row => {
  const sample = cell00OpeningGamRows.filter(d => d !== row);
  return {fit: cell00OpeningGamFit(sample, cell00OpeningGamSpec10),
    min: Math.min(...sample.map(d => d.distance)), max: Math.max(...sample.map(d => d.distance))};
});
const cell00OpeningGamReviewSample = cell00OpeningGamRows.filter(row =>
  Number.isFinite(row.reviews_count_in_default_language) && row.reviews_count_in_default_language >= 5);
const cell00OpeningGamReviewFit = cell00OpeningGamReviewSample.length > 30
  ? cell00OpeningGamFit(cell00OpeningGamReviewSample, cell00OpeningGamSpec10) : null;
const cell00OpeningGamReviewMin = cell00OpeningGamReviewFit ? Math.min(...cell00OpeningGamReviewSample.map(d => d.distance)) : null;
const cell00OpeningGamReviewMax = cell00OpeningGamReviewFit ? Math.max(...cell00OpeningGamReviewSample.map(d => d.distance)) : null;
const cell00OpeningGamGrid = Array.from({length: 201}, (_, i) =>
  i === 200 ? cell00OpeningGamMax : cell00OpeningGamMin + (cell00OpeningGamMax - cell00OpeningGamMin) * i / 200);
const cell00OpeningGamCurve = (fit, min, max) => cell00OpeningGamGrid.filter(distance => distance >= min && distance <= max)
  .map(distance => ({distance, predicted: fit.predict(distance)}));

const cell00OpeningGamOriginalWidth = Math.min(290, Math.max(170, Math.round(cell00OpeningMapWidth * 0.35)), cell00OpeningMapWidth - 24);
const cell00OpeningGamWidth = Math.round(0.8 * Math.round(1.25 * Math.round(cell00OpeningGamOriginalWidth / 2)));
const cell00OpeningGamHeight = Math.round(0.75 * Math.round(1.25 * Math.round(1.5 * Math.round(Math.max(120, Math.round(cell00OpeningGamOriginalWidth * 0.58)) / 2))));
const cell00OpeningGamPlot = cell00OpeningPlot.plot({
  width: cell00OpeningGamWidth, height: cell00OpeningGamHeight,
  marginTop: 9, marginRight: 29, marginBottom: 21, marginLeft: 3,
  x: {domain: [0, 1500], ticks: [0, 500, 1000, 1500], label: "Distance (m)", tickSize: 0},
  y: {domain: [1, 5], axis: "right", ticks: [1, 2, 3, 4, 5], label: null, tickSize: 0},
  color: cell00OpeningRatingScale,
  style: {background: "transparent", color: "#303940", fontFamily: cell00OpeningFont, fontSize: "8.75px"},
  marks: [
    // The zero-distance guide follows the editable Eiffel Tower basemap color.
    cell00OpeningPlot.ruleX([0], {
      stroke: cell00OpeningBasemapColors["Tour Eiffel"], strokeWidth: 1.2,
      strokeDasharray: "1,3", strokeLinecap: "round"
    }),
    cell00OpeningPlot.ruleX(cell00OpeningBands.filter(b => b.median !== null), {
      x: "radius", stroke: "median", strokeWidth: 1,
      strokeDasharray: `${cell00OpeningRingDashLength},${cell00OpeningRingDashGap}`,
      strokeOpacity: cell00OpeningRingOpacity, clip: true
    }),
    cell00OpeningPlot.ruleX(cell00OpeningBands.filter(b => b.median === null), {
      x: "radius", stroke: cell00OpeningMissingRatingColor, strokeWidth: 1,
      strokeDasharray: `${cell00OpeningRingDashLength},${cell00OpeningRingDashGap}`,
      strokeOpacity: cell00OpeningRingOpacity, clip: true
    }),
    ...cell00OpeningGamLeaveOneOut.map(({fit, min, max}) =>
      cell00OpeningPlot.line(cell00OpeningGamCurve(fit, min, max), {
        x: "distance", y: "predicted", stroke: "#d4c4ed", strokeOpacity: 0.9, strokeWidth: 1.4, clip: true
      })),
    ...(cell00OpeningGamReviewFit ? [cell00OpeningPlot.line(cell00OpeningGamCurve(cell00OpeningGamReviewFit, cell00OpeningGamReviewMin, cell00OpeningGamReviewMax), {
      x: "distance", y: "predicted", stroke: "#c29cdb", strokeWidth: 2, strokeDasharray: "4,3", clip: true
    })] : []),
    cell00OpeningPlot.line(cell00OpeningGamCurve(cell00OpeningGamPrimary, cell00OpeningGamMin, cell00OpeningGamMax), {
      x: "distance", y: "predicted", stroke: "#aa91d0", strokeWidth: 2.5, clip: true
    })
  ]
});
const cell00OpeningGamAxisX = cell00OpeningGamWidth - 3;
const cell00OpeningGamAxisY = 9 + (cell00OpeningGamHeight - 9 - 21) / 2;
cell00OpeningGamPlot.append(cell00OpeningHtl.svg`<text x=${cell00OpeningGamAxisX} y=${cell00OpeningGamAxisY}
  transform=${`rotate(-90 ${cell00OpeningGamAxisX} ${cell00OpeningGamAxisY})`}
  text-anchor="middle" font-family=${cell00OpeningFont} font-size="8.75" fill="#303940">Predicted rating</text>`);
cell00OpeningGamPlot.querySelectorAll("text").forEach(text => {
  text.setAttribute("stroke", "white");
  text.setAttribute("stroke-width", "2");
  text.setAttribute("stroke-linejoin", "round");
  text.setAttribute("paint-order", "stroke");
});

// Native SVG title tooltips use browser-controlled fonts. Convert them into one
// styled popup while keeping the same text as accessible labels on the marks.
const cell00OpeningPopupText = new WeakMap();
cell00OpeningMap.querySelectorAll("title").forEach(title => {
  const mark = title.parentNode;
  if (mark === cell00OpeningMap) return;
  cell00OpeningPopupText.set(mark, title.textContent);
  mark.setAttribute("aria-label", title.textContent);
  title.remove();
});
const cell00OpeningPopup = cell00OpeningHtl.html`<div role="tooltip" style=${{
  display: "none", position: "absolute", pointerEvents: "none", zIndex: 2,
  fontFamily: cell00OpeningFont, fontSize: "13px", lineHeight: "1.35", whiteSpace: "pre-line",
  color: "#26313a", background: "rgba(255,255,255,0.96)",
  border: "1px solid #d9d6d0", borderRadius: "3px", padding: "6px 8px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.12)", maxWidth: "220px"
}}></div>`;
const cell00OpeningMapContainer = cell00OpeningHtl.html`<div style="position: relative; width: 100%">
  ${cell00OpeningMap}
  <div style=${{
    position: "absolute", left: "12px", top: "12px", width: "260px", maxWidth: `calc(100% - ${cell00OpeningInsetWidth + 44}px)`,
    padding: "8px", pointerEvents: "none", fontFamily: cell00OpeningFont,
    textShadow: "0 0 2px white, 0 0 4px white, 1px 1px 3px white, -1px -1px 3px white"
  }}>
    <h2 style="margin: 0 0 3px; font-size: 18px; line-height: 1.1; font-weight: 700; color: #18242b">${cell00OpeningTitle}</h2>
    <div style="margin-bottom: 4px; font-size: 12px; line-height: 1.25; font-weight: 600; color: #27343c">${cell00OpeningSubtitle}</div>
    ${cell00OpeningLegend}
    ${cell00OpeningMedianLegend}
    <div style="font-size: 11px; font-weight: 600; color: #27343c">Ring increments: 250 m</div>
  </div>
  <div aria-label="Paris restaurant overview; brown outline marks the main map area" style=${{
    position: "absolute", right: "12px", top: "12px", width: `${cell00OpeningInsetWidth}px`,
    pointerEvents: "none", fontFamily: cell00OpeningFont, textAlign: "center",
    color: "#27343c", textShadow: "0 0 3px white, 0 0 5px white"
  }}>
    <div style="font-size: 12px; font-weight: 700">Paris <span style=${{color: cell00OpeningInsetAOIColor}}>AOI</span></div>
    ${cell00OpeningInset}
  </div>
  <div aria-label="GAM predicted restaurant rating versus distance, with sensitivity curves" style=${{
    position: "absolute", right: "12px", bottom: "12px", width: `${cell00OpeningGamWidth}px`,
    pointerEvents: "none", fontFamily: cell00OpeningFont, color: "#27343c",
    textShadow: "0 0 3px white, 0 0 5px white"
  }}>
    ${cell00OpeningGamPlot}
    <div style="font-size: 9px; font-weight: 700; text-align: center">GAM sensitivity fits</div>
  </div>
  ${cell00OpeningPopup}
</div>`;
cell00OpeningMap.addEventListener("pointermove", event => {
  let target = event.target;
  while (target && target !== cell00OpeningMap && !cell00OpeningPopupText.has(target)) target = target.parentNode;
  const value = target && cell00OpeningPopupText.get(target);
  if (!value) { cell00OpeningPopup.style.display = "none"; return; }
  cell00OpeningPopup.textContent = value;
  cell00OpeningPopup.style.display = "block";
  const bounds = cell00OpeningMapContainer.getBoundingClientRect();
  const x = event.clientX - bounds.left + 12;
  const y = event.clientY - bounds.top + 12;
  cell00OpeningPopup.style.left = `${Math.max(0, Math.min(x, bounds.width - cell00OpeningPopup.offsetWidth))}px`;
  cell00OpeningPopup.style.top = `${Math.max(0, Math.min(y, bounds.height - cell00OpeningPopup.offsetHeight))}px`;
});
cell00OpeningMap.addEventListener("pointerleave", () => { cell00OpeningPopup.style.display = "none"; });

display(cell00OpeningHtl.html`<figure style=${{margin: 0, maxWidth: `${cell00OpeningMapWidth}px`, fontFamily: cell00OpeningFont}}>
  ${cell00OpeningMapContainer}
  <figcaption style="margin: 4px 8px; font-size: 12px; color: #505860">
    <div style="margin-bottom: 4px">Dashed circles and labels show the median rating in each 250 m band. Gray indicates no rating.</div>
    ${cell00OpeningBands.map(b => `${b.lower}–${b.radius} m: ${b.median === null ? "no ratings" : `median ${b.median.toFixed(3)} (n=${b.n})`}`).join(" · ")}
    <div style="margin-top: 4px">GAM inset: lavender = primary fit; pale lavender = omit one restaurant within 250 m; dashed lavender = at least five reviews in the default language. Curves show fitted mean ratings within each sample's observed distances; sensitivity curves are not confidence intervals.</div>
    <div style="margin-top: 4px">Scale 1:10,000 when the 500 m bar measures 5 cm on the printed or displayed map.</div>
  </figcaption>
</figure>`);
