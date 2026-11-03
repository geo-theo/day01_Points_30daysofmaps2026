// CELL 12 — Cutpoint map. Paste this entire file into one Observable JavaScript or TypeScript cell.
// Attach restaurants_paris.geojson, basemap_paris_AOI.geojson, AOI.geojson,
// and eiffel_buffers.geojson before running. All four use EPSG:2154.
import * as cell12Plot from "npm:@observablehq/plot";
import * as cell12Htl from "npm:htl";
import * as cell12D3 from "npm:d3";

// EDIT THE TITLE AND SUBTITLE HERE.
const cell12Title = "The Eiffel-proximate Tourist Trap Effect";
const cell12Subtitle = "Restaurant ratings around the Eiffel Tower";
const cell12DefaultCutpoint = 438; // Rounded representative optimum, in metres.
let cell12Cutpoint = cell12DefaultCutpoint;
const cell12RawDifferenceRadius = 318.98456369528907; // Cell 11's greatest raw difference, in metres.
// Didot is used when available; the remaining fonts are local fallbacks.
const cell12Font = 'Didot, "Bodoni MT", Georgia, serif';

// EDIT THESE COLORS: keys match the basemap's source attribute exactly.
const cell12BasemapColors = {
  "Parcs": "#F0F4F2",
  "La Seine": "#F6F8FA",
  "Tour Eiffel": "#563B22",
  "batiments": "#F5F5F5"
};
// Blend the tower color toward white for the secondary, lighter radius.
const cell12RawRadiusColor = cell12D3.interpolateRgb(cell12BasemapColors["Tour Eiffel"], "white")(0.45);
const cell12Background = "#ffffff";
const cell12UnknownSourceColor = "#eeeeee";
const cell12MissingRatingColor = "#929292";
const cell12VignetteStartMeters = 1500; // Fade starts at the outer buffer.
const cell12VignetteStrength = 1; // White opacity at the farthest map corner, from 0 to 1.
const cell12RingDashLength = 1;
const cell12RingDashGap = 5;
const cell12RingOpacity = 0.67; // 33% transparent.
// Restaurant points use this 1–5 rating scale.
const cell12RatingScale = {
  type: "linear",
  domain: [1, 1.5, 2.5, 3.5, 4.5, 5],
  range: ["#a50026", "#a50026", "#f6a09a", "#a6cee3", "#08306b", "#08306b"],
  interpolate: "rgb",
  clamp: true,
  label: "Restaurant rating"
};

const [cell12Restaurants, cell12Basemap, cell12AOI, cell12Buffers] = await Promise.all([
  FileAttachment("restaurants_paris.geojson").json(),
  FileAttachment("basemap_paris_AOI.geojson").json(),
  FileAttachment("AOI.geojson").json(),
  FileAttachment("eiffel_buffers.geojson").json()
]);
for (const [name, data] of Object.entries({
  restaurants: cell12Restaurants, basemap: cell12Basemap,
  AOI: cell12AOI, buffers: cell12Buffers
})) {
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features))
    throw new Error(`${name} must be a GeoJSON FeatureCollection.`);
}

// Points use the precomputed Lambert-93 distance from the Eiffel Tower.
const cell12Points = cell12Restaurants.features.flatMap(feature => {
  const p = feature.properties ?? {};
  const xy = feature.geometry?.coordinates;
  const distance = p.distance_from_eiffeltower_m;
  if (feature.geometry?.type !== "Point" || !Array.isArray(xy) ||
      !Number.isFinite(xy[0]) || !Number.isFinite(xy[1]) ||
      !Number.isFinite(distance) || distance < 0 || distance > 1500) return [];
  const rating = Number.isFinite(p.rating) && p.rating >= 1 && p.rating <= 5 ? p.rating : null;
  return [{x: xy[0], y: xy[1], distance, rating, name: p.restaurant_name || "Unnamed restaurant"}];
});

// The supplied buffers give the same Lambert-93 Eiffel Tower center used by the
// precomputed restaurant distances. Construct a circle at the requested 438 m.
const cell12CenterRing = cell12Buffers.features[0]?.geometry?.coordinates?.[0]?.[0];
if (!Array.isArray(cell12CenterRing) || !cell12CenterRing.length)
  throw new Error("The supplied buffers must contain a valid MultiPolygon ring.");
const cell12Center = [
  (Math.min(...cell12CenterRing.map(p => p[0])) + Math.max(...cell12CenterRing.map(p => p[0]))) / 2,
  (Math.min(...cell12CenterRing.map(p => p[1])) + Math.max(...cell12CenterRing.map(p => p[1]))) / 2
];
const cell12Groups = [
  {group: "Inside", min: 0, max: cell12Cutpoint,
   points: cell12Points.filter(p => p.rating !== null && p.distance <= cell12Cutpoint)},
  {group: "Outside", min: cell12Cutpoint, max: 1500,
   points: cell12Points.filter(p => p.rating !== null && p.distance > cell12Cutpoint)}
].map(({points, ...group}) => ({...group, n: points.length,
  mean: points.length ? cell12D3.mean(points, d => d.rating) : null,
  median: points.length ? cell12D3.median(points, d => d.rating) : null}));
let cell12RatingDifference = cell12Groups.every(g => g.mean !== null)
  ? cell12Groups[1].mean - cell12Groups[0].mean : null;
// GRD summaries use the GRD radius itself, independently of the MSC groups.
const cell12RawGroups = [
  {group: "Inside", kind: "GRD", points: cell12Points.filter(p => p.rating !== null && p.distance <= cell12RawDifferenceRadius)},
  {group: "Outside", kind: "GRD", points: cell12Points.filter(p => p.rating !== null && p.distance > cell12RawDifferenceRadius)}
].map(({points, ...group}) => ({...group, n: points.length,
  mean: points.length ? cell12D3.mean(points, d => d.rating) : null,
  median: points.length ? cell12D3.median(points, d => d.rating) : null}));
