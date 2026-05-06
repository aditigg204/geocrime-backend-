"""
Model 1: India IPC District-wise Risk Prediction

Input:
  datasets/processed/model1_india_ipc_features.csv

Outputs:
  models/model1_india_ipc_risk_model.pkl
  datasets/processed/model1_india_ipc_validation_predictions.csv
  datasets/processed/model1_india_ipc_future_predictions.csv
  audit_outputs/model1_india_ipc_metrics.json
  audit_outputs/model1_india_ipc_feature_importance.csv
"""

import json
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import LabelEncoder

try:
    from xgboost import XGBRegressor
    XGBOOST_AVAILABLE = True
except Exception:
    XGBOOST_AVAILABLE = False


BASE_DIR = Path(__file__).resolve().parent.parent

PROCESSED_DIR = BASE_DIR / "datasets" / "processed"
MODEL_DIR = BASE_DIR / "models"
AUDIT_DIR = BASE_DIR / "audit_outputs"

MODEL_DIR.mkdir(parents=True, exist_ok=True)
AUDIT_DIR.mkdir(parents=True, exist_ok=True)

PROCESSED_DATA_FILE = PROCESSED_DIR / "model1_india_ipc_features.csv"
MODEL_FILE = MODEL_DIR / "model1_india_ipc_risk_model.pkl"
METRICS_FILE = AUDIT_DIR / "model1_india_ipc_metrics.json"
FEATURE_IMPORTANCE_FILE = AUDIT_DIR / "model1_india_ipc_feature_importance.csv"
VALIDATION_PREDICTIONS_FILE = PROCESSED_DIR / "model1_india_ipc_validation_predictions.csv"
FUTURE_PREDICTIONS_FILE = PROCESSED_DIR / "model1_india_ipc_future_predictions.csv"


def get_risk_level(score):
    if score <= 40:
        return "green"
    if score <= 70:
        return "yellow"
    return "red"


def get_recommendation(risk_level, score, driver):
    if risk_level == "red":
        return f"High priority monitoring required. Risk score: {score:.1f}. Main driver: {driver}"
    if risk_level == "yellow":
        return f"Medium priority surveillance required. Risk score: {score:.1f}. Main driver: {driver}"
    return f"Regular monitoring required. Risk score: {score:.1f}. Main driver: {driver}"


def clean_feature_name(name):
    return (
        str(name)
        .replace("[", "_")
        .replace("]", "_")
        .replace("<", "_")
        .replace(">", "_")
        .replace(",", "_")
        .replace(" ", "_")
    )


def safe_rmse(y_true, y_pred):
    return mean_squared_error(y_true, y_pred) ** 0.5


def evaluate_model(model, X, y, set_name):
    preds = model.predict(X)
    preds = np.clip(preds, 0, 100)

    mae = mean_absolute_error(y, preds)
    rmse = safe_rmse(y, preds)
    r2 = r2_score(y, preds)

    metrics = {
        "set": set_name,
        "mae": round(float(mae), 4),
        "rmse": round(float(rmse), 4),
        "r2": round(float(r2), 4),
        "rows": int(len(y))
    }

    print(f"{set_name} Metrics:", metrics)
    return metrics, preds


