import pandas as pd
import json
import os

# --- Configuration ---
INPUT_CSV_FILE = 'finalfile.csv'
OUTPUT_JS_FILE = 'src/mockdata.js'

# --- NOTE: 'eventDate' is no longer a required column for cleaning ---
COLUMN_MAPPING = {
    'species': 'scientificName',
    'lat': 'decimalLatitude',
    'lon': 'decimalLongitude',
    'date': 'eventDate',
    'abundance': 'individualCount'
}
RECORDS_TO_PROCESS = 1500
# --- End of Configuration ---

def extract_and_format_data():
    print(f"Starting data extraction from '{INPUT_CSV_FILE}'...")
    if not os.path.exists(INPUT_CSV_FILE):
        print(f"--- ERROR: File not found: '{INPUT_CSV_FILE}' ---")
        return

    try:
        df = pd.read_csv(INPUT_CSV_FILE, on_bad_lines='warn')
        print(f"Successfully loaded data.")
    except Exception as e:
        print(f"Error reading CSV file: {e}")
        return

    df.columns = df.columns.str.strip()
    # We still need all columns to exist, even if 'eventDate' is empty
    required_csv_cols = list(COLUMN_MAPPING.values())
    if not all(col in df.columns for col in required_csv_cols):
        print(f"--- ERROR: A required column was not found. ---")
        return

    df_processed = df[required_csv_cols].rename(columns={v: k for k, v in COLUMN_MAPPING.items()})

    # --- FIX: Drop rows only if lat/lon are missing. Ignore empty dates. ---
    df_processed.dropna(subset=['lat', 'lon'], inplace=True)
    # Fill any empty date with a placeholder string
    df_processed['date'].fillna('No Date', inplace=True)

    print(f"Cleaned data contains {len(df_processed)} valid rows.")

    # We can't sort by date, so we'll just take the first records
    df_sample = df_processed.head(RECORDS_TO_PROCESS)
    print(f"Processing the first {len(df_sample)} records.")

    features = [
        {'type': 'Feature', 'properties': {'species': row['species'], 'abundance': int(row['abundance']), 'date': row['date']},
         'geometry': {'type': 'Point', 'coordinates': [row['lon'], row['lat']]}}
        for _, row in df_sample.iterrows()
    ]

    geojson_data = {'type': 'FeatureCollection', 'features': features}
    js_content = f"""// AUTO-GENERATED FILE from {INPUT_CSV_FILE}
export const eezBoundary = {{type: "FeatureCollection", features: [{{type: "Feature", properties: {{}}, geometry: {{type: "Polygon", coordinates: [[ [68.0, 7.0], [97.0, 7.0], [97.0, 22.0], [68.0, 22.0], [68.0, 7.0] ]]}}}}]}};
export const fisheriesData = {json.dumps(geojson_data, indent=2)};
"""
    os.makedirs(os.path.dirname(OUTPUT_JS_FILE), exist_ok=True)
    with open(OUTPUT_JS_FILE, 'w', encoding='utf-8') as f:
        f.write(js_content)

    print(f"\n✅ Success! Data has been extracted and saved to '{OUTPUT_JS_FILE}'.")

if __name__ == "__main__":
    extract_and_format_data()