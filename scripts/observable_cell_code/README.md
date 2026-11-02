# Observable notebook cells — current versions

Upload `data/observable/final/restaurants_paris.geojson` to the Observable notebook's file attachments. Keep its attachment name `restaurants_paris.geojson`.

Paste each numbered `.js` file into its own **JavaScript or TypeScript cell** in Observable Notebooks 2.0. These files now use standard declarations (`const` and `import`), compatible with the `.ts` cell mode. Observable supplies `FileAttachment`, `width`, `htl`, and `display`.

The map uses cells 1–2: the Plot import and a combined data, palette, and map cell. The combined cell explicitly awaits the attachment before using it, then calls `display(restaurantMap)`. The scatterplot uses the separate cells 3–4 described below. Both charts can coexist in the same notebook.

The filename in `FileAttachment(...)` must exactly match the notebook attachment. If it is named `restaurants_paris.geojson.geojson`, use that exact name in cell 2 (or rename the attachment to `restaurants_paris.geojson`).

| Order | File | Cell name |
| --- | --- | --- |
| 1 | [01_plot.js](01_plot.js) | `Plot` |
| 2 | [02_restaurant_map.js](02_restaurant_map.js) | `restaurants`, `ratingColors`, `restaurantMap` |

If the notebook already defines any of these names, replace that cell rather than creating a duplicate. Cell 2 displays the finished figure. Collapse the code and supporting cell for a clean presentation.

## Appearance and data

- Exact title: **Average TripAdvisor Restaurant Ratings in Paris**.
- White background; only title, legend, and points. No basemap, axes, grid, or boundary lines.
- Continuous temperature-style legend, red at 1 and blue at 5. Colors pass through bright red around 1–2, light red around 2–3, light blue around 3–4, and dark blue around 4–5. These are smooth transitions, not discrete bins; the legend and points share the same scale.
- All 17,756 valid points in the supplied file are displayed: 16,245 rated and 1,511 unrated. Unrated restaurants are light gray, drawn beneath rated points, with a matching legend key.
- Geometry is EPSG:2154 (Lambert-93), already in meters. `reflect-y` preserves equal map scale in both directions and places north at the top. Do not apply a longitude/latitude projection to these coordinates.
- Hover a point for its restaurant name and rating.
- Adjust `pointRadius` for dot size and `ratingColors` for the palette, both in cell 2. The map responds to notebook width, capped at 1,100 px.

These numbered files are the current source of truth. Update them in place for subsequent revisions; keep one final version per cell.

## Distance versus rating scatterplot

Upload `data/observable/final/restaurants_within1500m.geojson` as a notebook attachment named `restaurants_within1500m.geojson`. Paste each file below into its own JavaScript or TypeScript cell, using Observable Notebooks 2.0 syntax. These two cells can also run on their own, without the map cells.

| Order | File | Cell declarations |
| --- | --- | --- |
| 3 | [03_d3.js](03_d3.js) | `d3` |
| 4 | [04_restaurant_scatterplot.js](04_restaurant_scatterplot.js) | `nearbyRestaurants`, `restaurantScatterplot` |

If `d3` is already imported in the notebook, reuse that import instead of declaring it twice. Cell 4 awaits its attachment and explicitly displays the chart. Update these files in place when revising the scatterplot.

- X: `distance_from_eiffeltower_m`, with a fixed 0–1,500 m domain.
- Y: `avg_rating`, with a fixed 1–5 domain and half-point ticks.
- The supplied data contains 1,151 restaurants: 1,069 are plotted and 82 missing ratings are omitted. Nulls are never coerced to zero. Invalid or out-of-range values are also excluded.
- Each restaurant has one equal-size, translucent blue dot at its exact values; no jitter or aggregation. Ratings occur in half-point steps, so horizontal bands are expected and some dots overlap completely.
- An orange ordinary least squares trendline (with an intercept) uses the same plotted records, giving each restaurant equal weight. It spans the observed distance range, clipped to ratings 1–5. R² is shown above the chart to four decimal places, calculated as `1 - SS_residual / SS_total`. Constant distances suppress the fit; constant ratings or distances show R² as N/A.
- Hover a dot for its restaurant name, distance, and rating. Width responds to the notebook, up to 1,000 px. Edit `pointRadius`, `pointColor`, or `chartHeight` in cell 4 to adjust appearance.
- Uses D3 directly; no geographic projection is necessary because distance is already supplied in meters.

