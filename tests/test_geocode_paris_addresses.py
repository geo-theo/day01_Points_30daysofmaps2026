import csv
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

from scripts.geocode_paris_addresses import (
    Geocoder, geocode_address, process_csv, retry_delay,
)


def response(score=0.95, citycode="75115", kind="housenumber", coordinates=None):
    return {"features": [{
        "geometry": {"type": "Point", "coordinates": coordinates or [2.305116, 48.846662]},
        "properties": {
            "score": score, "citycode": citycode, "type": kind,
            "label": "36 Boulevard Garibaldi 75015 Paris", "postcode": "75015",
            "id": "75115_3957_00036",
        },
    }]}


class GeocodingTests(unittest.TestCase):
    def test_coordinate_order_and_paris_arrondissements(self):
        for code in ["75056", "75101", "75115", "75120"]:
            with self.subTest(code=code):
                row = geocode_address("36 boulevard Garibaldi", Mock(search=Mock(return_value=response(citycode=code))))
                self.assertEqual(row["geocode_status"], "matched")
                self.assertEqual(row["geocode_longitude"], 2.305116)
                self.assertEqual(row["geocode_latitude"], 48.846662)

    def test_rejected_candidates_have_no_coordinates(self):
        for payload, status in [
            (response(score=0.4), "low_score"),
            (response(citycode="92012"), "outside_paris"),
            ({"features": []}, "no_match"),
            (response(coordinates=[float("nan"), 48]), "error"),
            (response(score=float("nan")), "error"),
        ]:
            with self.subTest(status=status):
                row = geocode_address("an address", Mock(search=Mock(return_value=payload)))
                self.assertEqual(row["geocode_status"], status)
                self.assertEqual(row["geocode_longitude"], "")

    def test_street_match_requires_review(self):
        row = geocode_address("Boulevard Garibaldi", Mock(search=Mock(return_value=response(kind="street"))))
        self.assertEqual(row["geocode_status"], "review_precision")
        self.assertNotEqual(row["geocode_longitude"], "")

    def test_blank_does_not_call_api(self):
        client = Mock()
        self.assertEqual(geocode_address("  ", client)["geocode_status"], "missing_address")
        client.search.assert_not_called()

    @patch("scripts.geocode_paris_addresses.time.sleep")
    @patch("scripts.geocode_paris_addresses.urlopen")
    def test_rate_limit_retry_and_duplicate_cache(self, open_url, sleep):
        open_url.side_effect = [
            HTTPError("url", 429, "Too many requests", {"Retry-After": "2"}, None),
            BytesIO(json.dumps(response()).encode()),
        ]
        client = Geocoder()
        first = client.search("36 boulevard Garibaldi")
        self.assertEqual(client.search("  36 BOULEVARD   Garibaldi  "), first)
        self.assertEqual(open_url.call_count, 2)
        self.assertIn("citycode=75056", open_url.call_args.args[0].full_url)
        sleep.assert_any_call(2)

    @patch("scripts.geocode_paris_addresses.time.sleep")
    @patch("scripts.geocode_paris_addresses.urlopen", side_effect=URLError("offline"))
    def test_connection_failure_is_recorded_and_not_cached(self, open_url, sleep):
        client = Geocoder(retries=1)
        row = geocode_address("36 boulevard Garibaldi", client)
        self.assertEqual(row["geocode_status"], "error")
        self.assertIn("offline", row["geocode_error"])
        self.assertEqual(open_url.call_count, 2)
        self.assertEqual(client.cache, {})

    @patch("scripts.geocode_paris_addresses.urlopen")
    def test_permanent_http_error_is_not_retried(self, open_url):
        open_url.side_effect = HTTPError("url", 400, "Bad request", {}, None)
        self.assertEqual(geocode_address("address", Geocoder())["geocode_status"], "error")
        self.assertEqual(open_url.call_count, 1)

    def test_retry_after_http_date(self):
        self.assertEqual(retry_delay("Wed, 21 Oct 2015 07:28:00 GMT", 2), 4)
        self.assertEqual(retry_delay("invalid", 1), 2)

    def test_csv_geojson_preserve_source_and_unmatched_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output, geo = [Path(directory) / name for name in ("in.csv", "out.csv", "out.geojson")]
            source.write_text('\ufeffid;adresse;longitude\n1;36 boulevard Garibaldi;9\n2;;8\n3;Rue égarée;7\n', encoding="utf-8")
            client = Mock(search=Mock(side_effect=[response(), {"features": []}]))
            counts = process_csv(source, output, geo, "adresse", ";", client)
            self.assertEqual(dict(counts), {"matched": 1, "missing_address": 1, "no_match": 1})
            with output.open(encoding="utf-8", newline="") as stream:
                rows = list(csv.DictReader(stream, delimiter=";"))
            self.assertEqual(len(rows), 3)
            self.assertEqual(rows[0]["longitude"], "9")
            features = json.loads(geo.read_text(encoding="utf-8"))["features"]
            self.assertEqual(features[0]["geometry"]["coordinates"], [2.305116, 48.846662])
            self.assertIsNone(features[1]["geometry"])
            self.assertIsNone(features[2]["geometry"])
            self.assertEqual(features[2]["properties"]["adresse"], "Rue égarée")

    def test_bad_headers_and_path_collisions_preserve_files(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output, geo = [Path(directory) / name for name in ("in.csv", "out.csv", "out.geojson")]
            output.write_text("keep me", encoding="utf-8")
            for header in ["wrong", "address,address", "address,geocode_status"]:
                source.write_text(header + "\n", encoding="utf-8")
                with self.assertRaises(ValueError):
                    process_csv(source, output, geo, "address", ",", Mock())
                self.assertEqual(output.read_text(encoding="utf-8"), "keep me")
            with self.assertRaises(ValueError):
                process_csv(source, source, geo, "address", ",", Mock())

    def test_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output, geo = [Path(directory) / name for name in ("in.csv", "out.csv", "out.geojson")]
            source.write_text("address\nfirst\nsecond\n", encoding="utf-8")
            client = Mock(search=Mock(return_value=response()))
            counts = process_csv(source, output, geo, "address", ",", client, limit=1)
            self.assertEqual(sum(counts.values()), 1)
            self.assertEqual(client.search.call_count, 1)


if __name__ == "__main__":
    unittest.main()
