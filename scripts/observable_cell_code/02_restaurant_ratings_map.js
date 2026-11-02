// Cell 02 — paste this entire file into one Observable JavaScript or TypeScript cell.
// Attach restaurants_paris.geojson to the notebook before running it.
import * as cell02Plot from "npm:@observablehq/plot";
import * as cell02Htl from "npm:htl";

const restaurants = await FileAttachment("restaurants_paris.geojson").json();

const ratingColors = {
  type: "linear",
  domain: [1, 1.5, 2.5, 3.5, 4.5, 5],
  range: ["#a50026", "#a50026", "#f6a09a", "#a6cee3", "#08306b", "#08306b"],
  interpolate: "rgb",
  clamp: true,
  label: "Average rating (out of 5)"
};

const restaurantMap = (() => {
  const mapWidth = Math.max(240, Math.min(width, 1100));
  const pointRadius = 1.6;
  const noRatingColor = "#d1d5db";

  const points = restaurants.features
    .filter(d => d.geometry?.type === "Point"
      && d.geometry.coordinates.slice(0, 2).length === 2
      && d.geometry.coordinates.slice(0, 2).every(Number.isFinite))
    .map(d => ({
      x: d.geometry.coordinates[0],
      y: d.geometry.coordinates[1],
      name: d.properties?.restaurant_name ?? "Unnamed restaurant",
      // Missing ratings are not low ratings.
      rating: Number.isFinite(d.properties?.rating)
        && d.properties.rating >= 1 && d.properties.rating <= 5
        ? d.properties.rating : null
    }));

  if (!points.length) throw new Error("No valid Point geometries found.");

  // SVG draws later points on top: highest ratings first, lowest ratings last.
  const rated = points.filter(d => d.rating !== null)
    .sort ( (a, b) => b.rating - a.rating );
  const unrated = points.filter(d => d.rating === null);
  const domain = {
    type: "MultiPoint",
    coordinates: points.map(d => [d.x, d.y])
  };

  const map = cell02Plot.plot({
    width: mapWidth,
    height: Math.round(mapWidth * 0.83),
    margin: 12,
    // The coordinates are in EPSG:2154 (Lambert-93); north is up.
    projection: {type: "reflect-y", domain},
    color: ratingColors,
    style: {background: "white", color: "#111827"},
    marks: [
      cell02Plot.dot(unrated, {
        x: "x", y: "y", r: pointRadius, fill: noRatingColor,
        title: d => `${d.name}\nNo rating`
      }),
      cell02Plot.dot(rated, {
        x: "x", y: "y", r: pointRadius, fill: "rating",
        title: d => `${d.name}\nAverage rating: ${d.rating.toFixed(1)} / 5`
      })
    ]
  });

  const legend = cell02Plot.legend({
    color: ratingColors,
    width: Math.min(mapWidth, 460),
    height: 52,
    marginLeft: 8,
    marginRight: 8,
    ticks: [1, 2, 3, 4, 5],
    tickFormat: ".0f",
    style: {background: "white", color: "#111827"}
  });

  return cell02Htl.html`<figure style=${{
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
    ${unrated.length ? cell02Htl.html`<div style="margin: 0 8px 10px; font-size: 11px; color: #59616d;">
      <span style=${{display: "inline-block", width: "7px", height: "7px",
        borderRadius: "50%", background: noRatingColor, marginRight: "5px"}}></span>
      No rating
    </div>` : null}
    ${map}
  </figure>`;
})();

display(restaurantMap);
