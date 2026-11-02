// Match this filename to the attachment in your notebook.
const restaurants = await FileAttachment("restaurants_paris.geojson").json();

const ratingColors = {
  type: "linear",
  // Smooth transitions through the centers of the requested rating bands.
  domain: [1, 1.5, 2.5, 3.5, 4.5, 5],
  range: ["#ff2020", "#ff2020", "#f6a09a", "#a6cee3", "#08306b", "#08306b"],
  interpolate: "rgb",
  clamp: true,
  label: "Average rating (out of 5)"
};

const restaurantMap = (() => {
  const mapWidth = Math.max(240, Math.min(width, 1100));
  const pointRadius = 1.6; // Increase for larger dots.
  const noRatingColor = "#d1d5db";

  const points = restaurants.features
    .filter(d => d.geometry?.type === "Point"
      && d.geometry.coordinates.slice(0, 2).length === 2
      && d.geometry.coordinates.slice(0, 2).every(Number.isFinite))
    .map(d => ({
      x: d.geometry.coordinates[0],
      y: d.geometry.coordinates[1],
      name: d.properties?.restaurant_name ?? "Unnamed restaurant",
      // Do not coerce null to zero: missing ratings are not low ratings.
      rating: Number.isFinite(d.properties?.avg_rating)
        && d.properties.avg_rating >= 1 && d.properties.avg_rating <= 5
        ? d.properties.avg_rating : null
    }));

  if (!points.length) throw new Error("No valid Point geometries found.");

  const rated = points.filter(d => d.rating !== null);
  const unrated = points.filter(d => d.rating === null);
  const domain = {
    type: "MultiPoint",
    coordinates: points.map(d => [d.x, d.y])
  };

  const map = Plot.plot({
    width: mapWidth,
    height: Math.round(mapWidth * 0.83),
    margin: 12,
    // This file is already projected in meters (EPSG:2154 / Lambert-93).
    // Preserve its shape and flip the screen y direction so north is up.
    projection: {type: "reflect-y", domain},
    color: ratingColors,
    style: {background: "white", color: "#111827"},
    marks: [
      Plot.dot(unrated, {
        x: "x", y: "y", r: pointRadius, fill: noRatingColor,
        title: d => `${d.name}\nNo rating`
      }),
      Plot.dot(rated, {
        x: "x", y: "y", r: pointRadius, fill: "rating",
        title: d => `${d.name}\nAverage rating: ${d.rating.toFixed(1)} / 5`
      })
    ]
  });

  const legend = Plot.legend({
    color: ratingColors,
    width: Math.min(mapWidth, 460),
    height: 52,
    marginLeft: 8,
    marginRight: 8,
    ticks: [1, 2, 3, 4, 5],
    tickFormat: ".0f",
    style: {background: "white", color: "#111827"}
  });

  return htl.html`<figure style=${{
    margin: "0",
    padding: "20px 0 0",
    width: `${mapWidth}px`,
    maxWidth: "100%",
    background: "white",
    color: "#111827",
    fontFamily: "system-ui, sans-serif"
  }}>
    <h2 style="margin: 0 8px 16px; font-size: 24px; line-height: 1.2; font-weight: 650;">
      Average TripAdvisor Restaurant Ratings in Paris
    </h2>
    ${legend}
    ${unrated.length ? htl.html`<div style="margin: 0 8px 10px; font-size: 11px; color: #59616d;">
      <span style=${{display: "inline-block", width: "7px", height: "7px",
        borderRadius: "50%", background: noRatingColor, marginRight: "5px"}}></span>
      No rating
    </div>` : null}
    ${map}
  </figure>`;
})();

display(restaurantMap);
