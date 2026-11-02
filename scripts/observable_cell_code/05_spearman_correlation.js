// Reuse nearbyRestaurants loaded by cell 04. Paste this into a separate cell.
const restaurantSpearman = (() => {
  // Match the scatterplot filtering; each restaurant has equal weight.
  const maxDistance = 1500;
  const points = nearbyRestaurants.features
    .map(d => d.properties)
    .filter(d => Number.isFinite(d?.distance_from_eiffeltower_m)
      && d.distance_from_eiffeltower_m >= 0
      && d.distance_from_eiffeltower_m <= maxDistance
      && Number.isFinite(d?.avg_rating)
      && d.avg_rating >= 1 && d.avg_rating <= 5);

  // Spearman's rho is Pearson correlation of ranks. Average ranks handle ties
  // in both distances and ratings; the shortcut based on rank differences does not.
  function averageRanks(values) {
    const sorted = values.map((value, index) => ({value, index}))
      .sort((a, b) => a.value - b.value);
    const ranks = new Array(values.length);
    for (let start = 0; start < sorted.length;) {
      let end = start + 1;
      while (end < sorted.length && sorted[end].value === sorted[start].value) ++end;
      const rank = (start + 1 + end) / 2;
      for (let i = start; i < end; ++i) ranks[sorted[i].index] = rank;
      start = end;
    }
    return ranks;
  }
  const distanceRanks = averageRanks(points.map(d => d.distance_from_eiffeltower_m));
  const ratingRanks = averageRanks(points.map(d => d.avg_rating));
  const meanRank = (points.length + 1) / 2;
  let rankSSX = 0;
  let rankSSY = 0;
  let rankSSXY = 0;
  for (let i = 0; i < points.length; ++i) {
    const dx = distanceRanks[i] - meanRank;
    const dy = ratingRanks[i] - meanRank;
    rankSSX += dx * dx;
    rankSSY += dy * dy;
    rankSSXY += dx * dy;
  }
  const spearmanRho = points.length >= 2 && rankSSX > 0 && rankSSY > 0
    ? Math.max(-1, Math.min(1, rankSSXY / Math.sqrt(rankSSX * rankSSY))) : null;
  return {rho: spearmanRho, n: points.length};
})();

display(htl.html`<section style="padding: 16px; background: white; color: #111827; font-family: system-ui, sans-serif;">
  <h3 style="margin: 0 0 8px;">Spearman’s rank correlation</h3>
  <p style="margin: 0 0 8px; font-size: 20px; font-weight: 600;">
    ρ = ${restaurantSpearman.rho === null ? "N/A" : restaurantSpearman.rho.toFixed(4)}
    · n = ${restaurantSpearman.n.toLocaleString("en-US")}
  </p>
  <p style="margin: 0; font-size: 13px; color: #4b5563;">
    Distance from the Eiffel Tower versus average restaurant rating, using average ranks for ties.
    Values range from −1 (decreasing) to +1 (increasing); values near 0 indicate little monotonic association.
    N/A indicates fewer than two observations or a constant variable.
  </p>
</section>`);
