// Cell 03 — paste this entire file into one Observable JavaScript or TypeScript cell.
// Attach restaurants_paris.geojson to the notebook before running it.
import * as cell03Inputs from "npm:@observablehq/inputs";
import * as cell03Htl from "npm:htl";
import * as cell03Plot from "npm:@observablehq/plot";
import cell03JStatPackage from "npm:jstat";

const cell03JStat = cell03JStatPackage.jStat ?? cell03JStatPackage;
const cell03GeoJSON = await FileAttachment("restaurants_paris.geojson").json();
const cell03Restaurants = cell03GeoJSON.features.map(feature => feature.properties ?? {});
const cell03PriceCodes = new Map([["€", 1], ["€€-€€€", 2], ["€€€€", 3]]);
const cell03First = value => typeof value === "string" ? value.split(",")[0].trim() || null : null;
const cell03CuisineGroup = value => {
  const first = cell03First(value);
  return first === null ? null : ["French", "European", "Japanese"].includes(first) ? first : "Other cuisines";
};

// Solve Xβ = y by modified Gram–Schmidt QR, avoiding inversion of X'X.
// The second coefficient is always distance, expressed in kilometres.
function cell03Fit(rows, adjusted) {
  let cuisines = [];
  let reference = null;
  if (adjusted) {
    const groupCounts = new Map();
    for (const row of rows) groupCounts.set(row.cuisine, (groupCounts.get(row.cuisine) ?? 0) + 1);
    const groups = Array.from(groupCounts.keys()).sort((a, b) =>
      groupCounts.get(b) - groupCounts.get(a) || String(a).localeCompare(String(b)));
    reference = groups[0];
    cuisines = groups.slice(1);
  }
  const columns = [rows.map(() => 1), rows.map(row => row.distance / 1000)];
  if (adjusted) {
    columns.push(rows.map(row => row.price));
    columns.push(rows.map(row => row.award));
    for (const cuisine of cuisines) columns.push(rows.map(row => +(row.cuisine === cuisine)));
  }
  const n = rows.length, p = columns.length, df = n - p;
  if (df <= 0) throw new Error("Not enough complete observations for this model.");
  const q = [], r = Array.from({length: p}, () => Array(p).fill(0));
  for (let j = 0; j < p; j++) {
    const v = columns[j].slice();
    for (let k = 0; k < j; k++) {
      let dot = 0;
      for (let i = 0; i < n; i++) dot += q[k][i] * v[i];
      r[k][j] = dot;
      for (let i = 0; i < n; i++) v[i] -= dot * q[k][i];
    }
    r[j][j] = Math.hypot(...v);
    if (r[j][j] < 1e-10) throw new Error("The model is singular; a predictor has no independent variation.");
    q.push(v.map(value => value / r[j][j]));
  }
  const qty = q.map(column => column.reduce((sum, value, i) => sum + value * rows[i].rating, 0));
  const beta = Array(p).fill(0);
  for (let j = p - 1; j >= 0; j--) {
    let value = qty[j];
    for (let k = j + 1; k < p; k++) value -= r[j][k] * beta[k];
    beta[j] = value / r[j][j];
  }
  let sse = 0, sst = 0;
  const mean = rows.reduce((sum, row) => sum + row.rating, 0) / n;
  for (let i = 0; i < n; i++) {
    let predicted = 0;
    for (let j = 0; j < p; j++) predicted += columns[j][i] * beta[j];
    sse += (rows[i].rating - predicted) ** 2;
    sst += (rows[i].rating - mean) ** 2;
  }
  // Row 1 of R⁻¹ gives the distance coefficient's diagonal entry in (X'X)⁻¹.
  const inverseDistanceRow = Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    let value = j === 1 ? 1 : 0;
    for (let k = 0; k < j; k++) value -= inverseDistanceRow[k] * r[k][j];
    inverseDistanceRow[j] = value / r[j][j];
  }
  const se = Math.sqrt(sse / df * inverseDistanceRow.reduce((sum, value) => sum + value ** 2, 0));
  if (!(se > 0) || !Number.isFinite(se)) throw new Error("The distance standard error is undefined.");
  const t = beta[1] / se;
  const critical = cell03JStat.studentt.inv(0.975, df);
  // Evaluate the lower tail directly for numerical accuracy with large |t|.
  const pValue = Math.min(1, 2 * cell03JStat.studentt.cdf(-Math.abs(t), df));
  return {n, df, mse: sse / df, estimate: beta[1], se, t, pValue,
    low: beta[1] - critical * se, high: beta[1] + critical * se,
    r2: sst > 0 ? 1 - sse / sst : null, reference};
}

