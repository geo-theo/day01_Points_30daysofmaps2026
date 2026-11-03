// Cell 10 — paste this entire file into one Observable JavaScript or TypeScript cell.
// Attach restaurants_paris.geojson, basemap_paris_AOI.geojson, AOI.geojson,
// and eiffel_buffers.geojson before running. All four use EPSG:2154.
import * as cell10Plot from "npm:@observablehq/plot";
import * as cell10Htl from "npm:htl";
import * as cell10D3 from "npm:d3";

// EDIT THE TITLE AND SUBTITLE HERE.
const cell10Title = "The Eiffel-proximate Tourist Trap Effect";
const cell10Subtitle = "Weighted-Rating Distance Decay";
// Didot is used when available; the remaining fonts are local fallbacks.
const cell10Font = 'Didot, "Bodoni MT", Georgia, serif';

// EDIT THESE COLORS: keys match the basemap's source attribute exactly.
const cell10BasemapColors = {
  "Parcs": "#F0F4F2",
  "La Seine": "#F6F8FA",
  "Tour Eiffel": "#563B22",
  "batiments": "#F5F5F5"
};
const cell10Background = "#ffffff";
const cell10UnknownSourceColor = "#eeeeee";
const cell10MissingRatingColor = "#929292";
const cell10VignetteStartMeters = 1500; // Fade starts at the outer buffer.
const cell10VignetteStrength = 1; // White opacity at the farthest map corner, from 0 to 1.
const cell10RingDashLength = 5;
const cell10RingDashGap = 7;
const cell10RingOpacity = 0.67; // 33% transparent.
// Both restaurant points and band outlines use this same 1–5 rating scale.
const cell10RatingScale = {
  type: "linear",
  domain: [1, 1.5, 2.5, 3.5, 4.5, 5],
  range: ["#a50026", "#a50026", "#f6a09a", "#a6cee3", "#08306b", "#08306b"],
  interpolate: "rgb",
  clamp: true,
  label: "Restaurant rating / median rating in band"
};

const [cell10Restaurants, cell10Basemap, cell10AOI, cell10Buffers] = await Promise.all([
  FileAttachment("restaurants_paris.geojson").json(),
  FileAttachment("basemap_paris_AOI.geojson").json(),
  FileAttachment("AOI.geojson").json(),
  FileAttachment("eiffel_buffers.geojson").json()
]);
for (const [name, data] of Object.entries({
  restaurants: cell10Restaurants, basemap: cell10Basemap,
  AOI: cell10AOI, buffers: cell10Buffers
})) {
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features))
    throw new Error(`${name} must be a GeoJSON FeatureCollection.`);
}

