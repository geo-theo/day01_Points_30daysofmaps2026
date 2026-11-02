"""Add planar distances from the Eiffel Tower and save restaurants as GeoJSON."""

from pathlib import Path

import geopandas as gpd


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
EIFFEL_TOWER_FILE = DATA_DIR / "eiffel_tower_point.geojson"
RESTAURANTS_FILE = DATA_DIR / "paris_restaurants_fromeiffel1500m.geojson"
OUTPUT_FILE = DATA_DIR / "paris_restaurants_eiffel_distances_2154.geojson"
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


def main():
    restaurants = gpd.read_file(RESTAURANTS_FILE)
    eiffel_tower = gpd.read_file(EIFFEL_TOWER_FILE)
    result = calculate_distances(restaurants, eiffel_tower)

    # Keep meter-based geometry and include CRS metadata for QGIS.
    # Use legacy GeoJSON because RFC 7946 requires WGS84 longitude/latitude.
    result.to_crs(METRIC_CRS).to_file(
        OUTPUT_FILE, driver="GeoJSON", index=False, RFC7946="NO"
    )
    print(f"Saved {len(result):,} restaurants to {OUTPUT_FILE} (CRS: {METRIC_CRS})")
    print(f"Euclidean distance in meters: {DISTANCE_FIELD}")


if __name__ == "__main__":
    main()
