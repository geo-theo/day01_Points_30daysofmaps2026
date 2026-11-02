// Upload this file as a notebook attachment, keeping its filename.
const nearbyRestaurants = await FileAttachment("restaurants_within1500m.geojson").json();

const restaurantScatterplot = (() => {
  const maxDistance = 1500;
  const chartWidth = Math.max(280, Math.min(width, 1000));
  const chartHeight = 460;
  const margin = {top: 24, right: 24, bottom: 58, left: 62};
  const pointRadius = 3.5;
  const pointColor = "#2563a6";
  const trendColor = "#c2410c";

  // Read attributes directly; the projected geometry is not needed here.
  // Number.isFinite rejects null ratings instead of converting them to zero.
  const points = nearbyRestaurants.features
    .map(d => d.properties)
    .filter(d => Number.isFinite(d?.distance_from_eiffeltower_m)
      && d.distance_from_eiffeltower_m >= 0
      && d.distance_from_eiffeltower_m <= maxDistance
      && Number.isFinite(d?.avg_rating)
      && d.avg_rating >= 1 && d.avg_rating <= 5);

  if (!points.length) throw new Error("No restaurants with valid distances and ratings.");

  // Ordinary least squares with an intercept; each plotted restaurant has equal weight.
  const meanDistance = points.reduce((sum, d) => sum + d.distance_from_eiffeltower_m, 0) / points.length;
  const meanRating = points.reduce((sum, d) => sum + d.avg_rating, 0) / points.length;
  let ssX = 0;
  let ssY = 0;
  let ssXY = 0;
  for (const d of points) {
    const dx = d.distance_from_eiffeltower_m - meanDistance;
    const dy = d.avg_rating - meanRating;
    ssX += dx * dx;
    ssY += dy * dy;
    ssXY += dx * dy;
  }
  const slope = ssX > 0 ? ssXY / ssX : null;
  const predict = distance => meanRating + (slope ?? 0) * (distance - meanDistance);
  const ssResidual = points.reduce((sum, d) => sum + (d.avg_rating - predict(d.distance_from_eiffeltower_m)) ** 2, 0);
  // R² is undefined when distances or ratings have no variation.
  const rSquared = slope !== null && ssY > 0
    ? Math.max(0, Math.min(1, 1 - ssResidual / ssY)) : null;
  const trendLabel = slope === null
    ? "Linear fit unavailable: distances have no variation. R² = N/A"
    : `Linear fit (OLS) · R² = ${rSquared === null ? "N/A (constant ratings)" : rSquared.toFixed(4)}`;

  const x = d3.scaleLinear()
    .domain([0, maxDistance])
    .range([margin.left, chartWidth - margin.right]);
  const y = d3.scaleLinear()
    .domain([1, 5])
    .range([chartHeight - margin.bottom, margin.top]);
  const ratingTicks = d3.range(1, 5.1, 0.5);

  const svg = d3.create("svg")
    .attr("width", chartWidth)
    .attr("height", chartHeight)
    .attr("viewBox", [0, 0, chartWidth, chartHeight].join(" "))
    .attr("role", "img")
    .attr("aria-label", "Scatterplot of restaurant distance from the Eiffel Tower in meters versus average rating out of five")
    .style("display", "block")
    .style("max-width", "100%")
    .style("height", "auto")
    .style("font", "12px system-ui, sans-serif");

  svg.append("g")
    .attr("stroke", "#e5e7eb")
    .selectAll("line")
    .data(ratingTicks)
    .join("line")
    .attr("x1", margin.left)
    .attr("x2", chartWidth - margin.right)
    .attr("y1", d => y(d))
    .attr("y2", d => y(d));

  svg.append("g")
    .attr("transform", `translate(0,${chartHeight - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(chartWidth / 100))).tickFormat(d3.format(",.0f")));

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickValues(ratingTicks).tickFormat(d3.format(".1f")))
    .call(g => g.select(".domain").remove());

  svg.append("text")
    .attr("x", (margin.left + chartWidth - margin.right) / 2)
    .attr("y", chartHeight - 14)
    .attr("fill", "currentColor")
    .attr("text-anchor", "middle")
    .text("Distance from Eiffel Tower (m)");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(margin.top + chartHeight - margin.bottom) / 2)
    .attr("y", 16)
    .attr("fill", "currentColor")
    .attr("text-anchor", "middle")
    .text("Average rating (out of 5)");

  // Exact values, without jitter. Transparency reveals overlapping points.
  svg.append("g")
    .selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", d => x(d.distance_from_eiffeltower_m))
    .attr("cy", d => y(d.avg_rating))
    .attr("r", pointRadius)
    .attr("fill", pointColor)
    .attr("fill-opacity", 0.45)
    .append("title")
    .text(d => `${d.restaurant_name ?? "Unnamed restaurant"}\nDistance: ${d3.format(",.0f")(d.distance_from_eiffeltower_m)} m\nAverage rating: ${d.avg_rating.toFixed(1)} / 5`);

  if (slope !== null) {
    // Draw only over the observed distance range, clipped to the rating domain.
    let start = Math.min(...points.map(d => d.distance_from_eiffeltower_m));
    let end = Math.max(...points.map(d => d.distance_from_eiffeltower_m));
    if (slope !== 0) {
      const bounds = [1, 5].map(rating => meanDistance + (rating - meanRating) / slope);
      start = Math.max(start, Math.min(...bounds));
      end = Math.min(end, Math.max(...bounds));
    }
    svg.append("line")
      .attr("x1", x(start))
      .attr("y1", y(predict(start)))
      .attr("x2", x(end))
      .attr("y2", y(predict(end)))
      .attr("stroke", trendColor)
      .attr("stroke-width", 2.5)
      .attr("pointer-events", "none");
  }

  const omitted = nearbyRestaurants.features.length - points.length;
  return htl.html`<figure style="margin: 0; padding: 16px 0; background: white; color: #111827; font-family: system-ui, sans-serif;">
    <h2 style="margin: 0 8px 8px; font-size: 22px;">Restaurant ratings near the Eiffel Tower</h2>
    <p style="margin: 0 8px 16px; color: #4b5563; font-size: 13px;">
      ${points.length.toLocaleString("en-US")} restaurants within 1,500 m · ${omitted.toLocaleString("en-US")} records omitted for missing or out-of-range values.
    </p>
    <p style=${{margin: "0 8px 8px", color: trendColor, fontSize: "14px", fontWeight: "600"}}>
      ${trendLabel}
    </p>
    ${svg.node()}
    <figcaption style="margin: 8px; color: #4b5563; font-size: 12px;">
      Each dot is one restaurant. Hover for its name, distance, and rating. Darker areas indicate overlapping dots.
      The orange line is an unweighted linear fit to the plotted restaurants; R² measures the fraction of rating variation explained by the fit.
    </figcaption>
  </figure>`;
})();

display(restaurantScatterplot);
