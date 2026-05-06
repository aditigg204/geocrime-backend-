import os
from pathlib import Path

import numpy as np
import pandas as pd

SELECTED_FOLDER = Path("datasets/selected")
PROCESSED_FOLDER = Path("datasets/processed")
PROCESSED_FOLDER.mkdir(parents=True, exist_ok=True)

FILES = [
    "01_District_wise_crimes_committed_IPC_2001_2012.csv",
    "01_District_wise_crimes_committed_IPC_2013.csv",
    "01_District_wise_crimes_committed_IPC_2014.csv",
]


def read_csv_safely(path: Path) -> pd.DataFrame:
    for enc in ["utf-8", "latin1", "ISO-8859-1", "cp1252"]:
        try:
            return pd.read_csv(path, encoding=enc)
        except Exception:
            pass
    return pd.read_csv(path, encoding="latin1", engine="python")


def clean_column_name(col: str) -> str:
    col = str(col).strip()
    col = col.replace("\n", " ").replace("\r", " ")
    col = col.replace("-", "_").replace("/", "_")
    col = col.replace(" ", "_")
    col = col.replace("__", "_")
    return col.lower()


def normalize_state_district(value):
    if pd.isna(value):
        return None
    value = str(value).strip()
    value = value.replace("&", "AND")
    value = " ".join(value.split())
    return value.upper()


def risk_level(score):
    if score <= 40:
        return "green"
    if score <= 70:
        return "yellow"
    return "red"


def minmax_0_100(series):
    series = pd.to_numeric(series, errors="coerce").fillna(0)
    min_val = series.min()
    max_val = series.max()
    if max_val == min_val:
        return pd.Series([0] * len(series), index=series.index)
    return ((series - min_val) / (max_val - min_val) * 100).round(2)


def main():
    frames = []

    for file_name in FILES:
        path = SELECTED_FOLDER / file_name

        if not path.exists():
            print(f"Missing file: {file_name}")
            continue

        print(f"Reading: {file_name}")
        df = read_csv_safely(path)
        df.columns = [clean_column_name(c) for c in df.columns]
        frames.append(df)

    if not frames:
        raise RuntimeError("No IPC files found in datasets/selected")

    df = pd.concat(frames, ignore_index=True)

    print("\nOriginal merged shape:", df.shape)
    print("Columns:")
    print(df.columns.tolist())

    # Standardize expected columns
    rename_map = {
        "state_ut": "state",
        "state_ut_name": "state",
        "district": "district",
        "year": "year",
    }

    df = df.rename(columns=rename_map)

    required = ["state", "district", "year"]
    for col in required:
        if col not in df.columns:
            raise ValueError(f"Required column missing: {col}")

    df["state"] = df["state"].apply(normalize_state_district)
    df["district"] = df["district"].apply(normalize_state_district)
    df["year"] = pd.to_numeric(df["year"], errors="coerce")

    df = df.dropna(subset=["state", "district", "year"])
    df["year"] = df["year"].astype(int)

    # Remove total rows because they duplicate district data
    df = df[~df["district"].str.contains("TOTAL", na=False)]

    # Convert all possible crime columns to numeric
    non_crime_cols = ["state", "district", "year"]
    crime_cols = [c for c in df.columns if c not in non_crime_cols]

    for col in crime_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # Remove columns that are completely empty/zero
    useful_crime_cols = []
    for col in crime_cols:
        if df[col].sum() > 0:
            useful_crime_cols.append(col)

    crime_cols = useful_crime_cols

    # Total crime
    if "total_ipc_crimes" in df.columns:
        df["total_crime"] = pd.to_numeric(df["total_ipc_crimes"], errors="coerce").fillna(0)
    else:
        df["total_crime"] = df[crime_cols].sum(axis=1)

    # Weighted severity score
    # Higher weights for serious crimes
    weights = {
        "murder": 5,
        "attempt_to_murder": 4,
        "culpable_homicide_not_amounting_to_murder": 5,
        "rape": 5,
        "kidnapping_abduction": 4,
        "dacoity": 4,
        "robbery": 4,
        "burglary": 3,
        "theft": 3,
        "riots": 3,
        "criminal_breach_of_trust": 3,
        "cheating": 3,
        "counterfeiting": 3,
        "arson": 4,
        "hurt_grevious_hurt": 3,
        "dowry_deaths": 5,
        "assault_on_women_with_intent_to_outrage_her_modesty": 4,
        "insult_to_modesty_of_women": 2,
        "cruelty_by_husband_or_his_relatives": 3,
        "importation_of_girls_from_foreign_countries": 5,
        "causing_death_by_negligence": 4,
    }

    df["weighted_severity_raw"] = 0

    for col in crime_cols:
        matched_weight = 1
        for key, weight in weights.items():
            if key in col:
                matched_weight = weight
                break
        df["weighted_severity_raw"] += df[col] * matched_weight

    # Current year risk score normalized
    df["risk_score"] = minmax_0_100(df["weighted_severity_raw"])
    df["risk_level"] = df["risk_score"].apply(risk_level)

    # Sort for time features
    df = df.sort_values(["state", "district", "year"])

    # Lag features
    group_cols = ["state", "district"]

    df["previous_year_total_crime"] = df.groupby(group_cols)["total_crime"].shift(1).fillna(0)
    df["previous_year_risk_score"] = df.groupby(group_cols)["risk_score"].shift(1).fillna(0)

    df["rolling_3yr_total_crime"] = (
        df.groupby(group_cols)["total_crime"]
        .transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
        .fillna(0)
    )

    df["rolling_3yr_risk_score"] = (
        df.groupby(group_cols)["risk_score"]
        .transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
        .fillna(0)
    )

    df["crime_growth_rate"] = np.where(
        df["previous_year_total_crime"] > 0,
        ((df["total_crime"] - df["previous_year_total_crime"]) / df["previous_year_total_crime"]) * 100,
        0,
    )

    df["crime_growth_rate"] = df["crime_growth_rate"].replace([np.inf, -np.inf], 0).fillna(0)

    # Target: next year risk
    df["next_year_risk_score"] = df.groupby(group_cols)["risk_score"].shift(-1)

    # Remove rows where target is missing
    model_df = df.dropna(subset=["next_year_risk_score"]).copy()

    model_df["next_year_risk_score"] = model_df["next_year_risk_score"].round(2)

    # Main driver: highest crime column for that row
    def get_main_driver(row):
        values = row[crime_cols]
        if values.sum() <= 0:
            return "unknown"
        return values.idxmax()

    model_df["main_crime_driver"] = model_df.apply(get_main_driver, axis=1)

    # Save outputs
    clean_path = PROCESSED_FOLDER / "clean_india_ipc_merged.csv"
    model_path = PROCESSED_FOLDER / "model1_india_ipc_features.csv"

    df.to_csv(clean_path, index=False)
    model_df.to_csv(model_path, index=False)

    print("\nPreparation completed.")
    print(f"Clean merged data saved: {clean_path}")
    print(f"Model features saved: {model_path}")
    print("\nFinal model dataset shape:", model_df.shape)
    print("\nYears available:", model_df["year"].min(), "to", model_df["year"].max())
    print("States:", model_df["state"].nunique())
    print("Districts:", model_df["district"].nunique())

    print("\nSample output:")
    print(
        model_df[
            [
                "state",
                "district",
                "year",
                "total_crime",
                "risk_score",
                "risk_level",
                "next_year_risk_score",
                "main_crime_driver",
            ]
        ].head(10).to_string(index=False)
    )


if __name__ == "__main__":
    main()