const cell03Scope = cell03Inputs.radio(["All Paris restaurants", "Within 1.5 km"], {
  label: "Restaurants to include", value: "Within 1.5 km"
});
const cell03ReviewCheck = cell03Htl.html`<input type="checkbox">`;
const cell03ReviewFloor = cell03Htl.html`<input type="number" min="0" step="1" value="3" aria-label="Minimum review count" style="width:80px;">`;
cell03ReviewFloor.hidden = true;
const cell03ScopeRow = cell03Htl.html`<div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px 20px;">
  ${cell03Scope}
  <label style="display:inline-flex; align-items:center; gap:6px; font:13px system-ui, sans-serif;">${cell03ReviewCheck} Exclude low review count</label>
  ${cell03ReviewFloor}
</div>`;
const cell03Mode = cell03Inputs.radio(["Linear Regression Model", "Price Level", "Cuisine", "Awarded"], {
  label: "Plot variables", value: "Linear Regression Model"
});
const cell03LogCheck = cell03Htl.html`<input type="checkbox">`;
const cell03ScaleRow = cell03Htl.html`<div style="display:flex; align-items:center; gap:8px; font:13px system-ui, sans-serif; margin:8px 0;">
  <span style="display:inline-block; width:120px;">Scale</span>
  <label style="display:inline-flex; align-items:center; gap:6px;">${cell03LogCheck} Logarithmic x-axis</label>
</div>`;
const cell03TableResults = cell03Htl.html`<div></div>`;
const cell03ChartResults = cell03Htl.html`<div></div>`;
// Each chart mode remembers its hidden groups when other controls change.
const cell03Visibility = new Map();
const cell03View = cell03Htl.html`<section>
  <style>
    .cell03-regression-table tr > :nth-child(3) { background-color: #f1f3f5; }
  </style>
  <h4>Restaurant rating and distance from the Eiffel Tower</h4>
  ${cell03ScopeRow}${cell03TableResults}
  <h4 style="margin:24px 0 12px;">Scatterplot</h4>
  ${cell03Mode}${cell03ScaleRow}${cell03ChartResults}
</section>`;

