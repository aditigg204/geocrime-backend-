import os
import re
import shutil
import warnings
from pathlib import Path

import pandas as pd

warnings.filterwarnings("ignore")

# =====================================================
# RUN LOCATION
# =====================================================
# Run this command from inside ml-services folder:
# python scripts/audit_and_select_datasets.py

RAW_FOLDER = Path("datasets/raw")
SELECTED_FOLDER = Path("datasets/selected")
AUDIT_OUTPUT_FOLDER = Path("audit_outputs")

SELECTED_FOLDER.mkdir(parents=True, exist_ok=True)
AUDIT_OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)

# =====================================================
# MANUAL SELECTED FILES FOR MODEL 1
# =====================================================
# These files will be copied from raw folder to selected folder if found.

MODEL1_SELECTED_FILES = [
    # Main Indian district-level IPC risk model
    "01_District_wise_crimes_committed_IPC_2001_2012.csv",
    "01_District_wise_crimes_committed_IPC_2013.csv",
    "01_District_wise_crimes_committed_IPC_2014.csv",

    # Geospatial city-level model
    "chicago_dataset.csv",

    # Supporting women safety model / dashboard
    "42_District_wise_crimes_committed_against_women_2001_2012.csv",
    "42_District_wise_crimes_committed_against_women_2013.csv",
    "42_District_wise_crimes_committed_against_women_2014.csv",

    # Supporting child safety analysis
    "03_District_wise_crimes_committed_against_children_2001_2012.csv",
    "03_District_wise_crimes_committed_against_children_2013.csv",
    "03_District_wise_crimes_committed_against_children_2014.csv",
]

# =====================================================
# KEYWORDS
# =====================================================

LOCATION_KEYWORDS = [
    "state", "state/ut", "ut", "district", "city", "metro",
    "police station", "police_station", "ps", "zone", "area",
    "latitude", "lat", "longitude", "lng", "long",
    "beat", "ward", "community area"
]

TIME_KEYWORDS = [
    "year", "date", "month", "time", "period"
]

CRIME_KEYWORDS = [
    "crime", "murder", "rape", "kidnap", "abduction", "theft",
    "robbery", "burglary", "assault", "dowry", "cruelty",
    "women", "modesty", "cyber", "hurt", "riot", "trafficking",
    "importation", "ipc", "sll", "accident", "death", "missing",
    "dacoity", "arson", "cheating", "counterfeiting",
    "attempt", "culpable", "grievous"
]

SUPPORT_KEYWORDS = [
    "age", "gender", "victim", "motive", "purpose", "complaint",
    "strength", "sanctioned", "actual", "police personnel",
    "arrest", "disposal", "court", "charge", "pendency",
    "trial", "conviction"
]


# =====================================================
# HELPERS
# =====================================================

def normalize_col(col):
    return str(col).strip().lower().replace("\n", " ").replace("\r", " ")


def contains_any(text, keywords):
    text = str(text).lower()
    return any(k in text for k in keywords)


def detect_year_columns(columns):
    years = []
    for col in columns:
        found = re.findall(r"\b(?:19|20)\d{2}\b", str(col))
        years.extend(found)
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

    # Row count
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

    # Location
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

    # Time
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

    # Crime columns
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

    # Numeric columns
    if row["numeric_column_count"] >= 5:
        score += 10
        reasons.append("good numeric columns")
    elif row["numeric_column_count"] >= 2:
        score += 5
        reasons.append("some numeric columns")

    # Support penalty
    if row["support_column_count"] >= 3 and row["crime_column_count"] < 3:
        score -= 15
        reasons.append("mostly supporting/profile/legal-process data")

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

    row = {
        "file_name": file_path.name,
        "file_path": str(file_path),
        "sheet_name": sheet_name,
        "rows": len(df),
        "columns": len(df.columns),
        "missing_percent": round(df.isna().mean().mean() * 100, 2),

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
        "crime_columns": ", ".join(map(str, crime_cols[:30])),

        "location_columns": ", ".join(map(str, location_cols[:20])),
        "time_columns": ", ".join(map(str, time_cols[:15])),

        "numeric_column_count": len(numeric_cols),
        "numeric_columns": ", ".join(map(str, numeric_cols[:30])),

        "support_column_count": len(support_cols),
        "support_columns": ", ".join(map(str, support_cols[:20])),

        "sample_columns": ", ".join([str(c) for c in original_cols[:20]])
    }

    score, verdict, reasons = classify_file(row)

    row["model1_score"] = score
    row["verdict"] = verdict
    row["reasons"] = reasons

    return row


