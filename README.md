# day01_Points_30daysofmaps2026

Install the Python dependencies and run the data preparation script from the project root:

```powershell
python -m pip install geopandas pandas
python scripts/paris_restaurants_data_prep.py
```

The script filters `data/tripadvisor_european_restaurants.csv` to Paris restaurants,
removes unused columns, and writes:

- `data/paris_restaurants.csv`: the filtered attributes.
- `data/paris_restaurants.gpkg`: the `paris_restaurants` point layer in
  **EPSG:2154 (RGF93 / Lambert-93)**, with geometry coordinates in meters.

The source `longitude` and `latitude` columns contain decimal degrees (for example,
`2.3051`, `48.84666`) and are assumed to use WGS84 (EPSG:4326). These columns remain
in degrees; the point geometry is reprojected to EPSG:2154. Restaurants with missing
or invalid coordinates are retained with null geometry and counted in the console
output. Rerunning the script replaces the generated layer.

## Geocode Paris addresses

`scripts/geocode_paris_addresses.py` converts a UTF-8 CSV address column into
WGS84 longitude/latitude (EPSG:4326, decimal degrees). It uses the public
[IGN Géoplateforme address API](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/),
backed by the Base Adresse Nationale. Python 3.10+ and internet access are required;
no packages or API key are needed. Address text is sent to IGN when the script runs.

From the project root, try the included sample:

```powershell
python scripts/geocode_paris_addresses.py data/paris_addresses_example.csv
```

To geocode the existing Paris restaurant file (the default input):

```powershell
python scripts/geocode_paris_addresses.py
```

For another CSV, specify the address column and output paths:

```powershell
python scripts/geocode_paris_addresses.py data/my_addresses.csv --address-column adresse --delimiter ";" --output data/my_addresses_geocoded.csv --geojson data/my_addresses_geocoded.geojson
```

Each row should contain a street address, preferably including its Paris postcode
(75001–75020). Quote CSV fields that contain the delimiter. Searches are restricted
to Paris municipality, not the wider metropolitan area. The script also checks the
returned Paris/arrondissement INSEE code.

By default, outputs are `<input stem>_geocoded.csv` and
`<input stem>_geocoded.geojson` beside the input. Existing output files are replaced.
Both retain every processed row and its original columns, including any existing
`latitude` and `longitude`. New coordinates are named `geocode_longitude` and
`geocode_latitude`; match label, score, precision, address ID, postcode, city code,
status, and error details are also added. Inputs already containing these output
fields are rejected to prevent column overwrites.

| `geocode_status` | Meaning |
| --- | --- |
| `matched` | House-number match meeting the score threshold; still check important locations. |
| `review_precision` | Match meets the threshold but is less precise (for example, a street); coordinates are included for review. |
| `low_score` | Score below the threshold; coordinates withheld. |
| `missing_address` | Blank address; no request sent. |
| `no_match` | Service returned no candidate. |
| `outside_paris` | Returned candidate is outside Paris; coordinates withheld. |
| `error` | Request or response failed; details in `geocode_error`. |

The default minimum score is `0.6`; change it with `--min-score 0.8`. Scores are
ranking indicators, not probabilities of correctness. The script keeps the top
candidate and does not resolve ambiguous addresses automatically. Rows without
accepted coordinates have blank coordinate fields and null GeoJSON geometry.
GeoJSON point order is `[longitude, latitude]`; open it directly in QGIS or ArcGIS.
These coordinates remain in degrees, unlike the preparation script's Lambert-93
GeoPackage geometry.

Use `--limit 10` for a trial run, `--timeout 30` for a longer request timeout, and
`--retries 3` to set retries after the initial attempt. Requests run sequentially
at no more than 10 per second, with duplicate addresses cached within a run.
Temporary network errors, HTTP 429, and HTTP 5xx are retried with backoff and
`Retry-After` support. A completed run exits with code 1 if any row has an API
error, while still writing those rows; unmatched/review rows alone exit with 0.
A fatal input/file error can leave partial outputs, which should be regenerated.

Run the offline tests with:

```powershell
python -m unittest discover -s tests -v
```

