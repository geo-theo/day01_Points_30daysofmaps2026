"""Keep Paris restaurants and export a CSV and a Lambert-93 GeoPackage."""

import csv
from pathlib import Path

import geopandas as gpd
import pandas as pd


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
INPUT_FILE = DATA_DIR / "tripadvisor_european_restaurants.csv"
OUTPUT_FILE = DATA_DIR / "paris_restaurants.csv"
GPKG_FILE = DATA_DIR / "paris_restaurants.gpkg"
LAYER_NAME = "paris_restaurants"
# The source longitude/latitude values are in degrees, assumed to be WGS84.
SOURCE_CRS = "EPSG:4326"
TARGET_CRS = "EPSG:2154"  # RGF93 / Lambert-93, with coordinates in meters.
COLUMNS_TO_DROP = {
    "original_location",
    "country",
    "region",
    "province",
    "city",
    "popularity_detailed",
    "popularity_generic",
    "keywords",
}


def export_geopackage():
    restaurants = pd.read_csv(OUTPUT_FILE, keep_default_na=False, na_values=[""])
    longitude = pd.to_numeric(restaurants["longitude"], errors="coerce")
    latitude = pd.to_numeric(restaurants["latitude"], errors="coerce")
    valid_coordinates = longitude.between(-180, 180) & latitude.between(-90, 90)

    # Preserve records without usable coordinates as null geometries.
    geometry = gpd.GeoSeries(None, index=restaurants.index, crs=SOURCE_CRS)
    geometry.loc[valid_coordinates] = gpd.points_from_xy(
        longitude[valid_coordinates], latitude[valid_coordinates], crs=SOURCE_CRS
    )
    restaurants_geo = gpd.GeoDataFrame(restaurants, geometry=geometry)
    # Transform the point coordinates; the original lon/lat columns stay in degrees.
    restaurants_geo = restaurants_geo.to_crs(TARGET_CRS)
    restaurants_geo.to_file(
        GPKG_FILE, layer=LAYER_NAME, driver="GPKG", index=False, mode="w"
    )

    print(
        f"Saved {len(restaurants_geo):,} Paris restaurants to {GPKG_FILE} "
        f"(layer: {LAYER_NAME}, CRS: {TARGET_CRS})"
    )
    missing_count = int((~valid_coordinates).sum())
    if missing_count:
        print(
            f"Retained {missing_count:,} restaurants with missing or invalid "
            "coordinates as null geometries."
        )


def main():
    with INPUT_FILE.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        columns = [name for name in reader.fieldnames if name not in COLUMNS_TO_DROP]

        with OUTPUT_FILE.open("w", encoding="utf-8", newline="") as destination:
            writer = csv.DictWriter(destination, fieldnames=columns, extrasaction="ignore")
            writer.writeheader()
            count = 0
            for row in reader:
                if row["city"] == "Paris":
                    writer.writerow(row)
                    count += 1

    print(f"Saved {count:,} Paris restaurants to {OUTPUT_FILE}")
    export_geopackage()


if __name__ == "__main__":
    main()
