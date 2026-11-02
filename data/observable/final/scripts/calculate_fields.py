"""Calculate restaurant distance, distance band, and review rating fields."""

from pathlib import Path
from tempfile import TemporaryDirectory

import geopandas as gpd
import pandas as pd


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
EIFFEL_TOWER_FILE = DATA_DIR / "eiffel_tower_point.geojson"
RESTAURANTS_FILE = DATA_DIR / "restaurants_paris.geojson"
DISTANCE_FIELD = "distance_from_eiffeltower_m"
METRIC_CRS = "EPSG:2154"  # RGF93 / Lambert-93: suitable for Paris, in meters.


def calculate_distances(restaurants, eiffel_tower):
    """Return a copy with 2D Euclidean distances; missing points get null distance."""
    if restaurants.crs is None or eiffel_tower.crs is None:
        raise ValueError("Both input layers must have a coordinate reference system.")
    if (
        len(eiffel_tower) != 1
        or eiffel_tower.geometry.iloc[0] is None
        or eiffel_tower.geometry.iloc[0].is_empty
        or eiffel_tower.geometry.iloc[0].geom_type != "Point"
        or not eiffel_tower.geometry.iloc[0].is_valid
    ):
        raise ValueError("The Eiffel Tower layer must contain exactly one valid point.")

    present = restaurants.geometry.notna() & ~restaurants.geometry.is_empty
    if (
        (restaurants.loc[present].geom_type != "Point").any()
        or not restaurants.loc[present].geometry.is_valid.all()
    ):
        raise ValueError("Restaurant geometries must be valid points or null.")

    # Project both layers before measuring: geographic coordinates are in degrees.
    tower_point = eiffel_tower.to_crs(METRIC_CRS).geometry.iloc[0]
    result = restaurants.copy()
    result[DISTANCE_FIELD] = restaurants.to_crs(METRIC_CRS).geometry.distance(
        tower_point
    )
    return result


def calculate_fields(restaurants, eiffel_tower):
    """Calculate distances in meters, 250 m bands, and weighted review ratings."""
    result = calculate_distances(restaurants, eiffel_tower)
    result["distance_band"] = pd.cut(
        result[DISTANCE_FIELD],
        bins=[float("-inf"), 250, 500, 750, 1000, 1250, 1500],
        labels=["<250m", "<500m", "<750m", "<1000m", "<1250m", "<1500m"],
        right=False,
    ).astype(object)

    weights = pd.Series(
        {"excellent": 5, "very_good": 4, "average": 3, "poor": 2, "terrible": 1}
    )
    reviews = result[weights.index]
    total = reviews.sum(axis=1, min_count=len(weights))
    weighted_total = reviews.mul(weights).sum(axis=1, min_count=len(weights))
    result["rating"] = weighted_total.div(total.where(total > 0))
    return result


def main():
    restaurants = gpd.read_file(RESTAURANTS_FILE)
    eiffel_tower = gpd.read_file(EIFFEL_TOWER_FILE)
    result = calculate_fields(restaurants, eiffel_tower)

    # Write beside the input first so a failed write cannot truncate the original.
    # Preserve its CRS; only the distance calculation needs projected coordinates.
    with TemporaryDirectory(dir=DATA_DIR) as temp_dir:
        temp_file = Path(temp_dir) / RESTAURANTS_FILE.name
        result.to_file(temp_file, driver="GeoJSON", index=False, RFC7946="NO")
        temp_file.replace(RESTAURANTS_FILE)
    print(f"Saved {len(result):,} restaurants to {RESTAURANTS_FILE} (CRS: {result.crs})")
    print(f"Calculated fields: {DISTANCE_FIELD}, distance_band, rating")


if __name__ == "__main__":
    main()