def main():
    print("=" * 70)
    print("MODEL 1: INDIA IPC DISTRICT-WISE RISK PREDICTION")
    print("=" * 70)

    print("\n[1/7] Loading processed data...")

    if not PROCESSED_DATA_FILE.exists():
        raise FileNotFoundError(
            f"Processed dataset not found: {PROCESSED_DATA_FILE}\n"
            "First run: py scripts\\prepare_model1_india_ipc.py"
        )

    df = pd.read_csv(PROCESSED_DATA_FILE)

    print("Dataset loaded:", df.shape)
    print("Years:", df["year"].min(), "to", df["year"].max())

    required_columns = ["state", "district", "year", "next_year_risk_score"]

    for col in required_columns:
        if col not in df.columns:
            raise ValueError(f"Required column missing: {col}")

    df = df.dropna(subset=["next_year_risk_score"]).copy()

    print("\n[2/7] Encoding state and district...")

    state_encoder = LabelEncoder()
    district_encoder = LabelEncoder()

    df["state_encoded"] = state_encoder.fit_transform(df["state"].astype(str))
    df["district_encoded"] = district_encoder.fit_transform(df["district"].astype(str))

    exclude_columns = [
        "state",
        "district",
        "risk_level",
        "next_year_risk_score",
        "main_crime_driver",
        "source_file"
    ]

    feature_columns = []

    for col in df.columns:
        if col in exclude_columns:
            continue

        if pd.api.types.is_numeric_dtype(df[col]):
            feature_columns.append(col)

    rename_map = {col: clean_feature_name(col) for col in feature_columns}
    df = df.rename(columns=rename_map)
    feature_columns = [rename_map[col] for col in feature_columns]

    print("Total features used:", len(feature_columns))

    if len(feature_columns) == 0:
        raise ValueError("No numeric features found for training.")

    print("\n[3/7] Creating time-based train/validation split...")

    years = sorted(df["year"].unique())
    print("Available years:", years)

    if 2013 in years:
        train_df = df[df["year"] <= 2012].copy()
        valid_df = df[df["year"] == 2013].copy()
    else:
        latest_year = max(years)
        train_df = df[df["year"] < latest_year].copy()
        valid_df = df[df["year"] == latest_year].copy()

    if train_df.empty or valid_df.empty:
        raise ValueError("Train or validation data is empty. Check year values in processed dataset.")

    X_train = train_df[feature_columns].fillna(0)
    y_train = train_df["next_year_risk_score"].fillna(0)

    X_valid = valid_df[feature_columns].fillna(0)
    y_valid = valid_df["next_year_risk_score"].fillna(0)

    print("Train rows:", len(X_train))
    print("Validation rows:", len(X_valid))
    print("Validation input year:", sorted(valid_df["year"].unique()))
    print("Validation target: next_year_risk_score")

    print("\n[4/7] Training models...")

    models = {
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=300,
            max_depth=16,
            min_samples_split=4,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        ),
        "GradientBoostingRegressor": GradientBoostingRegressor(
            n_estimators=250,
            learning_rate=0.05,
            max_depth=4,
            random_state=42
        )
    }

    if XGBOOST_AVAILABLE:
        models["XGBoostRegressor"] = XGBRegressor(
            n_estimators=300,
            learning_rate=0.05,
            max_depth=6,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="reg:squarederror",
            random_state=42,
            n_jobs=-1
        )

    all_results = []
    trained_models = {}

    for model_name, model in models.items():
        print(f"\nTraining {model_name}...")

        model.fit(X_train, y_train)

        train_metrics, _ = evaluate_model(model, X_train, y_train, "train")
        valid_metrics, valid_preds = evaluate_model(model, X_valid, y_valid, "validation")

        result = {
            "model_name": model_name,
            "training_date": datetime.now().isoformat(),
            "train_rows": int(len(X_train)),
            "validation_rows": int(len(X_valid)),
            "feature_count": int(len(feature_columns)),
            "train_metrics": train_metrics,
            "validation_metrics": valid_metrics
        }

        all_results.append(result)
        trained_models[model_name] = model

    best_result = sorted(all_results, key=lambda x: x["validation_metrics"]["rmse"])[0]
    best_model_name = best_result["model_name"]
    best_model = trained_models[best_model_name]

    print("\nBest model:", best_model_name)
    print("Best validation RMSE:", best_result["validation_metrics"]["rmse"])
    print("Best validation R2:", best_result["validation_metrics"]["r2"])

    print("\n[5/7] Saving metrics and feature importance...")

    metrics_payload = {
        "model_name": "model1_india_ipc",
        "best_algorithm": best_model_name,
        "target_column": "next_year_risk_score",
        "training_date": datetime.now().isoformat(),
        "features_used": feature_columns,
        "all_model_results": all_results
    }

    with open(METRICS_FILE, "w", encoding="utf-8") as f:
        json.dump(metrics_payload, f, indent=2)

    print(f"Metrics saved: {METRICS_FILE}")

    if hasattr(best_model, "feature_importances_"):
        feature_importance_df = pd.DataFrame({
            "feature": feature_columns,
            "importance": best_model.feature_importances_
        }).sort_values("importance", ascending=False)

        feature_importance_df.to_csv(FEATURE_IMPORTANCE_FILE, index=False)

        print(f"Feature importance saved: {FEATURE_IMPORTANCE_FILE}")
        print("\nTop 15 important features:")
        print(feature_importance_df.head(15).to_string(index=False))
    else:
        feature_importance_df = pd.DataFrame()

    print("\n[6/7] Generating validation predictions...")

    valid_preds = np.clip(best_model.predict(X_valid), 0, 100)

    validation_output = valid_df.copy()

    keep_cols = [
        "state",
        "district",
        "year",
        "risk_score",
        "next_year_risk_score"
    ]

    if "main_crime_driver" in validation_output.columns:
        keep_cols.append("main_crime_driver")

    validation_output = validation_output[keep_cols].copy()

    if "main_crime_driver" not in validation_output.columns:
        validation_output["main_crime_driver"] = "unknown"

    validation_output["prediction_year"] = validation_output["year"] + 1
    validation_output["predicted_risk_score"] = np.round(valid_preds, 2)
    validation_output["predicted_risk_level"] = validation_output["predicted_risk_score"].apply(get_risk_level)
    validation_output["actual_next_year_risk_score"] = validation_output["next_year_risk_score"]
    validation_output["prediction_error"] = (
        validation_output["actual_next_year_risk_score"] - validation_output["predicted_risk_score"]
    ).round(2)

    validation_output["recommendation"] = validation_output.apply(
        lambda row: get_recommendation(
            row["predicted_risk_level"],
            row["predicted_risk_score"],
            row["main_crime_driver"]
        ),
        axis=1
    )

    validation_output["model_name"] = "model1_india_ipc"
    validation_output["algorithm"] = best_model_name
    validation_output["created_at"] = datetime.now().isoformat()

    validation_output.to_csv(VALIDATION_PREDICTIONS_FILE, index=False)

    print(f"Validation predictions saved: {VALIDATION_PREDICTIONS_FILE}")

    print("\n[7/7] Generating future predictions from latest available year...")

    latest_year = df["year"].max()
    latest_df = df[df["year"] == latest_year].copy()
    X_latest = latest_df[feature_columns].fillna(0)

    future_preds = np.clip(best_model.predict(X_latest), 0, 100)

    future_output = latest_df.copy()

    keep_cols = [
        "state",
        "district",
        "year",
        "risk_score"
    ]

    if "main_crime_driver" in future_output.columns:
        keep_cols.append("main_crime_driver")

    future_output = future_output[keep_cols].copy()

    if "main_crime_driver" not in future_output.columns:
        future_output["main_crime_driver"] = "unknown"

    future_output["prediction_year"] = future_output["year"] + 1
    future_output["predicted_risk_score"] = np.round(future_preds, 2)
    future_output["predicted_risk_level"] = future_output["predicted_risk_score"].apply(get_risk_level)

    best_r2 = best_result["validation_metrics"]["r2"]
    confidence = max(0, min(1, best_r2))

    future_output["confidence_score"] = round(float(confidence), 4)

    future_output["recommendation"] = future_output.apply(
        lambda row: get_recommendation(
            row["predicted_risk_level"],
            row["predicted_risk_score"],
            row["main_crime_driver"]
        ),
        axis=1
    )

    future_output["model_name"] = "model1_india_ipc"
    future_output["algorithm"] = best_model_name
    future_output["created_at"] = datetime.now().isoformat()

    future_output.to_csv(FUTURE_PREDICTIONS_FILE, index=False)

    print(f"Future predictions saved: {FUTURE_PREDICTIONS_FILE}")

    print("\nSaving model artifact...")

    model_package = {
        "model": best_model,
        "feature_columns": feature_columns,
        "state_encoder": state_encoder,
        "district_encoder": district_encoder,
        "best_algorithm": best_model_name,
        "metrics": metrics_payload
    }

    joblib.dump(model_package, MODEL_FILE)

    print(f"Model saved: {MODEL_FILE}")

    print("\n" + "=" * 70)
    print("TRAINING COMPLETE")
    print("=" * 70)
    print(f"Best Algorithm: {best_model_name}")
    print(f"Validation RMSE: {best_result['validation_metrics']['rmse']}")
    print(f"Validation MAE: {best_result['validation_metrics']['mae']}")
    print(f"Validation R2: {best_result['validation_metrics']['r2']}")
    print(f"Prediction file ready for PostgreSQL import:")
    print(FUTURE_PREDICTIONS_FILE)

    print("\nSample future predictions:")
    print(
        future_output[
            [
                "state",
                "district",
                "prediction_year",
                "predicted_risk_score",
                "predicted_risk_level",
                "main_crime_driver"
            ]
        ].head(20).to_string(index=False)
    )


if __name__ == "__main__":
    main()