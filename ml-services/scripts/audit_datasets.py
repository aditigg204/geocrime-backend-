import os
import re
import warnings
from pathlib import Path

import pandas as pd

warnings.filterwarnings("ignore")

# Run this file from ml-services folder:
# python scripts/audit_datasets.py

DATASET_FOLDER = "datasets/raw"
OUTPUT_FOLDER = "audit_outputs"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)

LOCATION_KEYWORDS = [
    "state", "state/ut", "ut", "district", "city", "metro",
    "police station", "police_station", "ps", "zone", "area",
    "latitude", "lat", "longitude", "lng", "long"
]

TIME_KEYWORDS = [
    "year", "date", "month", "time", "period"
]

CRIME_KEYWORDS = [
    "crime", "murder", "rape", "kidnap", "abduction", "theft",
    "robbery", "burglary", "assault", "dowry", "cruelty",
    "women", "modesty", "cyber", "hurt", "riot", "trafficking",
    "importation", "ipc", "sll", "accident", "death", "missing",
    "dacoity", "arson", "cheating", "counterfeiting"
]

SUPPORT_KEYWORDS = [
    "age", "gender", "victim", "motive", "purpose", "complaint",
    "strength", "sanctioned", "actual", "police personnel",
    "arrest", "disposal", "court", "charge", "pendency"
]


def normalize_col(col):
    return str(col).strip().lower().replace("\n", " ").replace("\r", " ")


def contains_any(text, keywords):
    text = str(text).lower()
    return any(k in text for k in keywords)


def detect_year_columns(columns):
    years = []
    for col in columns:
        full_years = re.findall(r"\b(?:19|20)\d{2}\b", str(col))
        years.extend(full_years)
    return sorted(list(set(years)))


def detect_year_values(df):
    year_values = []

    for col in df.columns:
        col_norm = normalize_col(col)

        if "year" in col_norm:
            vals = pd.to_numeric(df[col], errors="coerce").dropna()
            vals = vals[(vals >= 1900) & (vals <= 2100)]
            year_values.extend(vals.astype(int).tolist())

    if not year_values:
        return None, None, 0

    return min(year_values), max(year_values), len(set(year_values))


def safe_read_csv(file_path):
    encodings = ["utf-8", "latin1", "ISO-8859-1", "cp1252"]

    for enc in encodings:
        try:
            return pd.read_csv(file_path, encoding=enc)
        except Exception:
            continue

    return pd.read_csv(file_path, encoding="latin1", engine="python")


def read_file(file_path):
    ext = file_path.suffix.lower()

    if ext == ".csv":
        return {"Sheet1": safe_read_csv(file_path)}

    if ext in [".xlsx", ".xls"]:
        try:
            return pd.read_excel(file_path, sheet_name=None)
        except Exception as e:
            return {"ERROR": str(e)}

    return {"ERROR": "Unsupported file type"}


def get_numeric_columns(df):
    numeric_cols = []

    for col in df.columns:
        series = pd.to_numeric(df[col], errors="coerce")
        if series.notna().sum() > 0:
            numeric_cols.append(col)

    return numeric_cols


def classify_file(row):
    score = 0
    reasons = []

    # Row count score
    if row["rows"] >= 5000:
        score += 20
        reasons.append("large row count")
    elif row["rows"] >= 1000:
        score += 15
        reasons.append("medium row count")
    elif row["rows"] >= 100:
        score += 8
        reasons.append("small but usable")
    else:
        reasons.append("very small file")

    # Location score
    if row["has_district"]:
        score += 25
        reasons.append("district-level data")
    elif row["has_police_station"]:
        score += 25
        reasons.append("police-station-level data")
    elif row["has_city"]:
        score += 18
        reasons.append("city-level data")
    elif row["has_state"]:
        score += 15
        reasons.append("state-level data")
    elif row["has_lat_lng"]:
        score += 20
        reasons.append("has latitude/longitude")
    else:
        reasons.append("no strong location column")

    # Time score
    if row["year_count"] >= 5:
        score += 25
        reasons.append("multi-year data")
    elif row["year_count"] >= 2:
        score += 15
        reasons.append("some year trend")
    elif row["has_year_or_date"]:
        score += 8
        reasons.append("has time field")
    else:
        reasons.append("no year/date field")

    # Crime columns score
    if row["crime_column_count"] >= 5:
        score += 20
        reasons.append("multiple crime categories")
    elif row["crime_column_count"] >= 2:
        score += 12
        reasons.append("some crime categories")
    elif row["crime_column_count"] == 1:
        score += 5
        reasons.append("only one crime category")
    else:
        reasons.append("no clear crime category columns")

    # Numeric columns score
    if row["numeric_column_count"] >= 5:
        score += 10
        reasons.append("good numeric columns")
    elif row["numeric_column_count"] >= 2:
        score += 5
        reasons.append("some numeric columns")

    # Supporting file penalty
    if row["support_column_count"] >= 3 and row["crime_column_count"] < 3:
        score -= 15
        reasons.append("mostly supporting/profile/legal-process data, not main risk training data")

    score = max(0, min(100, score))

    if score >= 75:
        verdict = "A - Best for Model 1"
    elif score >= 55:
        verdict = "B - Useful for Model 1"
    elif score >= 35:
        verdict = "C - Supporting / dashboard only"
    else:
        verdict = "D - Not useful for Model 1"

    return score, verdict, "; ".join(reasons)


