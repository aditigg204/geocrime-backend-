"""
Model 3: geospatial hotspot detection with DBSCAN.

Input:
  datasets/selected/chicago_dataset.csv

Outputs:
  datasets/processed/model3_hotspots.csv
  audit_outputs/model3_hotspot_summary.json
"""

import json
from datetime import datetime
from pathlib import Path

import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

BASE_DIR = Path(__file__).resolve().parent.parent
SELECTED_DIR = BASE_DIR / "datasets" / "selected"
PROCESSED_DIR = BASE_DIR / "datasets" / "processed"
AUDIT_DIR = BASE_DIR / "audit_outputs"

INPUT_FILE = SELECTED_DIR / "chicago_dataset.csv"
HOTSPOT_FILE = PROCESSED_DIR / "model3_hotspots.csv"
SUMMARY_FILE = AUDIT_DIR / "model3_hotspot_summary.json"
MAX_INPUT_ROWS = 300000

KEEP_COLUMNS = {
    "date",
    "primary type",
    "primary_type",
    "crime_type",
    "type",
    "latitude",
    "longitude",
    "district",
    "ward",
    "community area",
    "community_area",
    "year",
}


def should_keep_column(column):
    return str(column).strip().lower() in KEEP_COLUMNS


def read_csv(path):
    for encoding in ["utf-8", "latin1", "ISO-8859-1", "cp1252"]:
        try:
            return pd.read_csv(
                path,
                encoding=encoding,
                low_memory=False,
                nrows=MAX_INPUT_ROWS,
                usecols=should_keep_column,
                on_bad_lines="skip",
            )
        except Exception:
            continue
    return pd.read_csv(
        path,
        encoding="latin1",
        engine="python",
        nrows=MAX_INPUT_ROWS,
        usecols=should_keep_column,
        on_bad_lines="skip",
    )


def normalize_columns(df):
    return df.rename(
        columns={
            col: str(col).strip().lower().replace(" ", "_").replace("-", "_")
            for col in df.columns
        }
    )


def severity_for(crime_type):
    text = str(crime_type).lower()
    if any(key in text for key in ["homicide", "murder", "criminal sexual assault"]):
        return 5
    if any(key in text for key in ["robbery", "assault", "battery", "kidnapping"]):
        return 4
    if any(key in text for key in ["burglary", "theft", "motor vehicle theft"]):
        return 3
    if any(key in text for key in ["narcotics", "weapons", "stalking"]):
        return 3
    return 2


def risk_level(score):
    if score >= 71:
        return "red"
    if score >= 41:
        return "yellow"
    return "green"


def main():
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)

    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Missing Chicago dataset: {INPUT_FILE}")

    df = normalize_columns(read_csv(INPUT_FILE))
    lat_col = "latitude" if "latitude" in df.columns else None
    lng_col = "longitude" if "longitude" in df.columns else None
    crime_col = next((col for col in ["primary_type", "crime_type", "type"] if col in df.columns), None)
    if not lat_col or not lng_col or not crime_col:
        raise ValueError("Expected latitude, longitude, and primary_type/crime_type/type columns.")

    df[lat_col] = pd.to_numeric(df[lat_col], errors="coerce")
    df[lng_col] = pd.to_numeric(df[lng_col], errors="coerce")
    df = df.dropna(subset=[lat_col, lng_col])
    df = df[(df[lat_col] >= 41.5) & (df[lat_col] <= 42.1)]
    df = df[(df[lng_col] >= -88.0) & (df[lng_col] <= -87.3)]

    if "year" in df.columns:
        df["year"] = pd.to_numeric(df["year"], errors="coerce")
        recent = df[df["year"] >= 2020].copy()
        if len(recent) >= 10000:
            df = recent
    if len(df) > 300000:
        df = df.sample(300000, random_state=42)

    df["severity"] = df[crime_col].apply(severity_for)
    coords_scaled = StandardScaler().fit_transform(df[[lat_col, lng_col]].values)
    dbscan = DBSCAN(eps=0.035, min_samples=60, n_jobs=-1)
    df["cluster_id"] = dbscan.fit_predict(coords_scaled)
    clustered = df[df["cluster_id"] != -1].copy()
    if clustered.empty:
        raise RuntimeError("No hotspots found. Increase eps or reduce min_samples.")

    hotspots = []
    for cluster_id, group in clustered.groupby("cluster_id"):
        raw_score = len(group) * group["severity"].mean()
        dominant = group[crime_col].value_counts().index[0]
        hotspots.append(
            {
                "cluster_id": f"H-{int(cluster_id):04d}",
                "center_latitude": round(float(group[lat_col].mean()), 6),
                "center_longitude": round(float(group[lng_col].mean()), 6),
                "crime_count": int(len(group)),
                "dominant_crime_type": str(dominant),
                "average_severity": round(float(group["severity"].mean()), 2),
                "raw_score": round(float(raw_score), 2),
                "sample_area": str(group["district"].mode().iloc[0])
                if "district" in group.columns and not group["district"].mode().empty
                else None,
            }
        )

    hotspots_df = pd.DataFrame(hotspots)
    min_score = hotspots_df["raw_score"].min()
    max_score = hotspots_df["raw_score"].max()
    hotspots_df["risk_score"] = 50 if max_score == min_score else (
        (hotspots_df["raw_score"] - min_score) / (max_score - min_score) * 100
    ).round(2)
    hotspots_df["risk_level"] = hotspots_df["risk_score"].apply(risk_level)
    hotspots_df = hotspots_df.sort_values("risk_score", ascending=False)
    hotspots_df.to_csv(HOTSPOT_FILE, index=False)

    silhouette = None
    try:
        if clustered["cluster_id"].nunique() > 1 and len(clustered) <= 50000:
            silhouette = float(silhouette_score(coords_scaled[df["cluster_id"] != -1], clustered["cluster_id"]))
    except Exception:
        silhouette = None

    summary = {
        "model_name": "model3_hotspot_detection",
        "algorithm": "DBSCAN",
        "created_at": datetime.now().isoformat(),
        "records_used": int(len(df)),
        "clustered_records": int(len(clustered)),
        "noise_records": int(len(df[df["cluster_id"] == -1])),
        "clusters_found": int(clustered["cluster_id"].nunique()),
        "eps": 0.035,
        "min_samples": 60,
        "silhouette_score": None if silhouette is None else round(silhouette, 4),
        "top_hotspots": hotspots_df.head(10).to_dict(orient="records"),
    }
    SUMMARY_FILE.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
