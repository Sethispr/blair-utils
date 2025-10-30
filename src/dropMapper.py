# reminder to potentially change .csv system with a pickled json instead for serialization or sqlite to match with other db's for instant queries on disk

import csv
import os
import re

# Directory and CSV paths
dir_path = r"D:\blair\blairBlender\cards"
csv_path = r"D:\blair\blairBlender\drop_mapping.csv"

# Verify paths
print(f"Checking directory: {dir_path} exists: {os.path.exists(dir_path)}")
print(f"Checking CSV: {csv_path} exists: {os.path.exists(csv_path)}")

# Load existing entries from CSV
existing = {}
try:
    if os.path.exists(csv_path):
        with open(csv_path, 'r', newline='', encoding='utf-8') as f:
            reader = csv.reader(f, lineterminator='\n')
            print("Reading existing CSV entries:")
            for row in reader:
                print(f"Row: {row}")
                if row and len(row) == 3:
                    filename, character, series = row
                    existing[filename.strip()] = (character.strip(), series.strip())
                else:
                    print(f"Skipping invalid row: {row}")
            print(f"Loaded {len(existing)} entries from CSV")
    else:
        print("CSV does not exist, will create a new one if needed")
except Exception as e:
    print(f"Error reading CSV: {e}")

# Get all files in the directory
try:
    files = [f for f in os.listdir(dir_path) if os.path.isfile(os.path.join(dir_path, f))]
    print(f"Found {len(files)} files in {dir_path}: {files}")
except Exception as e:
    print(f"Error accessing directory {dir_path}: {e}")
    files = []

# Prepare new entries
new_entries = []
for file in files:
    try:
        base, _ = os.path.splitext(file)
        base = base.strip()
        print(f"Processing file: {file}, base: {base}")
        
        if base in existing:
            print(f"Skipping {base} (already in CSV)")
            continue
        
        # Format character name
        name = re.sub(r'\d+$', '', base)
        name = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', name)
        character = name.title()
        series = ""
        
        new_entries.append([base, character, series])
        print(f"Added entry: {base}, {character}, {series}")
    except Exception as e:
        print(f"Error processing file {file}: {e}")

if new_entries:
    try:
        with open(csv_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f, lineterminator='\n')
            writer.writerows(new_entries)
        print(f"Added {len(new_entries)} new entries to {csv_path}: {new_entries}")
    except Exception as e:
        print(f"Error writing to CSV: {e}")
else:
    print("No new entries to add.")

# Check CSV for bad entries and report
try:
    with open(csv_path, 'r', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        print("\nVerifying CSV contents after writing:")
        for row in reader:
            print(f"Row: {row}")
            if len(row) != 3:
                print(f"Warning: Malformed row detected: {row}")
except Exception as e:
    print(f"Error verifying CSV: {e}")
