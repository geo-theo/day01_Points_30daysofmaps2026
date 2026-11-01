"""Geocode a Paris address CSV using IGN/BAN; Python 3.10+, no dependencies."""

import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
import math
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API_URL = "https://data.geopf.fr/geocodage/search"
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
FIELDS = (
    "geocode_longitude", "geocode_latitude", "geocode_status", "geocode_score",
    "geocode_label", "geocode_type", "geocode_citycode", "geocode_postcode",
    "geocode_id", "geocode_error",
)
PARIS_CODES = {"75056"} | {f"751{i:02d}" for i in range(1, 21)}


def retry_delay(header, attempt):
    """Honor Retry-After seconds or HTTP date, otherwise use exponential backoff."""
    delay = 2 ** attempt
    if header:
        try:
            delay = max(delay, float(header))
        except ValueError:
            try:
                date = parsedate_to_datetime(header)
                delay = max(delay, (date - datetime.now(timezone.utc)).total_seconds())
            except (TypeError, ValueError, OverflowError):
                pass
    return delay if math.isfinite(delay) else 2 ** attempt


class Geocoder:
    def __init__(self, timeout=20, retries=3, interval=0.1):
        self.timeout = timeout
        self.retries = retries
        self.interval = interval
        self.last_request = None
        self.cache = {}

    def search(self, address):
        # Cache repeated addresses for this run, but never cache service failures.
        query = " ".join(address.split())
        key = query.casefold()
        if key in self.cache:
            return self.cache[key]
        params = urlencode({
            "q": query, "index": "address", "citycode": "75056",
            "limit": 1, "autocomplete": 0,
        })
        request = Request(f"{API_URL}?{params}", headers={
            "User-Agent": "paris-address-geocoder/1.0",
            "Accept": "application/json",
        })
        for attempt in range(self.retries + 1):
            if self.last_request is not None:
                time.sleep(max(0, self.interval - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    payload = json.load(response)
                if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
                    raise ValueError("API response has no features array")
                self.cache[key] = payload
                return payload
            except HTTPError as exc:
                if (exc.code == 429 or 500 <= exc.code < 600) and attempt < self.retries:
                    time.sleep(retry_delay(exc.headers.get("Retry-After"), attempt))
                    continue
                raise RuntimeError(f"Geocoder returned HTTP {exc.code}") from exc
            except (URLError, TimeoutError, OSError) as exc:
                if attempt < self.retries:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError(f"Geocoder connection failed: {exc}") from exc


def geocode_address(address, client, min_score=0.6):
    result = dict.fromkeys(FIELDS, "")
    if not address.strip():
        result["geocode_status"] = "missing_address"
        return result
    try:
        payload = client.search(address)
        if not payload["features"]:
            result["geocode_status"] = "no_match"
            return result
        feature = payload["features"][0]
        props = feature["properties"]
        score = float(props["score"])
        if not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError("API returned an invalid match score")
        for suffix, name in (
            ("label", "label"), ("type", "type"), ("citycode", "citycode"),
            ("postcode", "postcode"), ("id", "id"),
        ):
            result[f"geocode_{suffix}"] = props.get(name, "")
        result["geocode_score"] = score
        # Paris is returned as arrondissement codes 75101..75120 as well as 75056.
        if str(props.get("citycode")) not in PARIS_CODES:
            result["geocode_status"] = "outside_paris"
            return result
        geometry = feature["geometry"]
        lon, lat = map(float, geometry["coordinates"])
        if geometry["type"] != "Point" or not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("API returned invalid point coordinates")
        if score < min_score:
            result["geocode_status"] = "low_score"
            return result
        result["geocode_longitude"] = lon
        result["geocode_latitude"] = lat
        result["geocode_status"] = (
            "matched" if props.get("type") == "housenumber" else "review_precision"
        )
    except (RuntimeError, ValueError, KeyError, TypeError, IndexError) as exc:
        result["geocode_status"] = "error"
        result["geocode_error"] = str(exc)
    return result


def process_csv(input_path, output_path, geojson_path, address_column, delimiter,
                client, min_score=0.6, limit=None):
    paths = [path.resolve() for path in (input_path, output_path, geojson_path)]
    if len(set(paths)) != 3:
        raise ValueError("Input, output CSV, and GeoJSON paths must all differ")
    counts = Counter()
    with input_path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source, delimiter=delimiter)
        columns = reader.fieldnames or []
        if address_column not in columns:
            raise ValueError(f"Missing address column {address_column!r}; found {columns}")
        if len(columns) != len(set(columns)) or "" in columns:
            raise ValueError("CSV column names must be unique and nonempty")
        collisions = set(columns).intersection(FIELDS)
        if collisions:
            raise ValueError(f"Input already contains output fields: {sorted(collisions)}")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        geojson_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8", newline="") as dest, \
                geojson_path.open("w", encoding="utf-8") as geo:
            writer = csv.DictWriter(dest, fieldnames=columns + list(FIELDS), delimiter=delimiter)
            writer.writeheader()
            geo.write('{"type":"FeatureCollection","features":[\n')
            first = True
            for number, row in enumerate(reader, start=1):
                if limit is not None and number > limit:
                    break
                if None in row or any(value is None for value in row.values()):
                    raise ValueError(f"CSV record {number} has the wrong number of fields")
                result = geocode_address(row[address_column], client, min_score)
                row.update(result)
                counts[result["geocode_status"]] += 1
                writer.writerow(row)
                geometry = None
                if result["geocode_longitude"] != "":
                    geometry = {"type": "Point", "coordinates": [
                        result["geocode_longitude"], result["geocode_latitude"],
                    ]}
                if not first:
                    geo.write(',\n')
                json.dump({"type": "Feature", "geometry": geometry, "properties": row},
                          geo, ensure_ascii=False, allow_nan=False)
                first = False
                if number % 100 == 0:
                    print(f"Processed {number:,} addresses...", file=sys.stderr)
            geo.write('\n]}\n')
    return counts


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", type=Path, default=DATA_DIR / "paris_restaurants.csv")
    parser.add_argument("--address-column", default="address")
    parser.add_argument("--output", type=Path, help="Default: <input stem>_geocoded.csv")
    parser.add_argument("--geojson", type=Path, help="Default: output CSV path with .geojson extension")
    parser.add_argument("--delimiter", default=",", help="CSV separator (default: comma)")
    parser.add_argument("--min-score", type=float, default=0.6)
    parser.add_argument("--timeout", type=float, default=20)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--limit", type=int, help="Process only the first N rows for a trial run")
    args = parser.parse_args(argv)
    if not 0 <= args.min_score <= 1:
        parser.error("--min-score must be between 0 and 1")
    if not math.isfinite(args.timeout) or args.timeout <= 0 or args.retries < 0:
        parser.error("--timeout must be positive and finite; --retries must be nonnegative")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")
    if len(args.delimiter) != 1 or args.delimiter in '\r\n\0"':
        parser.error("--delimiter must be one character other than a quote, newline, or NUL")
    output = args.output or args.input.with_name(args.input.stem + "_geocoded.csv")
    geojson = args.geojson or output.with_suffix(".geojson")
    try:
        counts = process_csv(args.input, output, geojson, args.address_column,
                             args.delimiter, Geocoder(args.timeout, args.retries),
                             args.min_score, args.limit)
    except (OSError, ValueError, csv.Error) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(f"Saved {sum(counts.values()):,} rows to {output} and {geojson} (WGS84 / EPSG:4326).")
    print("; ".join(f"{status}: {count:,}" for status, count in sorted(counts.items())))
    return 1 if counts["error"] else 0


if __name__ == "__main__":
    sys.exit(main())
