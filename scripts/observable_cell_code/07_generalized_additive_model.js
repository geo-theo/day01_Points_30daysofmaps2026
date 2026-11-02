// Independent Observable Notebooks 2.0 cell: attach restaurants_within1500m.geojson.
import * as gamD3 from "npm:d3@7.9.0";

const gamRestaurants = await FileAttachment("restaurants_within1500m.geojson").json();

const restaurantGAM = (() => {
  const basisCount = 12; // Maximum flexibility; GCV chooses the effective complexity.
  const lambdaGrid = Array.from({length: 61}, (_, i) => 10 ** (-6 + i / 5));
  const points = gamRestaurants.features.map(f => f.properties)
    .filter(d => Number.isFinite(d?.distance_from_eiffeltower_m)
      && d.distance_from_eiffeltower_m >= 0 && d.distance_from_eiffeltower_m <= 1500
      && Number.isFinite(d?.avg_rating) && d.avg_rating >= 1 && d.avg_rating <= 5)
    .map(d => ({distance: d.distance_from_eiffeltower_m, rating: d.avg_rating,
      name: d.restaurant_name ?? "Unnamed restaurant"}));

  if (points.length <= basisCount + 1 || new Set(points.map(d => d.distance)).size < 4) {
    throw new Error("GAM needs at least 14 rated restaurants and four distinct distances.");
  }
  const n = points.length;
  const minDistance = Math.min(...points.map(d => d.distance));
  const maxDistance = Math.max(...points.map(d => d.distance));
  const meanRating = points.reduce((sum, d) => sum + d.rating, 0) / n;
  const degree = 3;
  // Equally spaced knots extend three steps beyond each end of [0, 1].
  // This gives a cubic B-spline basis with a linear, unpenalized null space.
  const knots = Array.from({length: basisCount + degree + 1},
    (_, i) => (i - degree) / (basisCount - degree));

  function basis(distance) {
    if (!Number.isFinite(distance) || distance < minDistance || distance > maxDistance) {
      throw new Error("Predict only within the observed distance range.");
    }
    const u = (distance - minDistance) / (maxDistance - minDistance);
    let b = knots.slice(0, -1).map((left, i) => u >= left && u < knots[i + 1] ? 1 : 0);
    // Cox–de Boor recursion, including the observed endpoints.
    for (let order = 1; order <= degree; ++order) {
      b = Array.from({length: b.length - 1}, (_, i) =>
        (u - knots[i]) / (knots[i + order] - knots[i]) * b[i]
        + (knots[i + order + 1] - u) / (knots[i + order + 1] - knots[i + 1]) * b[i + 1]);
    }
    return b;
  }

  const matrix = () => Array.from({length: basisCount}, () => Array(basisCount).fill(0));
  const design = points.map(d => basis(d.distance));
  const gram = matrix();
  const rhs = Array(basisCount).fill(0);
  for (let row = 0; row < n; ++row) {
    for (let i = 0; i < basisCount; ++i) {
      rhs[i] += design[row][i] * (points[row].rating - meanRating);
      for (let j = 0; j < basisCount; ++j) gram[i][j] += design[row][i] * design[row][j];
    }
  }
  const penalty = matrix();
  for (let row = 0; row < basisCount - 2; ++row) {
    const difference = [1, -2, 1];
    for (let i = 0; i < 3; ++i) {
      for (let j = 0; j < 3; ++j) penalty[row + i][row + j] += difference[i] * difference[j];
    }
  }

  function cholesky(a) {
    const lower = matrix();
    for (let i = 0; i < basisCount; ++i) {
      for (let j = 0; j <= i; ++j) {
        let value = a[i][j];
        for (let k = 0; k < j; ++k) value -= lower[i][k] * lower[j][k];
        if (i === j) {
          if (!(value > 0)) throw new Error("GAM fit is numerically singular; reduce basisCount.");
          lower[i][j] = Math.sqrt(value);
        } else lower[i][j] = value / lower[j][j];
      }
    }
    return lower;
  }

  function solve(lower, vector) {
    const solution = vector.slice();
    for (let i = 0; i < basisCount; ++i) {
      for (let j = 0; j < i; ++j) solution[i] -= lower[i][j] * solution[j];
      solution[i] /= lower[i][i];
    }
    for (let i = basisCount - 1; i >= 0; --i) {
      for (let j = i + 1; j < basisCount; ++j) solution[i] -= lower[j][i] * solution[j];
      solution[i] /= lower[i][i];
    }
    return solution;
  }

  function fit(lambda) {
    const lower = cholesky(gram.map((row, i) => row.map((value, j) => value + lambda * penalty[i][j])));
    const coefficients = solve(lower, rhs);
    // Total model EDF = trace((B'B + lambda D'D)^-1 B'B), including intercept.
    let edf = 0;
    for (let j = 0; j < basisCount; ++j) edf += solve(lower, gram.map(row => row[j]))[j];
    const fitted = design.map(row => meanRating + row.reduce((sum, b, j) => sum + b * coefficients[j], 0));
    const sse = fitted.reduce((sum, value, i) => sum + (points[i].rating - value) ** 2, 0);
    const gcv = (sse / n) / (1 - edf / n) ** 2;
    return {lambda, coefficients, edf, fitted, sse, gcv};
  }

  // Minimize GCV on a broad log-spaced grid, then refine near the best candidate.
  const candidates = lambdaGrid.map(fit);
  let best = candidates.reduce((a, b) => b.gcv < a.gcv ? b : a);
  const bestIndex = candidates.indexOf(best);
  const boundary = bestIndex === 0 || bestIndex === candidates.length - 1;
  if (!boundary) {
    const lowerLog = Math.log10(lambdaGrid[bestIndex - 1]);
    const upperLog = Math.log10(lambdaGrid[bestIndex + 1]);
    for (let i = 0; i <= 40; ++i) {
      const candidate = fit(10 ** (lowerLog + (upperLog - lowerLog) * i / 40));
      if (candidate.gcv < best.gcv) best = candidate;
    }
  }
  const predict = distance => meanRating + basis(distance)
    .reduce((sum, b, j) => sum + b * best.coefficients[j], 0);
  const totalSS = points.reduce((sum, d) => sum + (d.rating - meanRating) ** 2, 0);
  const curve = Array.from({length: 241}, (_, i) => {
    const distance = i === 240 ? maxDistance : minDistance + (maxDistance - minDistance) * i / 240;
    return {distance, rating: predict(distance)};
  });
  return {
    n, omitted: gamRestaurants.features.length - n, points, curve, predict,
    basisCount, minDistance, maxDistance, lambda: best.lambda, edf: best.edf,
    gcv: best.gcv, rmse: Math.sqrt(best.sse / n),
    devianceExplained: totalSS > 0 ? 1 - best.sse / totalSS : null,
    smoothingAtBoundary: boundary,
    diagnostics: points.map((d, i) => ({...d, fitted: best.fitted[i], residual: d.rating - best.fitted[i]}))
  };
})();

