"""
Model 4: 7-day zone risk forecast.

Input:
  datasets/selected/chicago_dataset.csv

Outputs:
  models/model4_7day_zone_forecast_model.pkl
  datasets/processed/model4_zone_daily_features.csv
  datasets/processed/model4_7day_zone_predictions.csv
  audit_outputs/model4_7day_forecast_metrics.json
  audit_outputs/model4_7day_feature_importance.csv
"""

import json
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import LabelEncoder

BASE_DIR = Path(__file__).resolve().parent.parent
SELECTED_DIR = BASE_DIR / "datasets" / "selected"
PROCESSED_DIR = BASE_DIR / "datasets" / "processed"
MODEL_DIR = BASE_DIR / "models"
AUDIT_DIR = BASE_DIR / "audit_outputs"

INPUT_FILE = SELECTED_DIR / "chicago_dataset.csv"
FEATURE_FILE = PROCESSED_DIR / "model4_zone_daily_features.csv"
PREDICTION_FILE = PROCESSED_DIR / "model4_7day_zone_predictions.csv"
MODEL_FILE = MODEL_DIR / "model4_7day_zone_forecast_model.pkl"
METRICS_FILE = AUDIT_DIR / "model4_7day_forecast_metrics.json"
FEATURE_IMPORTANCE_FILE = AUDIT_DIR / "model4_7day_feature_importance.csv"

MAX_INPUT_ROWS = 300000
KEEP_COLUMNS = {
    "date",
    "primary type",
    "primary_type",
    "crime_type",
    "type",
    "latitude",
    "longitude",
    "community area",
    "community_area",
    "district",
    "ward",
    "year",
}


def should_keep_column(column):
    return str(column).strip().lower() in KEEP_COLUMNS


def read_csv_safely(path):
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


def severity_for_crime(crime_type):
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


def minmax_0_100(series):
    series = pd.to_numeric(series, errors="coerce").fillna(0)
    min_value = series.min()
    max_value = series.max()
    if max_value == min_value:
        return pd.Series([0] * len(series), index=series.index)
    return ((series - min_value) / (max_value - min_value) * 100).round(2)


def future_rolling_sum(series, days=7):
    shifted = series.shift(-1)
    return shifted.iloc[::-1].rolling(days, min_periods=1).sum().iloc[::-1]