const cell12RawRatingDifference = cell12RawGroups.every(g => g.mean !== null)
  ? cell12RawGroups[1].mean - cell12RawGroups[0].mean : null;
const cell12RadiusCircle = radius => ({type: "Feature", properties: {}, geometry: {type: "Polygon", coordinates: [
  Array.from({length: 257}, (_, i) => {
    const angle = 2 * Math.PI * i / 256;
    return [cell12Center[0] + radius * Math.cos(angle),
      cell12Center[1] + radius * Math.sin(angle)];
  })
]}});
const cell12Circle = cell12RadiusCircle(cell12Cutpoint);
const cell12RawCircle = cell12RadiusCircle(cell12RawDifferenceRadius);
// Place both labels at the same southeast point on the MSC circle.
const cell12RingLabels = cell12Groups.map((group, i) => {
  const angle = -Math.PI / 4;
  return {...group, x: cell12Center[0] + cell12Cutpoint * Math.cos(angle),
    y: cell12Center[1] + cell12Cutpoint * Math.sin(angle),
    label: (i === 0 ? "iMSCavg: " : "eMSCavg: ") + (group.mean === null ? "—" : group.mean.toFixed(2))};
});
// Stack the GRD labels on the southwest section, over the river.
const cell12RawRingLabels = cell12RawGroups.map((group, i) => {
  const angle = -3 * Math.PI / 4;
  return {...group, x: cell12Center[0] + cell12RawDifferenceRadius * Math.cos(angle),
    y: cell12Center[1] + cell12RawDifferenceRadius * Math.sin(angle),
    label: (i === 0 ? "iGRDavg: " : "eGRDavg: ") + (group.mean === null ? "—" : group.mean.toFixed(2))};
});
const cell12MapWidth = Math.max(240, Math.min(width, 1100));
const cell12MapHeight = Math.round(cell12MapWidth * 0.86);
// Fit an explicit planar projection to the AOI, with north up and an 8 px margin.
// Reuse this exact projection for the scale bar below.
const cell12Projection = cell12D3.geoIdentity().reflectY(true)
  .fitExtent([[8, 8], [cell12MapWidth - 8, cell12MapHeight - 8]], cell12AOI);
// Keep references to the changing marks so the slider only updates a circle
// and two text elements, instead of redrawing thousands of restaurant points.
const cell12CirclePath = cell12D3.geoPath(cell12Projection);
const cell12MscCircleMark = cell12Htl.svg`<g><path d=${cell12CirclePath(cell12Circle)}
  fill="none" stroke=${cell12BasemapColors["Tour Eiffel"]} stroke-width="2.5"
  stroke-dasharray=${`${cell12RingDashLength},${cell12RingDashGap}`}
  stroke-opacity=${cell12RingOpacity} stroke-linecap="round"><title>__cell12_cutpoint_both__</title></path></g>`;
const cell12MscLabelMarks = cell12RingLabels.map((label, i) => {
  const [x, y] = cell12Projection([label.x, label.y]);
  return cell12Htl.svg`<g><text x=${x} y=${y + (i === 0 ? -7 : 7)} text-anchor="middle"
    dominant-baseline="central" fill=${cell12BasemapColors["Tour Eiffel"]} stroke="white"
    stroke-width="4" paint-order="stroke" font-family=${cell12Font} font-size="9" font-weight="700"><title>${`__cell12_cutpoint_${label.group.toLowerCase()}__`}</title>${label.label}</text></g>`;
});
// Center the fade on the tower and size it in projected map pixels.
const [cell12VignetteX, cell12VignetteY] = cell12Projection(cell12Center);
const cell12FadeStartPoint = cell12Projection([cell12Center[0] + cell12VignetteStartMeters, cell12Center[1]]);
const cell12FadeStart = Math.hypot(cell12FadeStartPoint[0] - cell12VignetteX, cell12FadeStartPoint[1] - cell12VignetteY);
const cell12FadeRadius = Math.max(...[[0, 0], [cell12MapWidth, 0], [0, cell12MapHeight], [cell12MapWidth, cell12MapHeight]]
  .map(([x, y]) => Math.hypot(x - cell12VignetteX, y - cell12VignetteY)));
const cell12FadeOffset = Math.min(100, 100 * cell12FadeStart / cell12FadeRadius);
const cell12FadeId = `cell12-fade-${Math.random().toString(36).slice(2)}`;
// Draw buildings first and the tower last, regardless of feature order in the file.
const cell12Sources = [...new Set(cell12Basemap.features.map(f => f.properties?.source))];
const cell12SourceOrder = ["batiments", ...cell12Sources.filter(source =>
  !["batiments", "Parcs", "La Seine", "Tour Eiffel"].includes(source)),
  "Parcs", "La Seine", "Tour Eiffel"].filter(source => cell12Sources.includes(source));