// Points use the precomputed Lambert-93 distance from the Eiffel Tower.
const cell10Points = cell10Restaurants.features.flatMap(feature => {
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
const cell10Bands = [250, 500, 750, 1000, 1250, 1500].map(radius => {
  const lower = radius - 250;
  const ratings = cell10Points.filter(p => p.rating !== null && p.distance >= lower &&
    (radius === 1500 ? p.distance <= radius : p.distance < radius)).map(p => p.rating);
  return {lower, radius, n: ratings.length,
    mean: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    median: ratings.length ? cell10D3.median(ratings) : null};
});

const cell10BufferFeatures = cell10Buffers.features.map(feature => {
  const match = /^buffer_(\d+)m$/.exec(feature.properties?.layer ?? "");
  const band = cell10Bands.find(d => d.radius === Number(match?.[1]));
  if (!band) throw new Error(`Unrecognized buffer layer: ${feature.properties?.layer}`);
  return {...feature, properties: {...feature.properties, ...band}};
});
if (cell10BufferFeatures.length !== cell10Bands.length ||
    new Set(cell10BufferFeatures.map(f => f.properties.radius)).size !== cell10Bands.length)
  throw new Error("Expected one buffer for each radius from 250 to 1500 m.");

// Find the southeast vertex of each supplied ring; north is positive y in EPSG:2154.
// This uses the actual buffer geometry and needs no additional tower-point attachment.
const cell10RingLabels = cell10BufferFeatures.map(feature => {
  const ring = feature.geometry.coordinates[0][0];
  const centerX = (Math.min(...ring.map(p => p[0])) + Math.max(...ring.map(p => p[0]))) / 2;
  const centerY = (Math.min(...ring.map(p => p[1])) + Math.max(...ring.map(p => p[1]))) / 2;
  const [x, y] = ring.reduce((best, p) =>
    (p[0] - centerX) - (p[1] - centerY) > (best[0] - centerX) - (best[1] - centerY) ? p : best);
  return {...feature.properties, x, y, label: feature.properties.median === null ? "—" : feature.properties.median.toFixed(3)};
});
const cell10MapWidth = Math.max(240, Math.min(width, 1100));
const cell10MapHeight = Math.round(cell10MapWidth * 0.86);
// Fit an explicit planar projection to the AOI, with north up and an 8 px margin.
// Reuse this exact projection for the scale bar below.
const cell10Projection = cell10D3.geoIdentity().reflectY(true)
  .fitExtent([[8, 8], [cell10MapWidth - 8, cell10MapHeight - 8]], cell10AOI);
// Center the fade on the buffer geometry and size it in the projected map's pixels.
const cell10CenterRing = cell10BufferFeatures[0].geometry.coordinates[0][0];
const cell10Center = [
  (Math.min(...cell10CenterRing.map(p => p[0])) + Math.max(...cell10CenterRing.map(p => p[0]))) / 2,
  (Math.min(...cell10CenterRing.map(p => p[1])) + Math.max(...cell10CenterRing.map(p => p[1]))) / 2
];
const [cell10VignetteX, cell10VignetteY] = cell10Projection(cell10Center);
const cell10FadeStartPoint = cell10Projection([cell10Center[0] + cell10VignetteStartMeters, cell10Center[1]]);
const cell10FadeStart = Math.hypot(cell10FadeStartPoint[0] - cell10VignetteX, cell10FadeStartPoint[1] - cell10VignetteY);
const cell10FadeRadius = Math.max(...[[0, 0], [cell10MapWidth, 0], [0, cell10MapHeight], [cell10MapWidth, cell10MapHeight]]
  .map(([x, y]) => Math.hypot(x - cell10VignetteX, y - cell10VignetteY)));
const cell10FadeOffset = Math.min(100, 100 * cell10FadeStart / cell10FadeRadius);
const cell10FadeId = `cell10-fade-${Math.random().toString(36).slice(2)}`;
// Draw buildings first and the tower last, regardless of feature order in the file.
const cell10Sources = [...new Set(cell10Basemap.features.map(f => f.properties?.source))];
const cell10SourceOrder = ["batiments", ...cell10Sources.filter(source =>
  !["batiments", "Parcs", "La Seine", "Tour Eiffel"].includes(source)),
  "Parcs", "La Seine", "Tour Eiffel"].filter(source => cell10Sources.includes(source));
const cell10Map = cell10Plot.plot({
  width: cell10MapWidth,
  height: cell10MapHeight,
  margin: 8,
  projection: cell10Projection,
  color: cell10RatingScale,
  style: {background: cell10Background, color: "#1f2933", fontFamily: cell10Font},
  marks: [
    // Separate marks make every source color a literal, independent of the rating scale.
    ...cell10SourceOrder.map(source =>
      cell10Plot.geo(cell10Basemap.features.filter(f => f.properties?.source === source), {
        fill: cell10BasemapColors[source] ?? cell10UnknownSourceColor, stroke: "none"
      })),
    // The fade is above the basemap but below all circles, points, and labels.
    () => cell10Htl.svg`<g pointer-events="none">
      <defs><radialGradient id=${cell10FadeId} gradientUnits="userSpaceOnUse"
        cx=${cell10VignetteX} cy=${cell10VignetteY} r=${cell10FadeRadius}>
        <stop offset="0%" stop-color="white" stop-opacity="0" />
        <stop offset=${`${cell10FadeOffset}%`} stop-color="white" stop-opacity="0" />
        <stop offset=${`${cell10FadeOffset + (100 - cell10FadeOffset) * 0.15}%`}
          stop-color="white" stop-opacity=${cell10VignetteStrength * 0.72} />
        <stop offset=${`${cell10FadeOffset + (100 - cell10FadeOffset) * 0.45}%`}
          stop-color="white" stop-opacity=${cell10VignetteStrength * 0.96} />
        <stop offset="100%" stop-color="white" stop-opacity=${cell10VignetteStrength} />
      </radialGradient></defs>
      <rect x="0" y="0" width=${cell10MapWidth} height=${cell10MapHeight} fill=${`url(#${cell10FadeId})`} />
    </g>`,
    cell10Plot.geo(cell10BufferFeatures.filter(f => f.properties.median !== null), {
      fill: "none", stroke: f => f.properties.median, strokeWidth: 2,
      strokeDasharray: `${cell10RingDashLength},${cell10RingDashGap}`,
      strokeOpacity: cell10RingOpacity, strokeLinecap: "round",
      title: f => `${f.properties.lower}–${f.properties.radius} m band\nMedian rating: ${f.properties.median.toFixed(3)} / 5\nRated restaurants: ${f.properties.n}`
    }),
    cell10Plot.geo(cell10BufferFeatures.filter(f => f.properties.median === null), {
      fill: "none", stroke: cell10MissingRatingColor, strokeWidth: 2,
      strokeDasharray: `${cell10RingDashLength},${cell10RingDashGap}`,
      strokeOpacity: cell10RingOpacity, strokeLinecap: "round",
      title: f => `${f.properties.lower}–${f.properties.radius} m band\nNo rated restaurants`
    }),
    cell10Plot.dot(cell10Points.filter(p => p.rating === null), {
      x: "x", y: "y", r: 3 * 96 / 72, fill: cell10MissingRatingColor, stroke: "white", strokeWidth: 0.7,
      title: p => `${p.name}\nNo rating\nDistance: ${Math.round(p.distance)} m`
    }),
    // SVG paints later points on top: draw high-rated blue before low-rated red.
    cell10Plot.dot(cell10Points.filter(p => p.rating !== null).sort((a, b) => b.rating - a.rating), {
      x: "x", y: "y", r: 3 * 96 / 72, fill: "rating", stroke: "white", strokeWidth: 0.7,
      title: p => `${p.name}\nRating: ${p.rating.toFixed(2)} / 5\nDistance: ${Math.round(p.distance)} m`
    }),
    // Labels and outlines use the same band median and shared rating scale.
    cell10Plot.text(cell10RingLabels.filter(d => d.median !== null), {
      x: "x", y: "y", text: "label", fill: "median", stroke: "white", strokeWidth: 3,
      paintOrder: "stroke", fontFamily: cell10Font, fontSize: 11, fontWeight: 600,
      title: d => `${d.lower}–${d.radius} m band\nMedian rating: ${d.label} / 5\nRated restaurants: ${d.n}`
    }),
    cell10Plot.text(cell10RingLabels.filter(d => d.median === null), {
      x: "x", y: "y", text: "label", fill: cell10MissingRatingColor,
      stroke: "white", strokeWidth: 3, paintOrder: "stroke", fontFamily: cell10Font, fontSize: 11, fontWeight: 600,
      title: d => `${d.lower}–${d.radius} m band\nNo rated restaurants`
    })
  ]
});

// Apply the shadow to each main-map circle individually, preserving point draw order.
cell10Map.querySelectorAll("circle").forEach(circle => {
  circle.style.filter = "drop-shadow(1px 1px 0.7px rgba(0,0,0,0.4))";
});

// Measure 500 projected metres in SVG pixels so the bar stays correct when resized.
const cell10ScaleStart = cell10Projection([648000, 6862000]);
const cell10ScaleEnd = cell10Projection([648500, 6862000]);
const cell10ScaleLength = Math.hypot(cell10ScaleEnd[0] - cell10ScaleStart[0],
  cell10ScaleEnd[1] - cell10ScaleStart[1]);
// Center the scale and its headings together, with room for the CRS text.
const cell10ScaleCenterX = Math.max(90, 18 + cell10ScaleLength / 2);
const cell10ScaleX = cell10ScaleCenterX - cell10ScaleLength / 2;
const cell10ScaleY = cell10MapHeight - 27;

// These decorations use SVG coordinates; their positions scale with the map.
cell10Map.append(cell10Htl.svg`<g pointer-events="none" font-family=${cell10Font} fill="#303940">
  <g aria-label="Scale bar, 0 to 500 metres">
    <text x=${cell10ScaleCenterX} y=${cell10ScaleY - 46} text-anchor="middle" font-size="10" font-weight="600">RGF93 / Lambert-93 · EPSG:2154</text>
    <text x=${cell10ScaleCenterX} y=${cell10ScaleY - 23} text-anchor="middle" font-size="10" font-weight="600">Scale 1:10,000</text>
    <text x=${cell10ScaleX} y=${cell10ScaleY - 8} font-size="10">0</text>
    <text x=${cell10ScaleX + cell10ScaleLength} y=${cell10ScaleY - 8} font-size="10" text-anchor="end">500 m</text>
    <rect x=${cell10ScaleX} y=${cell10ScaleY} width=${cell10ScaleLength / 2} height="5" fill="#303940" />
    <rect x=${cell10ScaleX + cell10ScaleLength / 2} y=${cell10ScaleY} width=${cell10ScaleLength / 2} height="5"
      fill="white" stroke="#303940" stroke-width="0.8" />
  </g>
</g>`);

const cell10Legend = cell10Plot.legend({
  color: {...cell10RatingScale, label: "TripAdvisor Mean Rating"},
  width: Math.min(cell10MapWidth - 80, 140), height: 46,
  marginLeft: 8, marginRight: 8, ticks: [1, 5], tickFormat: ".0f",
  style: {fontFamily: cell10Font}
});
// Keep legend text readable over the map without an opaque panel.
cell10Legend.querySelectorAll("text").forEach(text => {
  text.setAttribute("stroke", "white");
  text.setAttribute("stroke-width", "3");
  text.setAttribute("stroke-linejoin", "round");
  text.setAttribute("paint-order", "stroke");
});
// A dashed gradient echoes the ring outlines and shares the point rating scale.
const cell10MedianLegendWidth = Math.min(cell10MapWidth - 80, 140);
const cell10MedianLegendColor = cell10D3.scaleLinear().domain(cell10RatingScale.domain)
  .range(cell10RatingScale.range).interpolate(cell10D3.interpolateRgb).clamp(true);
const cell10MedianLegendSpan = cell10MedianLegendWidth - 16;
// Give each dash a literal color, avoiding SVG gradient references on a zero-height line.
const cell10MedianLegendStep = cell10RingDashLength + cell10RingDashGap;
const cell10MedianLegendDashes = Array.from({length: Math.ceil(cell10MedianLegendSpan / cell10MedianLegendStep)}, (_, i) => {
  const start = i * cell10MedianLegendStep;
  const end = Math.min(start + cell10RingDashLength, cell10MedianLegendSpan);
  const rating = 1 + 4 * (start + end) / (2 * cell10MedianLegendSpan);
  return {x1: 8 + start, x2: 8 + end, color: cell10MedianLegendColor(rating)};
});
const cell10MedianLegend = cell10Htl.svg`<svg width=${cell10MedianLegendWidth} height="34"
  viewBox=${`0 0 ${cell10MedianLegendWidth} 34`} role="img" aria-label="Band Median Rating, from 1 to 5">
  <g font-family=${cell10Font} font-size="9" fill="#27343c" stroke="white"
    stroke-width="2" stroke-linejoin="round" paint-order="stroke">
    <text x="8" y="9" font-weight="600">Distance Band Median Rating</text>
    <text x="8" y="31">1</text>
    <text x=${cell10MedianLegendWidth - 8} y="31" text-anchor="end">5</text>
  </g>
  ${cell10MedianLegendDashes.map(dash => cell10Htl.svg`<line x1=${dash.x1} x2=${dash.x2}
    y1="18" y2="18" stroke=${dash.color} stroke-width="2" stroke-opacity=${cell10RingOpacity} stroke-linecap="round" />`)}
</svg>`;

// Overview uses the full Paris point dataset from Cell 02 with a muted color scale.
// The actual AOI geometry, rather than an approximated square, is outlined in brown.
const cell10InsetRatingScale = {
  type: "linear", domain: [1, 5], range: ["#c2c2c2", "#666666"],
  interpolate: "rgb", clamp: true
};
const cell10InsetPoints = cell10Restaurants.features.flatMap(feature => {
  const xy = feature.geometry?.coordinates;
  if (feature.geometry?.type !== "Point" || !Array.isArray(xy) ||
      !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return [];
  const rating = feature.properties?.rating;
  return [{x: xy[0], y: xy[1],
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null}];
});
const cell10InsetWidth = Math.round(0.75 * Math.min(190, Math.max(70, Math.round(cell10MapWidth * 0.22))));
const cell10InsetAOIColor = "#bd8b63";
const cell10Inset = cell10Plot.plot({
  width: cell10InsetWidth,
  height: Math.round(cell10InsetWidth * 0.83),
  margin: 4,
  projection: {type: "reflect-y", domain: {type: "MultiPoint",
    coordinates: cell10InsetPoints.map(p => [p.x, p.y])}},
  color: cell10InsetRatingScale,
  style: {background: "transparent", fontFamily: cell10Font},
  marks: [
    cell10Plot.dot(cell10InsetPoints.filter(p => p.rating === null), {
      x: "x", y: "y", r: 0.85, fill: cell10MissingRatingColor, stroke: "none"
    }),
    cell10Plot.dot(cell10InsetPoints.filter(p => p.rating !== null).sort((a, b) => b.rating - a.rating), {
      x: "x", y: "y", r: 0.85, fill: "rating", stroke: "none"
    }),
    cell10Plot.geo(cell10AOI, {fill: "none", stroke: cell10InsetAOIColor, strokeWidth: 3})
  ]
});

// Self-contained version of Cell 07's unadjusted GAM and sensitivity fits.
const cell10GamRows = cell10Restaurants.features.map(f => ({...f.properties,
  rating: f.properties?.rating, distance: f.properties?.distance_from_eiffeltower_m
})).filter(d => Number.isFinite(d.rating) && Number.isFinite(d.distance) &&
  d.distance >= 0 && d.distance <= 1500);
if (cell10GamRows.length < 30) throw new Error("Too few ratings and distances for the GAM.");
const cell10GamMin = Math.min(...cell10GamRows.map(d => d.distance));
const cell10GamMax = Math.max(...cell10GamRows.map(d => d.distance));
function cell10GamSpec(k, min = cell10GamMin, max = cell10GamMax) {
  const degree = 3, interior = k - degree - 1;
  if (k < 4 || !(max > min)) throw new Error("Invalid spline specification.");
  return {k, min, max, knots: [...Array(4).fill(0),
    ...Array.from({length: interior}, (_, i) => (i + 1) / (interior + 1)), ...Array(4).fill(1)]};
}
function cell10GamBasis(distance, spec) {
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
function cell10GamPenalty(k, p) {
  const s = Array.from({length: p}, () => Array(p).fill(0));
  for (let i = 0; i < k - 2; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++)
    s[i + a][i + b] += [1, -2, 1][a] * [1, -2, 1][b];
  return s;
}
// Cholesky factorization solves the small positive-definite penalized system;
// fail explicitly on rank deficiency instead of quietly adding a ridge penalty.
function cell10GamCholesky(a) {
  const n = a.length, l = Array.from({length: n}, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let v = a[i][j];
    for (let k = 0; k < j; k++) v -= l[i][k] * l[j][k];
    if (i === j) { if (!(v > 1e-12)) throw new Error("Rank-deficient model matrix."); l[i][j] = Math.sqrt(v); }
    else l[i][j] = v / l[j][j];
  }
  return l;
}
function cell10GamSolve(l, b) {
  const n = b.length, y = Array(n), x = Array(n);
  for (let i = 0; i < n; i++) { let v = b[i]; for (let j = 0; j < i; j++) v -= l[i][j] * y[j]; y[i] = v / l[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let v = y[i]; for (let j = i + 1; j < n; j++) v -= l[j][i] * x[j]; x[i] = v / l[i][i]; }
  return x;
}
const cell10GamDot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cell10GamLambdas = Array.from({length: 29}, (_, i) => 10 ** (-4 + i * 0.25));
function cell10GamFit(rows, spec, controls = () => [], lambdas = cell10GamLambdas) {
  const x = rows.map(d => [...cell10GamBasis(d.distance, spec), ...controls(d)]), y = rows.map(d => d.rating);
  const n = x.length, p = x[0].length;
  if (n <= p) throw new Error("Not enough observations for the model.");
  const cross = Array.from({length: p}, () => Array(p).fill(0)), xy = Array(p).fill(0);
  let yy = 0;
  for (let r = 0; r < n; r++) { yy += y[r] ** 2; for (let i = 0; i < p; i++) {
    xy[i] += x[r][i] * y[r]; for (let j = 0; j <= i; j++) cross[i][j] += x[r][i] * x[r][j];
  }}
  for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) cross[j][i] = cross[i][j];
  const penalty = cell10GamPenalty(spec.k, p);
  let best = null;
  const smoothingScores = [];
  for (const lambda of lambdas) {
    let l; try { l = cell10GamCholesky(cross.map((row, i) => row.map((v, j) => v + lambda * penalty[i][j]))); } catch { continue; }
    const beta = cell10GamSolve(l, xy);
    let edf = 0;
    for (let j = 0; j < p; j++) edf += cell10GamSolve(l, cross.map(row => row[j]))[j];
    // Algebraic SSE avoids repeated passes over observations for each lambda.
    const sse = Math.max(0, yy - 2 * cell10GamDot(beta, xy) + cell10GamDot(beta, cross.map(row => cell10GamDot(row, beta))));
    const gcv = n * sse / (n - edf) ** 2;
    if (Number.isFinite(gcv)) smoothingScores.push({lambda, gcv});
    if (Number.isFinite(gcv) && (!best || gcv < best.gcv)) best = {beta, edf, sse, gcv, lambda};
  }
  if (!best) throw new Error("No numerically valid fit; inspect the model matrix.");
  const mean = y.reduce((a, b) => a + b, 0) / n, sst = y.reduce((a, b) => a + (b - mean) ** 2, 0);
  const predict = (distance, controlVector = Array(p - spec.k).fill(0)) => cell10GamDot([...cell10GamBasis(distance, spec), ...controlVector], best.beta);
  const fitted = x.map(row => cell10GamDot(row, best.beta));
  return {...best, n, spec, fitted, smoothingScores, residuals: y.map((v, i) => v - fitted[i]), predict,
    rmse: Math.sqrt(best.sse / n), residualSD: Math.sqrt(best.sse / (n - best.edf)), r2: sst > 0 ? 1 - best.sse / sst : null};
}

const cell10GamSpec10 = cell10GamSpec(10);
const cell10GamPrimary = cell10GamFit(cell10GamRows, cell10GamSpec10);
const cell10GamLeaveOneOut = cell10GamRows.filter(row => row.distance < 250).map(row => {
  const sample = cell10GamRows.filter(d => d !== row);
  return {fit: cell10GamFit(sample, cell10GamSpec10),
    min: Math.min(...sample.map(d => d.distance)), max: Math.max(...sample.map(d => d.distance))};
});
const cell10GamReviewSample = cell10GamRows.filter(row =>
  Number.isFinite(row.reviews_count_in_default_language) && row.reviews_count_in_default_language >= 5);
const cell10GamReviewFit = cell10GamReviewSample.length > 30
  ? cell10GamFit(cell10GamReviewSample, cell10GamSpec10) : null;
const cell10GamReviewMin = cell10GamReviewFit ? Math.min(...cell10GamReviewSample.map(d => d.distance)) : null;
const cell10GamReviewMax = cell10GamReviewFit ? Math.max(...cell10GamReviewSample.map(d => d.distance)) : null;
const cell10GamGrid = Array.from({length: 201}, (_, i) =>
  i === 200 ? cell10GamMax : cell10GamMin + (cell10GamMax - cell10GamMin) * i / 200);
const cell10GamCurve = (fit, min, max) => cell10GamGrid.filter(distance => distance >= min && distance <= max)
  .map(distance => ({distance, predicted: fit.predict(distance)}));

const cell10GamOriginalWidth = Math.min(290, Math.max(170, Math.round(cell10MapWidth * 0.35)), cell10MapWidth - 24);
const cell10GamWidth = Math.round(0.8 * Math.round(1.25 * Math.round(cell10GamOriginalWidth / 2)));
const cell10GamHeight = Math.round(0.75 * Math.round(1.25 * Math.round(1.5 * Math.round(Math.max(120, Math.round(cell10GamOriginalWidth * 0.58)) / 2))));
const cell10GamPlot = cell10Plot.plot({
  width: cell10GamWidth, height: cell10GamHeight,
  marginTop: 9, marginRight: 29, marginBottom: 21, marginLeft: 3,
  x: {domain: [0, 1500], ticks: [0, 500, 1000, 1500], label: "Distance (m)", tickSize: 0},
  y: {domain: [1, 5], axis: "right", ticks: [1, 2, 3, 4, 5], label: null, tickSize: 0},
  color: cell10RatingScale,
  style: {background: "transparent", color: "#303940", fontFamily: cell10Font, fontSize: "8.75px"},
  marks: [
    // The zero-distance guide follows the editable Eiffel Tower basemap color.
    cell10Plot.ruleX([0], {
      stroke: cell10BasemapColors["Tour Eiffel"], strokeWidth: 1.2,
      strokeDasharray: "1,3", strokeLinecap: "round"
    }),
    cell10Plot.ruleX(cell10Bands.filter(b => b.median !== null), {
      x: "radius", stroke: "median", strokeWidth: 1,
      strokeDasharray: `${cell10RingDashLength},${cell10RingDashGap}`,
      strokeOpacity: cell10RingOpacity, clip: true
    }),
    cell10Plot.ruleX(cell10Bands.filter(b => b.median === null), {
      x: "radius", stroke: cell10MissingRatingColor, strokeWidth: 1,
      strokeDasharray: `${cell10RingDashLength},${cell10RingDashGap}`,
      strokeOpacity: cell10RingOpacity, clip: true
    }),
    ...cell10GamLeaveOneOut.map(({fit, min, max}) =>
      cell10Plot.line(cell10GamCurve(fit, min, max), {
        x: "distance", y: "predicted", stroke: "#d4c4ed", strokeOpacity: 0.9, strokeWidth: 1.4, clip: true
      })),
    ...(cell10GamReviewFit ? [cell10Plot.line(cell10GamCurve(cell10GamReviewFit, cell10GamReviewMin, cell10GamReviewMax), {
      x: "distance", y: "predicted", stroke: "#c29cdb", strokeWidth: 2, strokeDasharray: "4,3", clip: true
    })] : []),
    cell10Plot.line(cell10GamCurve(cell10GamPrimary, cell10GamMin, cell10GamMax), {
      x: "distance", y: "predicted", stroke: "#aa91d0", strokeWidth: 2.5, clip: true
    })
  ]
});
const cell10GamAxisX = cell10GamWidth - 3;
const cell10GamAxisY = 9 + (cell10GamHeight - 9 - 21) / 2;
cell10GamPlot.append(cell10Htl.svg`<text x=${cell10GamAxisX} y=${cell10GamAxisY}
  transform=${`rotate(-90 ${cell10GamAxisX} ${cell10GamAxisY})`}
  text-anchor="middle" font-family=${cell10Font} font-size="8.75" fill="#303940">Predicted rating</text>`);
cell10GamPlot.querySelectorAll("text").forEach(text => {
  text.setAttribute("stroke", "white");
  text.setAttribute("stroke-width", "2");
  text.setAttribute("stroke-linejoin", "round");
  text.setAttribute("paint-order", "stroke");
});

// Native SVG title tooltips use browser-controlled fonts. Convert them into one
// styled popup while keeping the same text as accessible labels on the marks.
const cell10PopupText = new WeakMap();
cell10Map.querySelectorAll("title").forEach(title => {
  const mark = title.parentNode;
  if (mark === cell10Map) return;
  cell10PopupText.set(mark, title.textContent);
  mark.setAttribute("aria-label", title.textContent);
  title.remove();
});
const cell10Popup = cell10Htl.html`<div role="tooltip" style=${{
  display: "none", position: "absolute", pointerEvents: "none", zIndex: 2,
  fontFamily: cell10Font, fontSize: "13px", lineHeight: "1.35", whiteSpace: "pre-line",
  color: "#26313a", background: "rgba(255,255,255,0.96)",
  border: "1px solid #d9d6d0", borderRadius: "3px", padding: "6px 8px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.12)", maxWidth: "220px"
}}></div>`;
const cell10MapContainer = cell10Htl.html`<div style="position: relative; width: 100%">
  ${cell10Map}
  <div style=${{
    position: "absolute", left: "12px", top: "12px", width: "260px", maxWidth: `calc(100% - ${cell10InsetWidth + 44}px)`,
    padding: "8px", pointerEvents: "none", fontFamily: cell10Font,
    textShadow: "0 0 2px white, 0 0 4px white, 1px 1px 3px white, -1px -1px 3px white"
  }}>
    <h2 style="margin: 0 0 3px; font-size: 18px; line-height: 1.1; font-weight: 700; color: #18242b">${cell10Title}</h2>
    <div style="margin-bottom: 4px; font-size: 12px; line-height: 1.25; font-weight: 600; color: #27343c">${cell10Subtitle}</div>
    ${cell10Legend}
    ${cell10MedianLegend}
    <div style="font-size: 11px; font-weight: 600; color: #27343c">Ring increments: 250 m</div>
  </div>
  <div aria-label="Paris restaurant overview; brown outline marks the main map area" style=${{
    position: "absolute", right: "12px", top: "12px", width: `${cell10InsetWidth}px`,
    pointerEvents: "none", fontFamily: cell10Font, textAlign: "center",
    color: "#27343c", textShadow: "0 0 3px white, 0 0 5px white"
  }}>
    <div style="font-size: 12px; font-weight: 700">Paris <span style=${{color: cell10InsetAOIColor}}>AOI</span></div>
    ${cell10Inset}
  </div>
  <div aria-label="GAM predicted restaurant rating versus distance, with sensitivity curves" style=${{
    position: "absolute", right: "12px", bottom: "12px", width: `${cell10GamWidth}px`,
    pointerEvents: "none", fontFamily: cell10Font, color: "#27343c",
    textShadow: "0 0 3px white, 0 0 5px white"
  }}>
    ${cell10GamPlot}
    <div style="font-size: 9px; font-weight: 700; text-align: center">GAM sensitivity fits</div>
  </div>
  ${cell10Popup}
</div>`;
cell10Map.addEventListener("pointermove", event => {
  let target = event.target;
  while (target && target !== cell10Map && !cell10PopupText.has(target)) target = target.parentNode;
  const value = target && cell10PopupText.get(target);
  if (!value) { cell10Popup.style.display = "none"; return; }
  cell10Popup.textContent = value;
  cell10Popup.style.display = "block";
  const bounds = cell10MapContainer.getBoundingClientRect();
  const x = event.clientX - bounds.left + 12;
  const y = event.clientY - bounds.top + 12;
  cell10Popup.style.left = `${Math.max(0, Math.min(x, bounds.width - cell10Popup.offsetWidth))}px`;
  cell10Popup.style.top = `${Math.max(0, Math.min(y, bounds.height - cell10Popup.offsetHeight))}px`;
});
cell10Map.addEventListener("pointerleave", () => { cell10Popup.style.display = "none"; });

display(cell10Htl.html`<figure style=${{margin: 0, maxWidth: `${cell10MapWidth}px`, fontFamily: cell10Font}}>
  ${cell10MapContainer}
  <figcaption style="margin: 4px 8px; font-size: 12px; color: #505860">
    <div style="margin-bottom: 4px">Dashed circles and labels show the median rating in each 250 m band. Gray indicates no rating.</div>
    ${cell10Bands.map(b => `${b.lower}–${b.radius} m: ${b.median === null ? "no ratings" : `median ${b.median.toFixed(3)} (n=${b.n})`}`).join(" · ")}
    <div style="margin-top: 4px">GAM inset: lavender = primary fit; pale lavender = omit one restaurant within 250 m; dashed lavender = at least five reviews in the default language. Curves show fitted mean ratings within each sample's observed distances; sensitivity curves are not confidence intervals.</div>
    <div style="margin-top: 4px">Scale 1:10,000 when the 500 m bar measures 5 cm on the printed or displayed map.</div>
  </figcaption>
</figure>`);