function cell03Update() {
  const floorText = cell03ReviewFloor.value.trim();
  const reviewFloor = Number(floorText);
  if (cell03ReviewCheck.checked && (!floorText || !Number.isSafeInteger(reviewFloor) || reviewFloor < 0)) {
    cell03TableResults.replaceChildren(cell03Htl.html`<p>Enter a nonnegative whole number for the minimum review count.</p>`);
    cell03ChartResults.replaceChildren();
    return;
  }
  const within = cell03Scope.value === "Within 1.5 km";
  const selected = cell03Restaurants.filter(row =>
    (!within || (Number.isFinite(row.distance_from_eiffeltower_m) && row.distance_from_eiffeltower_m <= 1500)) &&
    (!cell03ReviewCheck.checked || (Number.isFinite(row.reviews_count_in_default_language) &&
      row.reviews_count_in_default_language >= reviewFloor)));
  const usable = selected.filter(row => Number.isFinite(row.rating) &&
    Number.isFinite(row.distance_from_eiffeltower_m) && row.distance_from_eiffeltower_m >= 0)
    .map(row => ({rating: row.rating, distance: row.distance_from_eiffeltower_m,
      price: cell03PriceCodes.get(row.price_level), priceLabel: row.price_level, cuisine: cell03CuisineGroup(row.cuisines),
      award: typeof row.awards === "string" && row.awards.trim() !== "" ? 1 : 0}));
  const complete = usable.filter(row => row.price !== undefined && row.cuisine !== null);
  const table = [], errors = [];
  let adjustedFit = null;
  for (const [model, rows, adjusted] of [
    ["Unadjusted", usable, false], ["Controls: price + cuisine + awards", complete, true]
  ]) {
    try {
      const fit = cell03Fit(rows, adjusted);
      if (adjusted) adjustedFit = fit;
      table.push({Model: model, "Rating coefficient (per km)": fit.estimate,
        N: fit.n, Excluded: selected.length - fit.n, "Standard error": fit.se,
        "t statistic": fit.t, "p value": fit.pValue, "R²": fit.r2});
    } catch (error) { errors.push(`${model}: ${error.message}`); }
  }
  const number = value => value == null ? "—" : value.toFixed(4);
  const pFormat = value => value < 0.0001 ? "< 0.0001" : value.toFixed(4);
  const starsFor = p => p == null || !Number.isFinite(p) ? "" : p < 0.01 ? "***" : p < 0.05 ? "**" : p < 0.10 ? "*" : "";
  const coefficientFormat = (value, index, rows) => `${number(value)}${starsFor(rows[index]["p value"])}`;
  cell03TableResults.replaceChildren(
    ...(table.length ? [cell03Htl.html`<div class="cell03-regression-table">${cell03Inputs.table(table, {
      rows: 2, width: {Model: 250, "Rating coefficient (per km)": 180}, format: {
        "Rating coefficient (per km)": coefficientFormat, "Standard error": number, "t statistic": number,
        "p value": pFormat, "R²": number
      }
    })}</div>`] : []),
    ...errors.map(message => cell03Htl.html`<p>${message}</p>`)
  );

  // Simple regression in actual kilometres, independent of the chart's x scale.
  const fitGroup = rows => {
    if (rows.length < 3) return null;
    const meanX = rows.reduce((sum, row) => sum + row.distance / 1000, 0) / rows.length;
    const meanY = rows.reduce((sum, row) => sum + row.rating, 0) / rows.length;
    let sxx = 0, sxy = 0;
    for (const row of rows) {
      const dx = row.distance / 1000 - meanX;
      sxx += dx * dx;
      sxy += dx * (row.rating - meanY);
    }
    if (!(sxx > 0)) return null;
    const estimate = sxy / sxx;
    const mse = rows.reduce((sum, row) => sum +
      (row.rating - meanY - estimate * (row.distance / 1000 - meanX)) ** 2, 0) / (rows.length - 2);
    const se = Math.sqrt(mse / sxx);
    const pValue = se > 0 ? Math.min(1, 2 * cell03JStat.studentt.cdf(-Math.abs(estimate / se), rows.length - 2)) : null;
    return {n: rows.length, df: rows.length - 2, estimate, mse, se, pValue};
  };
  // Holding controls at their sample means centers each fitted line at (mean x, mean y).
  const makeCurve = (rows, fit) => {
    const displayRows = cell03LogCheck.checked ? rows.filter(row => row.distance > 0) : rows;
    if (!fit || displayRows.length < 2) return [];
    const xs = rows.map(row => row.distance / 1000);
    const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
    const meanY = rows.reduce((sum, row) => sum + row.rating, 0) / rows.length;
    const critical = cell03JStat.studentt.inv(0.975, fit.df);
    const minX = Math.min(...displayRows.map(row => row.distance / 1000));
    const maxX = Math.max(...displayRows.map(row => row.distance / 1000));
    if (minX >= maxX) return [];
    return Array.from({length: 201}, (_, i) => {
      const fraction = i / 200;
      const x = cell03LogCheck.checked
        ? Math.exp(Math.log(minX) + fraction * (Math.log(maxX) - Math.log(minX)))
        : minX + fraction * (maxX - minX);
      const y = meanY + fit.estimate * (x - meanX);
      const margin = critical * Math.sqrt(fit.mse / fit.n + (x - meanX) ** 2 * fit.se ** 2);
      return {distance: x, y, low: y - margin, high: y + margin};
    });
  };
  const mode = cell03Mode.value;
  const visibilityKey = name => `${mode}\u0000${name}`;
  const isVisible = name => cell03Visibility.get(visibilityKey(name)) !== false;
  const legendItem = (key, label, color, dashed = false) => {
    const input = cell03Htl.html`<input type="checkbox">`;
    input.checked = isVisible(key);
    input.addEventListener("change", () => {
      cell03Visibility.set(visibilityKey(key), input.checked);
      cell03Update();
    });
    const swatch = cell03Htl.html`<span style=${{display: "inline-block", width: "20px", borderTop: `3px ${dashed ? "dotted" : "solid"} ${color}`}}></span>`;
    return cell03Htl.html`<label style="display:inline-flex; align-items:center; gap:5px; cursor:pointer;">${input}${swatch}${label}</label>`;
  };
  const xOptions = cell03LogCheck.checked
    ? {type: "log", label: "Distance from the Eiffel Tower (km, log scale)"}
    : {type: "linear", label: "Distance from the Eiffel Tower (km)"};
  const logSafe = rows => cell03LogCheck.checked ? rows.filter(row => row.distance > 0) : rows;
  const baselineKey = "baseline";
  const baselineColor = "#111827";
  let legendEntries = [], points = [], lineDefs = [], note = "";
  if (mode === "Linear Regression Model") {
    // The baseline and grey points share one legend item in this view.
    legendEntries.push(legendItem(baselineKey, "Baseline and points", baselineColor, true));
    legendEntries.push(legendItem("controlled", "Controls at sample means", "#00ffff"));
    if (isVisible(baselineKey)) {
      points = logSafe(usable).map(row => ({...row, group: "Restaurants"}));
      lineDefs.push({name: "Baseline", color: baselineColor, rows: usable, fit: fitGroup(usable), dashed: true});
    }
    if (isVisible("controlled")) lineDefs.push({name: "Controls", color: "#00ffff", rows: complete, fit: adjustedFit});
  } else {
    const grouped = usable.map(row => {
      let group = null;
      if (mode === "Price Level" && row.price !== undefined) group = row.priceLabel;
      if (mode === "Awarded") group = row.award ? "Award recorded" : "No recorded award";
      if (mode === "Cuisine") group = row.cuisine;
      return {...row, group};
    }).filter(row => row.group !== null);
    const groups = new Map();
    for (const row of grouped) {
      if (!groups.has(row.group)) groups.set(row.group, []);
      groups.get(row.group).push(row);
    }
    const names = mode === "Price Level" ? ["€", "€€-€€€", "€€€€"].filter(name => groups.has(name))
      : mode === "Awarded" ? ["No recorded award", "Award recorded"].filter(name => groups.has(name))
      : ["French", "European", "Japanese", "Other cuisines"].filter(name => groups.has(name));
    const colors = names.map(name => mode === "Price Level"
      ? ({"€": "#c89467", "€€-€€€": "#98613d", "€€€€": "#553018"})[name]
      : mode === "Awarded" ? name === "Award recorded" ? "#166534" : "#8e8fd4"
      : ({"French": "#173f73", "European": "#553018", "Japanese": "#b45309", "Other cuisines": "#800020"})[name]);
    legendEntries.push(legendItem(baselineKey, "Baseline (visible groups)", baselineColor, true));
    let visibleRows = [], groupsWithoutLines = 0;
    for (let i = 0; i < names.length; i++) {
      const name = names[i], rows = groups.get(name), key = `group:${name}`;
      legendEntries.push(legendItem(key, name, colors[i]));
      if (!isVisible(key)) continue;
      visibleRows.push(...rows);
      const fit = fitGroup(rows);
      if (!fit) groupsWithoutLines++;
      lineDefs.push({name, color: colors[i], rows, fit});
    }
    points = logSafe(visibleRows);
    if (isVisible(baselineKey)) lineDefs.push({name: "Baseline", color: baselineColor, rows: visibleRows, fit: fitGroup(visibleRows), dashed: true});
    note = `Plot: ${points.length.toLocaleString()} visible restaurants; missing group values are excluded.${groupsWithoutLines ? ` ${groupsWithoutLines} visible group(s) lack enough observations or distance variation for a line.` : ""}`;
  }
  const curves = lineDefs.map(def => ({...def, curve: makeCurve(def.rows, def.fit)})).filter(def => def.curve.length);
  const marks = [];
  if (points.length) {
    if (mode === "Linear Regression Model") marks.push(cell03Plot.dot(points, {x: row => row.distance / 1000, y: "rating", fill: "#374151", r: 2, fillOpacity: 0.55}));
    else {
      const colorsByName = new Map(lineDefs.filter(def => !def.dashed).map(def => [def.name, def.color]));
      marks.push(cell03Plot.dot(points, {x: row => row.distance / 1000, y: "rating", fill: row => colorsByName.get(row.group), r: 2, fillOpacity: 0.5}));
    }
  }
  for (const def of curves) marks.push(cell03Plot.areaY(def.curve, {x: "distance", y1: "low", y2: "high", fill: def.color, fillOpacity: def.dashed ? 0.08 : 0.14}));
  for (const def of curves) marks.push(cell03Plot.lineY(def.curve, {x: "distance", y: "y", stroke: def.color, strokeWidth: def.dashed ? 2 : 2.5, strokeDasharray: def.dashed ? "3,4" : null}));
  for (let i = 0; i < curves.length; i++) {
    const def = curves[i], point = def.curve[Math.floor(def.curve.length * 0.65)];
    marks.push(cell03Plot.text([{...point, label: `${number(def.fit.estimate)}${starsFor(def.fit.pValue)}`}], {
      x: "distance", y: "y", text: "label", fill: def.color,
      fontSize: 11, fontWeight: 700, textAnchor: "start", dx: 4, dy: -6 - (i % 3) * 10
    }));
  }
  const legend = cell03Htl.html`<div style="display:flex; flex-wrap:wrap; gap:6px 16px; align-items:center; margin:12px 0 4px; font:12px system-ui, sans-serif;">
    ${legendEntries}<span>Shading: 95% confidence bands</span>
  </div>`;
  const chart = marks.length ? cell03Plot.plot({
    width: Math.max(240, Math.min(width, 1100)), height: 420, marginLeft: 55,
    x: xOptions, y: {label: "Rating"}, color: {type: "identity"}, marks
  }) : null;
  cell03ChartResults.replaceChildren(
    legend,
    ...(note ? [cell03Htl.html`<p style="font:12px system-ui, sans-serif; margin:4px 0;">${note}</p>`] : []),
    ...(chart ? [chart] : [])
  );
}
cell03Scope.addEventListener("input", cell03Update);
cell03Mode.addEventListener("input", cell03Update);
cell03LogCheck.addEventListener("change", cell03Update);
cell03ReviewCheck.addEventListener("change", () => {
  cell03ReviewFloor.hidden = !cell03ReviewCheck.checked;
  cell03Update();
});
cell03ReviewFloor.addEventListener("input", cell03Update);
cell03Update();
display(cell03View);
