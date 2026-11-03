# Analysis interpretation and md save

## Cell 05

All in-range rated restaurants have distance bands consistent with their numeric distances. All six expected rated counts match. In-range missing ratings: 81; invalid or missing distances: 0.

All bands: The test provides evidence of an increasing ordered trend (p = 0.0480; P = 0.5222, D = 0.0445). Beyond 500 m: The test does not provide sufficient evidence of an increasing ordered trend (p = 0.1976; P = 0.5117, D = 0.0234). The second analysis is exploratory; a nonsignificant result does not prove the relationship disappears. Comparing these results does not directly test whether the effects differ. Confidence intervals are not calculated.

P counts tied cross-band comparisons as half; D = 2P − 1. These are normalized pairwise measures, not correlations. The test concerns ordered differences, not necessarily a linear or continuous increase.

## Cell 08 - Generalized Additive Model

1070 rated restaurants within 1,500 m; observed distances 166–1499 m. The model uses the continuous distance and rating values.

RMSE gives larger errors more weight. Residual standard deviation uses n − EDF as an approximate residual degrees-of-freedom adjustment. R² and RMSE describe the data used to fit the curve; they do not measure out-of-sample accuracy or test whether the relationship is nonlinear. GCV and the smoothing penalty describe model fitting rather than statistical significance.

The blue line estimates the average rating at each distance; the dashed orange line is a straight-line reference. The vertical guide marks 500 m. The GAM does not control for restaurant characteristics, and the graph does not establish cause and effect. There are 9 observations within 250 m, so the curve near the tower is especially sensitive to individual restaurants. Ratings are bounded from 1 to 5, while this Gaussian model does not enforce those bounds.

## Cell 09 - Center-anchored Permutation Test

Usable restaurants: 1,070. Primary eligible radii: 325–1475 m, at 25 m intervals (minimum 20 per group).

Primary global one-sided permutation p-value: 0.0075; maximum standardized difference: 3.478 at 350 m; largest raw difference: 0.505 at 350 m. 9,999 permutations; seed 20261102.

Each point compares all restaurants at or within the radius with all restaurants outside it up to 1,500 m. These are cumulative comparisons, not 25 m ring averages. Only eligible radii are drawn; the envelope is simultaneous across the primary scan, not a pointwise interval.

Global one-sided p-value: 0.0075. Largest standardized difference: 350 m (Z = 3.478).

250 m, descriptive only: 9 inside and 1061 outside; mean inside 2.862, mean outside 4.123, difference 1.261. It is excluded from the primary inferential scan because a group is too small.

Evidence: The global test finds evidence of a positive outside-minus-inside difference at one or more eligible radii. Global p = 0.0075.

Largest differences: The maximum standardized difference is at 350 m (Z = 3.478); the largest raw difference is 0.505 rating points at 350 m. Neither radius establishes a true boundary, and the first eligible radius does not establish where an effect begins.

Simultaneous envelope: Radii above the envelope: 325 m, 350 m, 375 m, 425 m, 450 m, 475 m. At or below 500 m, 6 of 8 tested radii exceed it; above 500 m, 0 of 39 tested radii exceed it. The significant-radius pattern is consistent with a disadvantage concentrated near 500 m, but does not establish a boundary. These cumulative comparisons overlap, and a nonsignificant result beyond 500 m does not show that an effect has disappeared.

Shape: The observed difference is 0.496 at 325 m and 0.024 at 1475 m; across adjacent eligible radii it decreases 26 times and increases 20 times. A declining cumulative difference does not establish that the underlying distance–rating relationship becomes flat; the separate GAM addresses that continuous shape.

Limitations: Group sizes vary, the innermost area is sparse, and cumulative comparisons share observations. The maximum-statistic procedure accounts for the search across eligible radii. Permuting ratings assumes exchangeability across locations; spatial autocorrelation and differences in restaurant characteristics may undermine it. Association does not establish that proximity causes poorer food quality.