const restaurantGAMChart = (() => {
  const model = restaurantGAM;
  const chartWidth = Math.max(280, Math.min(width, 1000));
  const height = 460;
  const margin = {top: 24, right: 24, bottom: 58, left: 62};
  const x = gamD3.scaleLinear().domain([0, 1500]).range([margin.left, chartWidth - margin.right]);
  // Gaussian predictions are not constrained to 1–5; expand axes if necessary.
  const y = gamD3.scaleLinear()
    .domain([Math.min(1, gamD3.min(model.curve, d => d.rating)), Math.max(5, gamD3.max(model.curve, d => d.rating))])
    .nice().range([height - margin.bottom, margin.top]);
  const svg = gamD3.create("svg")
    .attr("width", chartWidth).attr("height", height)
    .attr("viewBox", [0, 0, chartWidth, height].join(" "))
    .attr("role", "img")
    .attr("aria-label", "Restaurant ratings versus distance from the Eiffel Tower, with a fitted generalized additive model curve")
    .style("display", "block").style("max-width", "100%").style("height", "auto")
    .style("font", "12px system-ui, sans-serif");

  svg.append("g").attr("stroke", "#e5e7eb")
    .selectAll("line").data(y.ticks(8)).join("line")
    .attr("x1", margin.left).attr("x2", chartWidth - margin.right)
    .attr("y1", d => y(d)).attr("y2", d => y(d));
  svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`)
    .call(gamD3.axisBottom(x).ticks(Math.max(2, Math.floor(chartWidth / 100))).tickFormat(gamD3.format(",.0f")));
  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(gamD3.axisLeft(y).ticks(8).tickFormat(gamD3.format(".1f")))
    .call(g => g.select(".domain").remove());
  svg.append("text").attr("x", (margin.left + chartWidth - margin.right) / 2)
    .attr("y", height - 14).attr("text-anchor", "middle").attr("fill", "currentColor")
    .text("Distance from Eiffel Tower (m)");
  svg.append("text").attr("transform", "rotate(-90)")
    .attr("x", -(margin.top + height - margin.bottom) / 2).attr("y", 16)
    .attr("text-anchor", "middle").attr("fill", "currentColor").text("Average rating (out of 5)");

  svg.append("g").selectAll("circle").data(model.points).join("circle")
    .attr("cx", d => x(d.distance)).attr("cy", d => y(d.rating))
    .attr("r", 3).attr("fill", "#2563a6").attr("fill-opacity", 0.28)
    .append("title").text(d => `${d.name}\nDistance: ${gamD3.format(",.0f")(d.distance)} m\nRating: ${d.rating.toFixed(1)} / 5`);
  svg.append("path").datum(model.curve)
    .attr("d", gamD3.line().x(d => x(d.distance)).y(d => y(d.rating)))
    .attr("fill", "none").attr("stroke", "#c2410c").attr("stroke-width", 3)
    .attr("pointer-events", "none");

  return htl.html`<figure style="margin: 0; padding: 16px 0; background: white; color: #111827; font-family: system-ui, sans-serif;">
    <h3 style="margin: 0 8px 8px; font-size: 22px;">Restaurant ratings · generalized additive model</h3>
    <p style="margin: 0 8px 8px; color: #4b5563; font-size: 13px;">
      Average rating = intercept + smooth(distance). Gaussian family, identity link.
      ${model.n.toLocaleString("en-US")} restaurants · ${model.omitted} omitted.
    </p>
    <p style="margin: 0 8px 8px; font-size: 14px; font-weight: 600;">
      Deviance explained = ${model.devianceExplained === null ? "N/A" : (100 * model.devianceExplained).toFixed(2) + "%"}
      · Model EDF = ${model.edf.toFixed(2)} · Training RMSE = ${model.rmse.toFixed(3)}
    </p>
    <p style="margin: 0 8px 8px; color: #c2410c; font-size: 13px;">
      Orange: fitted mean rating · Blue: observed ratings
    </p>
    ${svg.node()}
    <figcaption style="margin: 8px; color: #4b5563; font-size: 12px;">
      A cubic P-spline with ${model.basisCount} basis functions and a second-difference penalty;
      smoothing λ = ${gamD3.format(".3g")(model.lambda)} selected by GCV (${model.gcv.toFixed(4)}).
      EDF includes the intercept. Each restaurant has equal weight.
      The curve spans only observed distances. Ratings are treated as numeric; this Gaussian model does not enforce the 1–5 bounds.
      Fit statistics describe these data, not held-out prediction performance or statistical significance.
      Independence and constant residual variance are assumed; spatial dependence is not modeled.
      ${model.smoothingAtBoundary ? "Smoothing reached the search boundary; widen lambdaGrid before interpreting the fit." : ""}
    </figcaption>
  </figure>`;
})();

display(restaurantGAMChart);