Scatterplot API reference: [D3 axes](https://d3js.org/d3-axis).

## Spearman's rank correlation — separate cell

Paste [05_spearman_correlation.js](05_spearman_correlation.js) into a new JavaScript or TypeScript cell. It declares `restaurantSpearman` and reuses `nearbyRestaurants` loaded by cell 4. Cell 4 retains only the scatterplot, OLS trendline, and R².

Cell 5 separately displays Spearman's ρ and the sample size, using the same distance and rating filters as cell 4. It computes Pearson correlation of average ranks, handling ties in both variables with equal weight per restaurant. The supplied data gives ρ ≈ −0.0132 for 1,069 records. Fewer than two observations or a constant variable produce N/A. No p-value is calculated. Update this file in place for subsequent Spearman revisions.

## Distance-band analysis — separate cell

Paste [06_distance_band_analysis.js](06_distance_band_analysis.js) into a new JavaScript or TypeScript cell. Attach both `eiffel_buffers.geojson` and `restaurants_within1500m.geojson` with those exact names. This cell loads its own data and requires no other numbered cells or external statistical library. It declares `distanceBandBuffers`, `distanceBandRestaurants`, and `distanceBandAnalysis`.

- Reads radii from the buffer `layer` properties (`buffer_250m`, etc.). Uses the supplied `distance_from_eiffeltower_m` attribute to assign restaurants to non-overlapping bands: [0, 250], (250, 500], (500, 750], (750, 1000], (1000, 1250], (1250, 1500]. Polygon geometries are not used for membership.
- Shows rated counts, excluded rating counts, median, Q1, and Q3. The six rated counts are 7, 51, 105, 254, 320, and 332 (total 1,069).
- Performs one omnibus Kruskal–Wallis test with average ranks and correction for ties. Uses 9,999 permutations of pooled ranks with fixed group sizes, seed 20261101, and the plus-one p-value correction. This Monte Carlo p-value avoids relying on the chi-square approximation, particularly for the small inner band. Edit `permutations` and `seed` at the top if needed.
- Verified result for the supplied files: H = 14.052694, df = 5, permutation p = 0.0125. The innermost band's median is 3.0 (n = 7); all other band medians are 4.0. The omnibus result does not establish which specific bands differ.
- Empty groups are excluded; fewer than two nonempty groups or all-identical ratings return N/A. A significant result does not identify a particular differing pair. No pairwise tests are run.
- Assumes independent restaurants and exchangeability under the null; spatial dependence is not modeled. Distance bands are observational groups, not randomized treatments. A median-shift interpretation additionally requires similarly shaped group distributions.

Methods: [Kruskal–Wallis and ties](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.kruskal.html), [randomized permutation p-values](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.permutation_test.html).

## Generalized additive model — separate cell

Paste [07_generalized_additive_model.js](07_generalized_additive_model.js) into a new JavaScript or TypeScript cell. It imports D3 as `gamD3`, loads `restaurants_within1500m.geojson`, and declares `gamRestaurants`, `restaurantGAM`, and `restaurantGAMChart`. It is independent of the other cells and needs only that attachment.

- Fits `avg_rating = intercept + s(distance_from_eiffeltower_m) + error`: a Gaussian GAM with identity link, using a cubic P-spline with 12 basis functions and a second-order coefficient-difference penalty. This is a single-predictor additive model. The fit is implemented locally in JavaScript, not through R/mgcv.
- Uses the same valid distance/rating records as cells 4–6, with equal weight per restaurant. Knots are equally spaced over the observed distance range, extended for the cubic basis. The constant and linear components are unpenalized; there is no additional intercept column because the basis already includes it.
- Solves penalized least squares by Cholesky factorization. Chooses smoothing λ by minimizing generalized cross-validation on a log grid from 10^-6 to 10^6, followed by local grid refinement. GCV is `(SSE/n)/(1-EDF/n)^2`, with total model EDF equal to the trace of the smoother matrix. Edit `basisCount` or `lambdaGrid` near the top to change fitting controls. A message appears if selection reaches a grid boundary.
- Shows observed dots, the fitted mean curve, Gaussian deviance explained (`1-SSE/SST`), total EDF (including the intercept), training RMSE, λ, and GCV. Prediction is restricted to observed distances. Gaussian fitted values are not clipped to the rating bounds. Constant ratings yield N/A for deviance explained.
- `restaurantGAM.predict(distance)` evaluates the fitted mean; `restaurantGAM.diagnostics` contains observed, fitted, and residual values for follow-up checks. No confidence intervals or significance tests are reported. GCV selects smoothing; it is not a held-out validation result. A richer basis and residual diagnostics may be needed for formal modeling.
- This treats average ratings as a numeric response with independent, constant-variance Gaussian errors. Ratings are bounded and discrete, spatial dependence is not modeled, and the fit does not establish causation.
- Verified supplied-data result: 1,069 restaurants, total EDF ≈ 5.007, λ ≈ 21.878, deviance explained ≈ 0.837%, and training RMSE ≈ 0.661. These calculations agree with an independent NumPy calculation using a closed-form cubic spline basis. Run `node --test tests/test_observable_gam.cjs` from the repository root for numerical checks, including constant, linear, nonlinear, and invalid-data cases.

Methods: [GAMs and smoothing selection](https://www.stat.ethz.ch/R-manual/R-devel/library/mgcv/html/gam.html), [P-spline bases and difference penalties](https://www.stat.ethz.ch/R-manual/R-devel/library/mgcv/html/smooth.construct.ps.smooth.spec.html).

API references: [Observable Notebooks 2.0 syntax](https://observablehq.github.io/notebook-kit/system-guide), [Observable Plot projections](https://observablehq.com/plot/features/projections), [color scales](https://observablehq.com/plot/features/scales), and [legends](https://observablehq.com/plot/features/legends).
