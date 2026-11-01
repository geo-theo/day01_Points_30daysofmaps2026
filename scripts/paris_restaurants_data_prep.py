"""Keep Paris restaurants and remove columns not needed for mapping."""

import csv
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
INPUT_FILE = DATA_DIR / "tripadvisor_european_restaurants.csv"
OUTPUT_FILE = DATA_DIR / "paris_restaurants.csv"
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


if __name__ == "__main__":
    main()