def main():
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)

    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Missing file: {INPUT_FILE}")

    print("=" * 70)
    print("MODEL 4: 7-DAY ZONE RISK FORECAST")
    print("=" * 70)

    df = normalize_columns(read_csv_safely(INPUT_FILE))
    date_col = "date" if "date" in df.columns else None
    crime_col = next((col for col in ["primary_type", "crime_type", "type"] if col in df.columns), None)
    zone_col = next((col for col in ["community_area", "district", "ward"] if col in df.columns), None)

    if not date_col or not crime_col or not zone_col:
        raise ValueError("Expected date, crime type, and community_area/district/ward columns.")

    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=[date_col, zone_col, crime_col])
    if "year" not in df.columns:
        df["year"] = df[date_col].dt.year
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    if df["year"].max() >= 2020:
        df = df[df["year"] >= 2020].copy()

    df[zone_col] = pd.to_numeric(df[zone_col], errors="coerce")
    df = df.dropna(subset=[zone_col])
    df[zone_col] = df[zone_col].astype(int)
    df["zone_id"] = df[zone_col].astype(str)
    df["crime_date"] = pd.to_datetime(df[date_col].dt.date)
    df["hour"] = df[date_col].dt.hour
    df["severity"] = df[crime_col].apply(severity_for_crime)
    df["is_night"] = df["hour"].apply(lambda hour: 1 if hour >= 20 or hour <= 5 else 0)

    if "latitude" in df.columns and "longitude" in df.columns:
        df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
        df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    else:
        df["latitude"] = np.nan
        df["longitude"] = np.nan

    print(f"Rows used: {len(df)}")
    print(f"Zone column: {zone_col}; zones: {df['zone_id'].nunique()}")

    daily = (
        df.groupby(["zone_id", "crime_date"])
        .agg(
            crime_count=("zone_id", "size"),
            severity_sum=("severity", "sum"),
            severity_avg=("severity", "mean"),
            night_crime_count=("is_night", "sum"),
            center_lat=("latitude", "mean"),
            center_lng=("longitude", "mean"),
        )
        .reset_index()
    )

    dominant = (
        df.groupby(["zone_id", "crime_date", crime_col])
        .size()
        .reset_index(name="count")
        .sort_values(["zone_id", "crime_date", "count"], ascending=[True, True, False])
        .drop_duplicates(["zone_id", "crime_date"])
        .rename(columns={crime_col: "dominant_crime_type"})
    )
    daily = daily.merge(
        dominant[["zone_id", "crime_date", "dominant_crime_type"]],
        on=["zone_id", "crime_date"],
        how="left",
    )

    zone_centers = (
        daily.groupby("zone_id")
        .agg(center_lat=("center_lat", "mean"), center_lng=("center_lng", "mean"))
        .reset_index()
    )
    all_zones = daily["zone_id"].unique()
    all_dates = pd.date_range(daily["crime_date"].min(), daily["crime_date"].max(), freq="D")
    grid = pd.MultiIndex.from_product([all_zones, all_dates], names=["zone_id", "crime_date"]).to_frame(index=False)
    daily = grid.merge(daily, on=["zone_id", "crime_date"], how="left")
    daily = daily.merge(zone_centers, on="zone_id", how="left", suffixes=("", "_zone"))
    daily["center_lat"] = daily["center_lat"].fillna(daily["center_lat_zone"])
    daily["center_lng"] = daily["center_lng"].fillna(daily["center_lng_zone"])
    daily = daily.drop(columns=["center_lat_zone", "center_lng_zone"])

    for column in ["crime_count", "severity_sum", "severity_avg", "night_crime_count"]:
        daily[column] = daily[column].fillna(0)
    daily["dominant_crime_type"] = daily["dominant_crime_type"].fillna("none")
    daily = daily.sort_values(["zone_id", "crime_date"])

    daily["day_of_week"] = daily["crime_date"].dt.dayofweek
    daily["month"] = daily["crime_date"].dt.month
    daily["is_weekend"] = (daily["day_of_week"] >= 5).astype(int)
    daily["week_of_year"] = daily["crime_date"].dt.isocalendar().week.astype(int)

    group = daily.groupby("zone_id")
    daily["crime_count_1d"] = group["crime_count"].shift(1).fillna(0)
    for days in [7, 14, 30]:
        daily[f"crime_count_{days}d"] = group["crime_count"].transform(
            lambda value: value.shift(1).rolling(days, min_periods=1).sum()
        ).fillna(0)
    for days in [7, 30]:
        daily[f"severity_sum_{days}d"] = group["severity_sum"].transform(
            lambda value: value.shift(1).rolling(days, min_periods=1).sum()
        ).fillna(0)
        daily[f"night_crime_count_{days}d"] = group["night_crime_count"].transform(
            lambda value: value.shift(1).rolling(days, min_periods=1).sum()
        ).fillna(0)

    daily["raw_daily_risk"] = (
        daily["crime_count"] * 5
        + daily["severity_sum"] * 3
        + daily["night_crime_count"] * 2
    )
    daily["daily_risk_score"] = minmax_0_100(daily["raw_daily_risk"])
    future_count = group["crime_count"].transform(lambda value: future_rolling_sum(value, 7))
    future_severity = group["severity_sum"].transform(lambda value: future_rolling_sum(value, 7))
    daily["raw_next_7d_risk"] = future_count * 5 + future_severity * 3
    daily["next_7d_risk_score"] = minmax_0_100(daily["raw_next_7d_risk"])

    cutoff = daily["crime_date"].max() - pd.Timedelta(days=7)
    model_df = daily[daily["crime_date"] <= cutoff].dropna(subset=["next_7d_risk_score"]).copy()

    zone_encoder = LabelEncoder()
    model_df["zone_encoded"] = zone_encoder.fit_transform(model_df["zone_id"].astype(str))
    feature_cols = [
        "zone_encoded",
        "day_of_week",
        "month",
        "is_weekend",
        "week_of_year",
        "crime_count_1d",
        "crime_count_7d",
        "crime_count_14d",
        "crime_count_30d",
        "severity_sum_7d",
        "severity_sum_30d",
        "night_crime_count_7d",
        "night_crime_count_30d",
        "daily_risk_score",
    ]
    model_df.to_csv(FEATURE_FILE, index=False)

    sorted_dates = sorted(model_df["crime_date"].unique())
    split_date = sorted_dates[int(len(sorted_dates) * 0.8)]
    train_df = model_df[model_df["crime_date"] < split_date].copy()
    valid_df = model_df[model_df["crime_date"] >= split_date].copy()

    x_train = train_df[feature_cols].fillna(0)
    y_train = train_df["next_7d_risk_score"]
    x_valid = valid_df[feature_cols].fillna(0)
    y_valid = valid_df["next_7d_risk_score"]

    candidates = {
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=220,
            max_depth=18,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        ),
        "GradientBoostingRegressor": GradientBoostingRegressor(
            n_estimators=220,
            learning_rate=0.05,
            max_depth=4,
            random_state=42,
        ),
    }

    results = []
    trained = {}
    for name, model in candidates.items():
        print(f"Training {name}...")
        model.fit(x_train, y_train)
        predicted = np.clip(model.predict(x_valid), 0, 100)
        result = {
            "model_name": name,
            "mae": round(float(mean_absolute_error(y_valid, predicted)), 4),
            "rmse": round(float(mean_squared_error(y_valid, predicted) ** 0.5), 4),
            "r2_score": round(float(r2_score(y_valid, predicted)), 4),
            "train_rows": int(len(x_train)),
            "validation_rows": int(len(x_valid)),
            "feature_count": int(len(feature_cols)),
        }
        print(result)
        results.append(result)
        trained[name] = model

    best_result = sorted(results, key=lambda item: item["rmse"])[0]
    best_model = trained[best_result["model_name"]]
    metrics_payload = {
        "model_name": "model4_7day_zone_forecast",
        "best_algorithm": best_result["model_name"],
        "target_column": "next_7d_risk_score",
        "created_at": datetime.now().isoformat(),
        "results": results,
        "features_used": feature_cols,
    }
    METRICS_FILE.write_text(json.dumps(metrics_payload, indent=2), encoding="utf-8")

    if hasattr(best_model, "feature_importances_"):
        pd.DataFrame(
            {"feature": feature_cols, "importance": best_model.feature_importances_}
        ).sort_values("importance", ascending=False).to_csv(FEATURE_IMPORTANCE_FILE, index=False)

    joblib.dump(
        {
            "model": best_model,
            "feature_columns": feature_cols,
            "zone_encoder": zone_encoder,
            "metrics": metrics_payload,
        },
        MODEL_FILE,
    )

    latest_date = daily["crime_date"].max()
    latest_rows = daily[daily["crime_date"] == latest_date].copy()
    latest_rows = latest_rows[latest_rows["zone_id"].isin(zone_encoder.classes_)].copy()
    latest_rows["zone_encoded"] = zone_encoder.transform(latest_rows["zone_id"].astype(str))

    prediction_rows = []
    confidence = max(0, min(1, float(best_result["r2_score"])))
    for day_ahead in range(1, 8):
        pred_date = latest_date + pd.Timedelta(days=day_ahead)
        temp = latest_rows.copy()
        temp["day_of_week"] = pred_date.dayofweek
        temp["month"] = pred_date.month
        temp["is_weekend"] = 1 if pred_date.dayofweek >= 5 else 0
        temp["week_of_year"] = int(pred_date.isocalendar().week)
        scores = np.clip(best_model.predict(temp[feature_cols].fillna(0)), 0, 100)
        for row, score in zip(temp.to_dict(orient="records"), scores):
            score = round(float(score), 2)
            prediction_rows.append(
                {
                    "zone_id": row["zone_id"],
                    "zone_name": f"Chicago Zone {row['zone_id']}",
                    "center_latitude": row.get("center_lat"),
                    "center_longitude": row.get("center_lng"),
                    "prediction_date": pred_date.date().isoformat(),
                    "predicted_risk_score": score,
                    "predicted_risk_level": risk_level(score),
                    "predicted_crime_type": row.get("dominant_crime_type") or "none",
                    "confidence_score": round(confidence, 4),
                    "model_name": "model4_7day_zone_forecast",
                    "algorithm": best_result["model_name"],
                    "created_at": datetime.now().isoformat(),
                }
            )

    pred_df = pd.DataFrame(prediction_rows)
    pred_df.to_csv(PREDICTION_FILE, index=False)
    print(json.dumps({"best": best_result, "predictions": len(pred_df)}, indent=2))


if __name__ == "__main__":
    main()