# =====================================================
# AUDIT DATASETS
# =====================================================

def run_audit():
    if not RAW_FOLDER.exists():
        raise FileNotFoundError(f"Raw folder not found: {RAW_FOLDER}")

    files = []
    for ext in ["*.csv", "*.xlsx", "*.xls"]:
        files.extend(RAW_FOLDER.rglob(ext))

    print(f"Found {len(files)} files in {RAW_FOLDER}")

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
                if not isinstance(df, pd.DataFrame) or df.empty:
                    errors.append({
                        "file_name": file_path.name,
                        "sheet_name": sheet_name,
                        "error": "Empty or invalid dataframe"
                    })
                    continue

                audit_rows.append(audit_dataframe(file_path, sheet_name, df))

        except Exception as e:
            errors.append({
                "file_name": file_path.name,
                "error": str(e)
            })

    audit_df = pd.DataFrame(audit_rows)

    if audit_df.empty:
        raise RuntimeError("No dataset could be audited.")

    audit_df = audit_df.sort_values(
        by=["model1_score", "rows"],
        ascending=[False, False]
    )

    audit_csv = AUDIT_OUTPUT_FOLDER / "dataset_audit_report.csv"
    audit_excel = AUDIT_OUTPUT_FOLDER / "dataset_audit_report.xlsx"
    errors_csv = AUDIT_OUTPUT_FOLDER / "dataset_audit_errors.csv"

    audit_df.to_csv(audit_csv, index=False)

    with pd.ExcelWriter(audit_excel, engine="openpyxl") as writer:
        audit_df.to_excel(writer, sheet_name="Audit Report", index=False)
        audit_df[audit_df["verdict"].str.startswith("A")].to_excel(writer, sheet_name="A_Best_Model1", index=False)
        audit_df[audit_df["verdict"].str.startswith("B")].to_excel(writer, sheet_name="B_Useful_Model1", index=False)
        audit_df[audit_df["verdict"].str.startswith("C")].to_excel(writer, sheet_name="C_Supporting", index=False)
        audit_df[audit_df["verdict"].str.startswith("D")].to_excel(writer, sheet_name="D_Not_Useful", index=False)

    if errors:
        pd.DataFrame(errors).to_csv(errors_csv, index=False)

    print("\nAudit report created:")
    print(f"- {audit_csv}")
    print(f"- {audit_excel}")

    print("\nTop 15 best files:")
    show_cols = [
        "file_name", "rows", "columns", "min_year", "max_year",
        "year_count", "crime_column_count", "model1_score", "verdict"
    ]
    print(audit_df[show_cols].head(15).to_string(index=False))

    return audit_df


# =====================================================
# COPY SELECTED FILES
# =====================================================

def copy_selected_files(audit_df):
    print("\nCopying selected Model 1 files...")

    raw_files = {file.name.lower(): file for file in RAW_FOLDER.rglob("*") if file.is_file()}

    selected_rows = []

    for file_name in MODEL1_SELECTED_FILES:
        source_file = raw_files.get(file_name.lower())

        if source_file is None:
            print(f"NOT FOUND: {file_name}")
            selected_rows.append({
                "file_name": file_name,
                "status": "not_found",
                "source": "",
                "destination": ""
            })
            continue

        destination_file = SELECTED_FOLDER / source_file.name
        shutil.copy2(source_file, destination_file)

        print(f"COPIED: {source_file.name}")

        selected_rows.append({
            "file_name": source_file.name,
            "status": "copied",
            "source": str(source_file),
            "destination": str(destination_file)
        })

    selected_df = pd.DataFrame(selected_rows)
    selected_report = AUDIT_OUTPUT_FOLDER / "selected_files_report.csv"
    selected_df.to_csv(selected_report, index=False)

    # Also create selected audit report from main audit
    selected_audit = audit_df[
        audit_df["file_name"].str.lower().isin([f.lower() for f in MODEL1_SELECTED_FILES])
    ].copy()

    selected_audit_path = AUDIT_OUTPUT_FOLDER / "selected_dataset_audit_report.xlsx"

    if not selected_audit.empty:
        selected_audit.to_excel(selected_audit_path, index=False)

    print("\nSelected files report created:")
    print(f"- {selected_report}")
    print(f"- {selected_audit_path}")


# =====================================================
# MAIN
# =====================================================

if __name__ == "__main__":
    audit_df = run_audit()
    copy_selected_files(audit_df)

    print("\nDone.")
    print("Now check:")
    print("- datasets/selected")
    print("- audit_outputs/dataset_audit_report.xlsx")
    print("- audit_outputs/selected_files_report.csv")