const cell12Map = cell12Plot.plot({
  width: cell12MapWidth,
  height: cell12MapHeight,
  margin: 8,
  projection: cell12Projection,
  color: cell12RatingScale,
  style: {background: cell12Background, color: "#1f2933", fontFamily: cell12Font},
  marks: [
    // Separate marks make every source color a literal, independent of the rating scale.
    ...cell12SourceOrder.map(source =>
      cell12Plot.geo(cell12Basemap.features.filter(f => f.properties?.source === source), {
        fill: cell12BasemapColors[source] ?? cell12UnknownSourceColor, stroke: "none"
      })),
    // The fade is above the basemap but below all circles, points, and labels.
    () => cell12Htl.svg`<g pointer-events="none">
      <defs><radialGradient id=${cell12FadeId} gradientUnits="userSpaceOnUse"
        cx=${cell12VignetteX} cy=${cell12VignetteY} r=${cell12FadeRadius}>
        <stop offset="0%" stop-color="white" stop-opacity="0" />
        <stop offset=${`${cell12FadeOffset}%`} stop-color="white" stop-opacity="0" />
        <stop offset=${`${cell12FadeOffset + (100 - cell12FadeOffset) * 0.15}%`}
          stop-color="white" stop-opacity=${cell12VignetteStrength * 0.72} />
        <stop offset=${`${cell12FadeOffset + (100 - cell12FadeOffset) * 0.45}%`}
          stop-color="white" stop-opacity=${cell12VignetteStrength * 0.96} />
        <stop offset="100%" stop-color="white" stop-opacity=${cell12VignetteStrength} />
      </radialGradient></defs>
      <rect x="0" y="0" width=${cell12MapWidth} height=${cell12MapHeight} fill=${`url(#${cell12FadeId})`} />
    </g>`,
    () => cell12MscCircleMark,
    cell12Plot.geo(cell12RawCircle, {
      fill: "none", stroke: cell12RawRadiusColor, strokeWidth: 2.5,
      strokeDasharray: `${cell12RingDashLength},${cell12RingDashGap}`,
      strokeOpacity: cell12RingOpacity, strokeLinecap: "round",
      title: () => "__cell12_grd_both__"
    }),
    cell12Plot.dot(cell12Points.filter(p => p.rating === null), {
      x: "x", y: "y", r: 3 * 96 / 72, fill: cell12MissingRatingColor, stroke: "white", strokeWidth: 0.7,
      title: p => `${p.name}\nNo rating\nDistance: ${Math.round(p.distance)} m`
    }),
    // SVG paints later points on top: draw high-rated blue before low-rated red.
    cell12Plot.dot(cell12Points.filter(p => p.rating !== null).sort((a, b) => b.rating - a.rating), {
      x: "x", y: "y", r: 3 * 96 / 72, fill: "rating", stroke: "white", strokeWidth: 0.7,
      title: p => `${p.name}\nRating: ${p.rating.toFixed(2)} / 5\nDistance: ${Math.round(p.distance)} m`
    }),
    // Both labels match the MSC circle and follow the tower color setting.
    ...cell12MscLabelMarks.map(mark => () => mark),
    ...cell12RawRingLabels.map((label, i) => cell12Plot.text([label], {
      x: "x", y: "y", dy: i === 0 ? -7 : 7, text: "label",
      fill: cell12RawRadiusColor, stroke: "white", strokeWidth: 4,
      paintOrder: "stroke", fontFamily: cell12Font, fontSize: 9, fontWeight: 700,
      title: d => `__cell12_grd_${d.group.toLowerCase()}__`
    }))

  ]
});

// Apply the shadow to each main-map circle individually, preserving point draw order.
cell12Map.querySelectorAll("circle").forEach(circle => {
  circle.style.filter = "drop-shadow(1px 1px 0.7px rgba(0,0,0,0.4))";
});

// Measure 500 projected metres in SVG pixels so the bar stays correct when resized.
const cell12ScaleStart = cell12Projection([648000, 6862000]);
const cell12ScaleEnd = cell12Projection([648500, 6862000]);
const cell12ScaleLength = Math.hypot(cell12ScaleEnd[0] - cell12ScaleStart[0],
  cell12ScaleEnd[1] - cell12ScaleStart[1]);
// Center the scale and its headings together, with room for the CRS text.
const cell12ScaleCenterX = Math.max(90, 18 + cell12ScaleLength / 2);
const cell12ScaleX = cell12ScaleCenterX - cell12ScaleLength / 2;
const cell12ScaleY = cell12MapHeight - 27;

// These decorations use SVG coordinates; their positions scale with the map.
cell12Map.append(cell12Htl.svg`<g pointer-events="none" font-family=${cell12Font} fill="#303940">
  <g aria-label="Scale bar, 0 to 500 metres">
    <text x=${cell12ScaleCenterX} y=${cell12ScaleY - 46} text-anchor="middle" font-size="10" font-weight="600">RGF93 / Lambert-93 · EPSG:2154</text>
    <text x=${cell12ScaleCenterX} y=${cell12ScaleY - 23} text-anchor="middle" font-size="10" font-weight="600">Scale 1:10,000</text>
    <text x=${cell12ScaleX} y=${cell12ScaleY - 8} font-size="10">0</text>
    <text x=${cell12ScaleX + cell12ScaleLength} y=${cell12ScaleY - 8} font-size="10" text-anchor="end">500 m</text>
    <rect x=${cell12ScaleX} y=${cell12ScaleY} width=${cell12ScaleLength / 2} height="5" fill="#303940" />
    <rect x=${cell12ScaleX + cell12ScaleLength / 2} y=${cell12ScaleY} width=${cell12ScaleLength / 2} height="5"
      fill="white" stroke="#303940" stroke-width="0.8" />
  </g>
</g>`);

const cell12Legend = cell12Plot.legend({
  color: {...cell12RatingScale, label: "TripAdvisor Mean Rating"},
  width: Math.min(cell12MapWidth - 80, 140), height: 46,
  marginLeft: 8, marginRight: 8, ticks: [1, 5], tickFormat: ".0f",
  style: {fontFamily: cell12Font}
});
// Keep legend text readable over the map without an opaque panel.
cell12Legend.querySelectorAll("text").forEach(text => {
  text.setAttribute("stroke", "white");
  text.setAttribute("stroke-width", "3");
  text.setAttribute("stroke-linejoin", "round");
  text.setAttribute("paint-order", "stroke");
});

// Overview uses the full Paris point dataset from Cell 02 with a muted color scale.
// The actual AOI geometry, rather than an approximated square, is outlined in brown.
const cell12InsetRatingScale = {
  type: "linear", domain: [1, 5], range: ["#c2c2c2", "#666666"],
  interpolate: "rgb", clamp: true
};
const cell12InsetPoints = cell12Restaurants.features.flatMap(feature => {
  const xy = feature.geometry?.coordinates;
  if (feature.geometry?.type !== "Point" || !Array.isArray(xy) ||
      !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return [];
  const rating = feature.properties?.rating;
  return [{x: xy[0], y: xy[1],
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null}];
});
const cell12InsetWidth = Math.round(0.75 * Math.min(190, Math.max(70, Math.round(cell12MapWidth * 0.22))));
const cell12InsetAOIColor = "#bd8b63";
const cell12Inset = cell12Plot.plot({
  width: cell12InsetWidth,
  height: Math.round(cell12InsetWidth * 0.83),
  margin: 4,
  projection: {type: "reflect-y", domain: {type: "MultiPoint",
    coordinates: cell12InsetPoints.map(p => [p.x, p.y])}},
  color: cell12InsetRatingScale,
  style: {background: "transparent", fontFamily: cell12Font},
  marks: [
    cell12Plot.dot(cell12InsetPoints.filter(p => p.rating === null), {
      x: "x", y: "y", r: 0.85, fill: cell12MissingRatingColor, stroke: "none"
    }),
    cell12Plot.dot(cell12InsetPoints.filter(p => p.rating !== null).sort((a, b) => b.rating - a.rating), {
      x: "x", y: "y", r: 0.85, fill: "rating", stroke: "none"
    }),
    cell12Plot.geo(cell12AOI, {fill: "none", stroke: cell12InsetAOIColor, strokeWidth: 3})
  ]
});

// Observed cumulative mean difference at each eligible distance threshold,
// matching Cell 11's valid-rating sample and primary minimum group size.
// This is the observed curve, not a bootstrap confidence band.
const cell12CurveMinimum = 20;
const cell12CurveData = cell12Restaurants.features.map(f => ({
  rating: f.properties?.rating, distance: f.properties?.distance_from_eiffeltower_m
})).filter(d => Number.isFinite(d.rating) && d.rating >= 1 && d.rating <= 5 &&
  Number.isFinite(d.distance) && d.distance >= 0 && d.distance <= 1500)
  .sort((a, b) => a.distance - b.distance);
const cell12CurveTotal = cell12CurveData.reduce((sum, d) => sum + d.rating, 0);
const cell12DifferenceCurve = [];
let cell12CurveInsideSum = 0;
for (let i = 1; i < cell12CurveData.length; i++) {
  cell12CurveInsideSum += cell12CurveData[i - 1].rating;
  const outside = cell12CurveData.length - i;
  if (i < cell12CurveMinimum || outside < cell12CurveMinimum ||
      cell12CurveData[i - 1].distance === cell12CurveData[i].distance) continue;
  cell12DifferenceCurve.push({
    radius: cell12CurveData[i - 1].distance + (cell12CurveData[i].distance - cell12CurveData[i - 1].distance) / 2,
    difference: (cell12CurveTotal - cell12CurveInsideSum) / outside - cell12CurveInsideSum / i
  });
}
if (!cell12DifferenceCurve.length) throw new Error("No eligible cutpoints for the inset curve.");

// Reproduce Cell 09's one-sided simultaneous permutation envelope on its
// 25 m grid. This is a different scan/statistic from Cell 11's Welch test.
// Keep one common shuffled rating arrangement across all grid points.
const cell12EnvelopePermutations = 9999;
const cell12EnvelopeSeed = 20261102;
function cell12EnvelopeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const cell12EnvelopeThresholds = [];
let cell12EnvelopeInside = 0;
for (let radius = 0; radius <= 1500; radius += 25) {
  while (cell12EnvelopeInside < cell12CurveData.length && cell12CurveData[cell12EnvelopeInside].distance <= radius)
    cell12EnvelopeInside++;
  if (cell12EnvelopeInside >= cell12CurveMinimum && cell12CurveData.length - cell12EnvelopeInside >= cell12CurveMinimum)
    cell12EnvelopeThresholds.push({radius, n_inside: cell12EnvelopeInside});
}
if (!cell12EnvelopeThresholds.length) throw new Error("No eligible 25 m thresholds for the permutation envelope.");
const cell12EnvelopeN = cell12CurveData.length, cell12EnvelopeK = cell12EnvelopeThresholds.length;
const cell12EnvelopeRatings = cell12CurveData.map(d => d.rating);
const cell12EnvelopeCurves = new Float64Array(cell12EnvelopePermutations * cell12EnvelopeK);
const cell12EnvelopeMeans = new Float64Array(cell12EnvelopeK);
const cell12EnvelopeM2 = new Float64Array(cell12EnvelopeK);
const cell12EnvelopeRng = cell12EnvelopeRandom(cell12EnvelopeSeed);
for (let b = 0; b < cell12EnvelopePermutations; b++) {
  for (let i = cell12EnvelopeN - 1; i > 0; i--) {
    const j = Math.floor(cell12EnvelopeRng() * (i + 1));
    [cell12EnvelopeRatings[i], cell12EnvelopeRatings[j]] = [cell12EnvelopeRatings[j], cell12EnvelopeRatings[i]];
  }
  let sum = 0, index = 0;
  for (let j = 0; j < cell12EnvelopeK; j++) {
    const count = cell12EnvelopeThresholds[j].n_inside;
    while (index < count) sum += cell12EnvelopeRatings[index++];
    const value = (cell12CurveTotal - sum) / (cell12EnvelopeN - count) - sum / count;
    cell12EnvelopeCurves[b * cell12EnvelopeK + j] = value;
    const delta = value - cell12EnvelopeMeans[j];
    cell12EnvelopeMeans[j] += delta / (b + 1);
    cell12EnvelopeM2[j] += delta * (value - cell12EnvelopeMeans[j]);
  }
}
const cell12EnvelopeSD = Array.from(cell12EnvelopeM2, value =>
  Math.sqrt(Math.max(0, value / (cell12EnvelopePermutations - 1))));
const cell12EnvelopeMaxima = new Float64Array(cell12EnvelopePermutations);
for (let b = 0; b < cell12EnvelopePermutations; b++) {
  let max = -Infinity;
  for (let j = 0; j < cell12EnvelopeK; j++) {
    const z = cell12EnvelopeSD[j] <= 1e-12 ? 0 :
      (cell12EnvelopeCurves[b * cell12EnvelopeK + j] - cell12EnvelopeMeans[j]) / cell12EnvelopeSD[j];
    if (z > max) max = z;
  }
  cell12EnvelopeMaxima[b] = max;
}
const cell12EnvelopeRank = Math.ceil((cell12EnvelopePermutations + 1) * 0.95) - 1;
const cell12EnvelopeCritical = Array.from(cell12EnvelopeMaxima).sort((a, b) => a - b)[cell12EnvelopeRank];
const cell12EnvelopeRows = cell12EnvelopeThresholds.map((d, j) => ({...d,
  upper: cell12EnvelopeMeans[j] + cell12EnvelopeCritical * cell12EnvelopeSD[j]}));

// Retain the original inset height and use 75% of its full width.
const cell12InsetOriginalWidth = Math.min(290, Math.max(170, Math.round(cell12MapWidth * 0.35)), cell12MapWidth - 24);
const cell12CurvePriorWidth = Math.round(1.25 * Math.round(cell12InsetOriginalWidth / 2));
const cell12CurveWidth = Math.round(0.75 * cell12CurvePriorWidth);
const cell12CurveHeight = Math.round(0.75 * Math.round(1.25 * Math.round(1.5 * Math.round(Math.max(120, Math.round(cell12InsetOriginalWidth * 0.58)) / 2))));
// Start with the prior symmetric-log layout, then compress its 0–300 m
// portion to half its former width. The remaining range fills the space.
const cell12SliderMin = 100;
const cell12SliderMax = 1500;
const cell12CurveSymlogConstant = 400;
const cell12CurveBreak = 300;
const cell12CurveLogSpan = Math.log1p(1500 / cell12CurveSymlogConstant);
const cell12CurveOldPosition = distance => Math.log1p(distance / cell12CurveSymlogConstant) / cell12CurveLogSpan;
const cell12CurveOldBreak = cell12CurveOldPosition(cell12CurveBreak);
const cell12CurveNewBreak = cell12CurveOldBreak / 2;
const cell12CurvePosition = distance => {
  const old = cell12CurveOldPosition(distance);
  return old <= cell12CurveOldBreak ? old / 2 : cell12CurveNewBreak +
    (old - cell12CurveOldBreak) * (1 - cell12CurveNewBreak) / (1 - cell12CurveOldBreak);
};
const cell12CurveDistance = position => {
  const old = position <= cell12CurveNewBreak ? 2 * position : cell12CurveOldBreak +
    (position - cell12CurveNewBreak) * (1 - cell12CurveOldBreak) / (1 - cell12CurveNewBreak);
  return cell12CurveSymlogConstant * Math.expm1(old * cell12CurveLogSpan);
};
// Intersect the two plotted polylines in transformed x coordinates. The gold
// fill is a visual interpolation; Cell 09's inference applies at its 25 m
// scan radii, not automatically at every point between them.
const cell12EnvelopeLine = cell12EnvelopeRows.map(d => ({x: cell12CurvePosition(d.radius), y: d.upper}));
const cell12ObservedLine = cell12DifferenceCurve.map(d => ({x: cell12CurvePosition(d.radius), y: d.difference}));
function cell12InterpolateLine(line, x) {
  if (line.length === 1) return line[0].y;
  let lo = 0, hi = line.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (line[mid].x <= x) lo = mid; else hi = mid; }
  const a = line[lo], b = line[hi];
  return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
}
const cell12FillMin = Math.max(cell12EnvelopeLine[0].x, cell12ObservedLine[0].x);
const cell12FillMax = Math.min(cell12EnvelopeLine.at(-1).x, cell12ObservedLine.at(-1).x);
const cell12FillKnots = (cell12FillMin < cell12FillMax ? [...new Set([cell12FillMin, cell12FillMax,
  ...cell12EnvelopeLine.map(d => d.x), ...cell12ObservedLine.map(d => d.x)])]
  .filter(x => x >= cell12FillMin && x <= cell12FillMax).sort((a, b) => a - b) : [])
  .map(x => ({x, upper: cell12InterpolateLine(cell12EnvelopeLine, x), observed: cell12InterpolateLine(cell12ObservedLine, x)}));
const cell12EnvelopeFill = [];
const cell12EnvelopeCrossings = [];
let cell12FillSegment = 0;
for (let i = 1; i < cell12FillKnots.length; i++) {
  const a = cell12FillKnots[i - 1], b = cell12FillKnots[i];
  const da = a.observed - a.upper, db = b.observed - b.upper;
  if (da === 0 && (cell12EnvelopeCrossings.length === 0 || cell12EnvelopeCrossings.at(-1).x !== a.x))
    cell12EnvelopeCrossings.push({x: a.x, y: a.upper});
  if (da * db < 0) {
    const fraction = da / (da - db);
    cell12EnvelopeCrossings.push({x: a.x + fraction * (b.x - a.x),
      y: a.upper + fraction * (b.upper - a.upper)});
  }
  if (i === cell12FillKnots.length - 1 && db === 0 &&
      (cell12EnvelopeCrossings.length === 0 || cell12EnvelopeCrossings.at(-1).x !== b.x))
    cell12EnvelopeCrossings.push({x: b.x, y: b.upper});
  if (da <= 0 && db <= 0) continue;
  let start = a, end = b;
  if (da * db < 0) {
    const fraction = da / (da - db), x = a.x + fraction * (b.x - a.x);
    const y = a.upper + fraction * (b.upper - a.upper);
    const crossing = {x, upper: y, observed: y};
    if (da < 0) start = crossing; else end = crossing;
  }
  cell12EnvelopeFill.push({...start, segment: cell12FillSegment}, {...end, segment: cell12FillSegment});
  cell12FillSegment++;
}
const cell12CurvePlot = cell12Plot.plot({
  width: cell12CurveWidth, height: cell12CurveHeight,
  marginTop: 9, marginRight: 33, marginBottom: 30, marginLeft: 12,
  x: {type: "linear", domain: [0, 1], nice: false,
    ticks: [0, 500, 1500].map(cell12CurvePosition),
    tickFormat: value => Math.round(cell12CurveDistance(value)).toLocaleString(), label: null, tickSize: 0},
  y: {axis: "right", ticks: 3, label: null, tickSize: 0},
  style: {background: "transparent", color: "#303940", fontFamily: cell12Font, fontSize: "8px"},
  marks: [
    cell12Plot.ruleY([0], {stroke: "#9ca3af", strokeOpacity: 0.65}),
    cell12Plot.ruleX([cell12CurvePosition(cell12RawDifferenceRadius)], {
      stroke: cell12RawRadiusColor, strokeWidth: 1.25,
      strokeDasharray: `${cell12RingDashLength},${cell12RingDashGap}`,
      strokeOpacity: cell12RingOpacity, clip: true
    }),
    cell12Plot.areaY(cell12EnvelopeFill, {
      x: "x", y1: "upper", y2: "observed", z: "segment", fill: "#d3a11d", fillOpacity: 0.72, clip: true
    }),
    cell12Plot.line(cell12EnvelopeLine, {
      x: "x", y: "y", stroke: "#62447e", strokeWidth: 1.5, clip: true
    }),
    cell12Plot.line(cell12DifferenceCurve, {
      x: d => cell12CurvePosition(d.radius), y: "difference", stroke: "#aa91d0", strokeWidth: 2, clip: true
    }),
    cell12Plot.dot(cell12EnvelopeCrossings, {
      x: "x", y: "y", symbol: "times", r: 1.5, fill: "none", stroke: "#563b22", strokeWidth: 0.8, clip: true
    })
  ]
});
const cell12CurveXScale = cell12CurvePlot.scale("x");
const cell12MscGuide = cell12Htl.svg`<line x1=${cell12CurveXScale.apply(cell12CurvePosition(cell12Cutpoint))}
  x2=${cell12CurveXScale.apply(cell12CurvePosition(cell12Cutpoint))} y1="9" y2=${cell12CurveHeight - 30}
  stroke=${cell12BasemapColors["Tour Eiffel"]} stroke-width="1.25"
  stroke-dasharray=${`${cell12RingDashLength},${cell12RingDashGap}`}
  stroke-opacity=${cell12RingOpacity} pointer-events="none" />`;
cell12CurvePlot.append(cell12MscGuide);
const cell12CurveAxisX = cell12CurveWidth - 3;
const cell12CurveAxisY = 9 + (cell12CurveHeight - 9 - 30) / 2;
// Center the decorative tower at the true zero on the distance axis.
// Its SVG height is exactly 0.2 units on the rendered y scale.
const cell12CurveYScale = cell12CurvePlot.scale("y");
const cell12TowerIconHeight = Math.abs(cell12CurveYScale.apply(0.2) - cell12CurveYScale.apply(0));
const cell12TowerIconTop = cell12CurveHeight - 30 - cell12TowerIconHeight;
const cell12TowerIconLeft = cell12CurveXScale.apply(0) - cell12TowerIconHeight * 0.25;
cell12CurvePlot.append(cell12Htl.svg`<g aria-label="Eiffel Tower at zero metres"
  role="img" pointer-events="none" fill=${cell12BasemapColors["Tour Eiffel"]}
  transform=${`translate(${cell12TowerIconLeft} ${cell12TowerIconTop}) scale(${cell12TowerIconHeight / 100})`}>
  <path fill-rule="evenodd" d="M24 0 H26 L28 21 L31 35 L35 54 L38 69 L49 100 H31 Q25 78 19 100 H1 L12 69 L15 54 L19 35 L22 21 Z" />
  <path d="M17 31 H33 V36 H17 Z M11 60 H39 V66 H11 Z M0 95 H50 V100 H0 Z" />
</g>`);
cell12CurvePlot.append(cell12Htl.svg`<g font-family=${cell12Font} font-size="8" fill="#303940">
  <text x=${cell12CurveAxisX} y=${cell12CurveAxisY}
    transform=${`rotate(-90 ${cell12CurveAxisX} ${cell12CurveAxisY})`}
    text-anchor="middle">Avg rating</text>
  <text x=${(cell12CurveWidth - 33 + 12) / 2} y=${cell12CurveHeight - 3}
    text-anchor="middle">Distance threshold (m)</text>
</g>`);
cell12CurvePlot.querySelectorAll("text").forEach(text => {
  text.setAttribute("stroke", "white");
  text.setAttribute("stroke-width", "2");
  text.setAttribute("stroke-linejoin", "round");
  text.setAttribute("paint-order", "stroke");
});

// Native SVG titles identify the cutpoint marks; give those marks rich popups
// while retaining plain, accessible labels and the existing point tooltips.
const cell12PopupNumber = value => Number.isFinite(value) ? value.toFixed(2) : "—";
const cell12PopupHeading = group => group.kind === "GRD"
  ? `${group.group === "Inside" ? "Interior" : "Exterior"} Greatest Raw Difference`
  : `${group.group === "Inside" ? "Interior" : "Exterior"} ${cell12Cutpoint === cell12DefaultCutpoint ? "Maximal Selected Cutpoint" : "Adjusted Radius"}`;
const cell12PopupDifference = group => group.kind === "GRD" ? cell12RawRatingDifference : cell12RatingDifference;
const cell12PopupSummary = group => `${cell12PopupHeading(group)}\nMean rating: ${cell12PopupNumber(group.mean)}\nMedian rating: ${cell12PopupNumber(group.median)}\nRating difference: ${cell12PopupNumber(cell12PopupDifference(group))} stars (outside − inside)\nRated restaurants: ${group.n}`;
const cell12PopupBlock = group => cell12Htl.html`<div><div style=${{fontWeight: "700", color: group.kind === "GRD" ? cell12RawRadiusColor : cell12BasemapColors["Tour Eiffel"]}}>${cell12PopupHeading(group)}</div><div>Mean rating: ${cell12PopupNumber(group.mean)}</div><div>Median rating: ${cell12PopupNumber(group.median)}</div><div>Rating difference: ${cell12PopupNumber(cell12PopupDifference(group))} stars (outside − inside)</div><div>Rated restaurants: ${group.n}</div></div>`;
const cell12PopupText = new WeakMap();
const cell12MscTooltipMarks = [];
cell12Map.querySelectorAll("title").forEach(title => {
  const mark = title.parentNode;
  if (mark === cell12Map) return;
  const key = title.textContent;
  const groups = key === "__cell12_cutpoint_both__" ? cell12Groups
    : key === "__cell12_cutpoint_inside__" ? [cell12Groups[0]]
    : key === "__cell12_cutpoint_outside__" ? [cell12Groups[1]]
    : key === "__cell12_grd_both__" ? cell12RawGroups
    : key === "__cell12_grd_inside__" ? [cell12RawGroups[0]]
    : key === "__cell12_grd_outside__" ? [cell12RawGroups[1]] : null;
  cell12PopupText.set(mark, groups || key);
  mark.setAttribute("aria-label", groups ? groups.map(cell12PopupSummary).join("\n\n") : key);
  if (groups && key.startsWith("__cell12_cutpoint_")) cell12MscTooltipMarks.push({mark, groups});
  title.remove();
});
const cell12Popup = cell12Htl.html`<div role="tooltip" style=${{
  display: "none", position: "absolute", pointerEvents: "none", zIndex: 2,
  fontFamily: cell12Font, fontSize: "13px", lineHeight: "1.35", whiteSpace: "pre-line",
  color: "#26313a", background: "rgba(255,255,255,0.96)",
  border: "1px solid #d9d6d0", borderRadius: "3px", padding: "6px 8px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.12)", maxWidth: "300px"
}}></div>`;
const cell12RadiusLegend = cell12Htl.html`<span>MSC Radius (${cell12Cutpoint}m)</span>`;
const cell12RadiusCaption = cell12Htl.html`<span></span>`;
const cell12SummaryCaption = cell12Htl.html`<span></span>`;
const cell12RadiusButton = cell12Htl.html`<button type="button" aria-expanded="false" style=${{
  fontFamily: cell12Font, fontSize: "10px", cursor: "pointer", padding: "3px 5px",
  background: "rgba(255,255,255,0.92)", border: "1px solid #bcb3aa", borderRadius: "3px"
}}>Edit MSC Radius</button>`;
const cell12RadiusSlider = cell12Htl.html`<input type="range" min=${cell12SliderMin} max=${cell12SliderMax}
  step="1" value=${cell12Cutpoint} aria-label="MSC radius in metres" style="width: 100%; margin: 2px 0" />`;
const cell12RadiusValue = cell12Htl.html`<output>${cell12Cutpoint} m</output>`;
const cell12ResetButton = cell12Htl.html`<button type="button" style="font-size: 10px; cursor: pointer">Reset</button>`;
const cell12RadiusPanel = cell12Htl.html`<div style=${{
  marginTop: "3px", fontSize: "10px"
}}>${cell12RadiusValue} ${cell12RadiusSlider} ${cell12ResetButton}</div>`;
cell12RadiusPanel.hidden = true;
const cell12MapContainer = cell12Htl.html`<div style="position: relative; width: 100%">
  ${cell12Map}
  <div style=${{
    position: "absolute", left: "12px", top: "12px", width: "260px", maxWidth: `calc(100% - ${cell12InsetWidth + 44}px)`,
    padding: "8px", pointerEvents: "none", fontFamily: cell12Font,
    textShadow: "0 0 2px white, 0 0 4px white, 1px 1px 3px white, -1px -1px 3px white"
  }}>
    <h2 style="margin: 0 0 3px; font-size: 18px; line-height: 1.1; font-weight: 700; color: #18242b">${cell12Title}</h2>
    <div style="margin-bottom: 4px; font-size: 12px; line-height: 1.25; font-weight: 600; color: #27343c">${cell12Subtitle}</div>
    ${cell12Legend}
    <div style="display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: #27343c">
      <svg width="30" height="8" aria-hidden="true"><line x1="1" y1="4" x2="29" y2="4"
        stroke=${cell12BasemapColors["Tour Eiffel"]} stroke-width="2.5" stroke-linecap="round"
        stroke-dasharray=${`${cell12RingDashLength},${cell12RingDashGap}`} stroke-opacity=${cell12RingOpacity} /></svg>
      ${cell12RadiusLegend}
    </div>
    <div style="display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: #27343c">
      <svg width="30" height="8" aria-hidden="true"><line x1="1" y1="4" x2="29" y2="4"
        stroke=${cell12RawRadiusColor} stroke-width="2.5" stroke-linecap="round"
        stroke-dasharray=${`${cell12RingDashLength},${cell12RingDashGap}`} stroke-opacity=${cell12RingOpacity} /></svg>
      <span>GRD Radius (${Math.round(cell12RawDifferenceRadius)}m)</span>
    </div>
    <div style="pointer-events: auto; width: 112.5px; max-width: 100%; margin-top: 6px">${cell12RadiusButton}${cell12RadiusPanel}</div>
  </div>
  <div aria-label="Paris restaurant overview; brown outline marks the main map area" style=${{
    position: "absolute", right: "12px", top: "12px", width: `${cell12InsetWidth}px`,
    pointerEvents: "none", fontFamily: cell12Font, textAlign: "center",
    color: "#27343c", textShadow: "0 0 3px white, 0 0 5px white"
  }}>
    <div style="font-size: 12px; font-weight: 700">Paris <span style=${{color: cell12InsetAOIColor}}>AOI</span></div>
    ${cell12Inset}
  </div>
  <div aria-label="Observed mean rating outside minus inside by distance threshold" style=${{
    position: "absolute", right: "12px", bottom: "12px", width: `${cell12CurveWidth}px`,
    pointerEvents: "none", fontFamily: cell12Font, color: "#27343c",
    textShadow: "0 0 3px white, 0 0 5px white"
  }}>
    ${cell12CurvePlot}
    <div style="font-size: 9px; font-weight: 700; text-align: center">Raw Difference (e-i)</div>
  </div>
  ${cell12Popup}
</div>`;
cell12Map.addEventListener("pointermove", event => {
  let target = event.target;
  while (target && target !== cell12Map && !cell12PopupText.has(target)) target = target.parentNode;
  const value = target && cell12PopupText.get(target);
  if (!value) { cell12Popup.style.display = "none"; return; }
  if (Array.isArray(value)) {
    cell12Popup.replaceChildren(...value.map(cell12PopupBlock));
  } else {
    cell12Popup.textContent = value;
  }
  cell12Popup.style.display = "block";
  const bounds = cell12MapContainer.getBoundingClientRect();
  const x = event.clientX - bounds.left + 12;
  const y = event.clientY - bounds.top + 12;
  cell12Popup.style.left = `${Math.max(0, Math.min(x, bounds.width - cell12Popup.offsetWidth))}px`;
  cell12Popup.style.top = `${Math.max(0, Math.min(y, bounds.height - cell12Popup.offsetHeight))}px`;
});
cell12Map.addEventListener("pointerleave", () => { cell12Popup.style.display = "none"; });

const cell12Figure = cell12Htl.html`<figure style=${{margin: 0, maxWidth: `${cell12MapWidth}px`, fontFamily: cell12Font}}>
  ${cell12MapContainer}
  <figcaption style="margin: 4px 8px; font-size: 12px; color: #505860">
    <div style="margin-bottom: 4px">${cell12RadiusCaption} The lighter circle marks the ${cell12RawDifferenceRadius.toFixed(2)} m greatest raw difference (GRD) radius. Each circle's labels show mean ratings inside (distance ≤ radius) and outside (distance > radius through 1,500 m); gray points have no valid rating.</div>
    ${cell12SummaryCaption}
    <div style="margin-top: 4px">Inset: light purple is the observed outside-minus-inside mean difference; dark purple is Cell 09's one-sided 95% simultaneous permutation envelope (25 m grid). Gold shows where the plotted lines cross, interpolated between tested radii; significance applies to the tested grid points. The envelope and Cell 11's Welch test use different statistics and searches. The distance axis is nonlinear, with 0–300 m compressed; dotted guides mark the MSC and GRD radii.</div>
    <div style="margin-top: 4px">Scale 1:10,000 when the 500 m bar measures 5 cm on the printed or displayed map.</div>
  </figcaption>
</figure>`;

function cell12SetRadius(radius) {
  cell12Cutpoint = Math.max(cell12SliderMin, Math.min(cell12SliderMax, Math.round(radius)));
  const inside = cell12Points.filter(p => p.rating !== null && p.distance <= cell12Cutpoint);
  const outside = cell12Points.filter(p => p.rating !== null && p.distance > cell12Cutpoint);
  for (const [i, points] of [inside, outside].entries()) {
    Object.assign(cell12Groups[i], {n: points.length,
      mean: points.length ? cell12D3.mean(points, d => d.rating) : null,
      median: points.length ? cell12D3.median(points, d => d.rating) : null});
  }
  cell12RatingDifference = cell12Groups.every(g => g.mean !== null)
    ? cell12Groups[1].mean - cell12Groups[0].mean : null;

  cell12MscCircleMark.querySelector("path").setAttribute("d", cell12CirclePath(cell12RadiusCircle(cell12Cutpoint)));
  const angle = -Math.PI / 4;
  const [x, y] = cell12Projection([cell12Center[0] + cell12Cutpoint * Math.cos(angle),
    cell12Center[1] + cell12Cutpoint * Math.sin(angle)]);
  cell12MscLabelMarks.forEach((mark, i) => {
    const text = mark.querySelector("text"), mean = cell12Groups[i].mean;
    text.setAttribute("x", x);
    text.setAttribute("y", y + (i === 0 ? -7 : 7));
    text.textContent = `${i === 0 ? "iMSCavg" : "eMSCavg"}: ${mean === null ? "—" : mean.toFixed(2)}`;
  });
  const guideX = cell12CurveXScale.apply(cell12CurvePosition(cell12Cutpoint));
  cell12MscGuide.setAttribute("x1", guideX);
  cell12MscGuide.setAttribute("x2", guideX);
  for (const {mark, groups} of cell12MscTooltipMarks)
    mark.setAttribute("aria-label", groups.map(cell12PopupSummary).join("\n\n"));
  cell12Popup.style.display = "none";
  cell12RadiusSlider.value = String(cell12Cutpoint);
  cell12RadiusValue.textContent = `${cell12Cutpoint} m`;
  const adjusted = cell12Cutpoint !== cell12DefaultCutpoint;
  cell12RadiusLegend.textContent = `MSC Radius (${cell12Cutpoint}m${adjusted ? "; adjusted" : ""})`;
  cell12RadiusCaption.textContent = adjusted
    ? `The dark dotted circle shows an exploratory ${cell12Cutpoint} m radius; the original maximally selected radius is ${cell12DefaultCutpoint} m.`
    : `The dark dotted circle marks the ${cell12DefaultCutpoint} m maximally selected cutpoint (MSC).`;
  cell12SummaryCaption.textContent = cell12Groups.map(g =>
    `${g.group}: ${g.mean === null ? "no ratings" : `mean ${g.mean.toFixed(2)}, median ${g.median.toFixed(2)} (n=${g.n})`}`).join(" · ") +
    (cell12Groups.some(g => g.n < cell12CurveMinimum) ? " · Fewer than 20 rated restaurants in a group; this comparison is exploratory." : "");
}
cell12RadiusButton.addEventListener("click", () => {
  cell12RadiusPanel.hidden = !cell12RadiusPanel.hidden;
  cell12RadiusButton.setAttribute("aria-expanded", String(!cell12RadiusPanel.hidden));
});
cell12RadiusSlider.addEventListener("input", () => cell12SetRadius(Number(cell12RadiusSlider.value)));
cell12ResetButton.addEventListener("click", () => cell12SetRadius(cell12DefaultCutpoint));
cell12SetRadius(cell12DefaultCutpoint);
display(cell12Figure);