def audit_dataframe(file_path, sheet_name, df):
    original_cols = list(df.columns)
    norm_cols = [normalize_col(c) for c in original_cols]

    rows = len(df)
    cols = len(df.columns)

    has_state = any("state" in c or "state/ut" in c for c in norm_cols)
    has_district = any("district" in c for c in norm_cols)
    has_city = any("city" in c or "metro" in c for c in norm_cols)
    has_police_station = any("police station" in c or "police_station" in c for c in norm_cols)

    has_lat = any(c in ["lat", "latitude"] or "latitude" in c for c in norm_cols)
    has_lng = any(c in ["lng", "long", "longitude"] or "longitude" in c for c in norm_cols)
    has_lat_lng = has_lat and has_lng

    has_year_or_date = any(contains_any(c, TIME_KEYWORDS) for c in norm_cols)

    min_year, max_year, year_count = detect_year_values(df)

    year_cols = detect_year_columns(original_cols)
    if year_cols and year_count == 0:
        year_count = len(year_cols)
        min_year = min(map(int, year_cols))
        max_year = max(map(int, year_cols))

    crime_cols = [c for c in original_cols if contains_any(c, CRIME_KEYWORDS)]
    location_cols = [c for c in original_cols if contains_any(c, LOCATION_KEYWORDS)]
    time_cols = [c for c in original_cols if contains_any(c, TIME_KEYWORDS)]
    support_cols = [c for c in original_cols if contains_any(c, SUPPORT_KEYWORDS)]
    numeric_cols = get_numeric_columns(df)

    missing_percent = round(df.isna().mean().mean() * 100, 2)

    row = {
        "file_name": file_path.name,
        "file_path": str(file_path),
        "sheet_name": sheet_name,
        "rows": rows,
        "columns": cols,
        "missing_percent": missing_percent,

        "has_state": has_state,
        "has_district": has_district,
        "has_city": has_city,
        "has_police_station": has_police_station,
        "has_lat_lng": has_lat_lng,
        "has_year_or_date": has_year_or_date,

        "min_year": min_year,
        "max_year": max_year,
        "year_count": year_count,

        "crime_column_count": len(crime_cols),
        "crime_columns": ", ".join(map(str, crime_cols[:25])),

        "location_columns": ", ".join(map(str, location_cols[:20])),
        "time_columns": ", ".join(map(str, time_cols[:10])),

        "numeric_column_count": len(numeric_cols),
        "numeric_columns": ", ".join(map(str, numeric_cols[:25])),

        "support_column_count": len(support_cols),
        "support_columns": ", ".join(map(str, support_cols[:20])),

        "sample_columns": ", ".join([str(c) for c in original_cols[:15]])
    }

    score, verdict, reasons = classify_file(row)

    row["model1_score"] = score
    row["verdict"] = verdict
    row["reasons"] = reasons

    return row


def run_audit():
    dataset_path = Path(DATASET_FOLDER)

    if not dataset_path.exists():
        print(f"Dataset folder not found: {DATASET_FOLDER}")
        print("Current working directory:", os.getcwd())
        return

    files = []
    for ext in ["*.csv", "*.xlsx", "*.xls"]:
        files.extend(dataset_path.rglob(ext))

    print(f"Found {len(files)} dataset files in {dataset_path}")

    audit_rows = []
    errors = []

    for file_path in files:
        print(f"Checking: {file_path.name}")

        try:
            sheets = read_file(file_path)

            if "ERROR" in sheets:
                errors.append({
                    "file_name": file_path.name,
                    "error": sheets["ERROR"]
                })
                continue

            for sheet_name, df in sheets.items():
                if not isinstance(df, pd.DataFrame):
                    continue

                if df.empty:
                    errors.append({
                        "file_name": file_path.name,
                        "sheet_name": sheet_name,
                        "error": "Empty sheet/file"
                    })
                    continue

                row = audit_dataframe(file_path, sheet_name, df)
                audit_rows.append(row)

        except Exception as e:
            errors.append({
                "file_name": file_path.name,
                "error": str(e)
            })

    audit_df = pd.DataFrame(audit_rows)

    if audit_df.empty:
        print("No files could be audited.")
        if errors:
            pd.DataFrame(errors).to_csv(os.path.join(OUTPUT_FOLDER, "dataset_audit_errors.csv"), index=False)
        return

    audit_df = audit_df.sort_values(
        by=["model1_score", "rows"],
        ascending=[False, False]
    )

    audit_csv = os.path.join(OUTPUT_FOLDER, "dataset_audit_report.csv")
    audit_excel = os.path.join(OUTPUT_FOLDER, "dataset_audit_report.xlsx")
    errors_csv = os.path.join(OUTPUT_FOLDER, "dataset_audit_errors.csv")

    audit_df.to_csv(audit_csv, index=False)

    with pd.ExcelWriter(audit_excel, engine="openpyxl") as writer:
        audit_df.to_excel(writer, sheet_name="Audit Report", index=False)

        audit_df[audit_df["verdict"].str.startswith("A")].to_excel(writer, sheet_name="A_Best_Model1", index=False)
        audit_df[audit_df["verdict"].str.startswith("B")].to_excel(writer, sheet_name="B_Useful_Model1", index=False)
        audit_df[audit_df["verdict"].str.startswith("C")].to_excel(writer, sheet_name="C_Supporting", index=False)
        audit_df[audit_df["verdict"].str.startswith("D")].to_excel(writer, sheet_name="D_Not_Useful", index=False)

    if errors:
        pd.DataFrame(errors).to_csv(errors_csv, index=False)

    print("\nAudit completed successfully.")
    print(f"CSV report: {audit_csv}")
    print(f"Excel report: {audit_excel}")

    print("\nTop 15 best files:")
    cols_to_show = [
        "file_name", "rows", "columns", "min_year", "max_year",
        "year_count", "crime_column_count", "model1_score", "verdict"
    ]
    print(audit_df[cols_to_show].head(15).to_string(index=False))


if __name__ == "__main__":
    run_audit()