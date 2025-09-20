import pandas as pd
import os

INPUT_FILE = 'finalfile.csv'

def final_check():
    """
    Provides a complete data quality report for the key columns in the CSV.
    """
    print(f"--- Running a full data quality check on '{INPUT_FILE}' ---")
    if not os.path.exists(INPUT_FILE):
        print(f"Error: File not found: '{INPUT_FILE}'")
        return

    try:
        df = pd.read_csv(INPUT_FILE, on_bad_lines='warn')
        total_rows = len(df)
        print(f"Successfully loaded {total_rows} rows.")
        
        columns_to_check = [
            'scientificName', 
            'eventDate', 
            'decimalLatitude', 
            'decimalLongitude'
        ]

        print("\n--- Column Report ---")
        for col in columns_to_check:
            if col in df.columns:
                non_empty_count = df[col].notna().sum()
                print(f"- Column '{col}': Found {non_empty_count} non-empty values out of {total_rows} rows.")
            else:
                print(f"- Column '{col}': NOT FOUND IN FILE.")
        
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    final_check()