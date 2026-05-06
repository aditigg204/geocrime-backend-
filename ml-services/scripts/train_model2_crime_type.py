"""
Model 2: India district crime-type prediction.

Input:
  datasets/processed/model1_india_ipc_features.csv

Outputs:
  models/model2_india_crime_type_model.pkl
  datasets/processed/model2_india_crime_type_predictions.csv
  audit_outputs/model2_india_crime_type_metrics.json
  audit_outputs/model2_india_crime_type_feature_importance.csv
"""

import json
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.dummy import DummyClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "datasets" / "processed"
MODEL_DIR = BASE_DIR / "models"
AUDIT_DIR = BASE_DIR / "audit_outputs"

INPUT_FILE = PROCESSED_DIR / "model1_india_ipc_features.csv"
MODEL_FILE = MODEL_DIR / "model2_india_crime_type_model.pkl"
PREDICTIONS_FILE = PROCESSED_DIR / "model2_india_crime_type_predictions.csv"
METRICS_FILE = AUDIT_DIR / "model2_india_crime_type_metrics.json"
FEATURE_IMPORTANCE_FILE = AUDIT_DIR / "model2_india_crime_type_feature_importance.csv"


def normalize_driver(value):
    if pd.isna(value):
        return "unknown"
    value = str(value).lower().strip()
    mapping = {
        "other_theft": "theft",
        "other_thefts": "theft",
        "auto_theft": "theft",
        "total_ipc_crimes": "other_ipc_crimes",
        "total_cognizable_ipc_crimes": "other_ipc_crimes",
        "kidnapping_&_abduction": "kidnapping_abduction",
        "kidnapping_&_abduction_total": "kidnapping_abduction",
        "criminal_trespass_burglary": "burglary",
        "criminal_trespass_or_burglary": "burglary",
        "hurt_grevious_hurt": "hurt",
        "grievous_hurt": "hurt",
    }
    return mapping.get(value, value)


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


def metrics_for(model, x_valid, y_valid):
    predicted = model.predict(x_valid)
    return {
        "accuracy": round(float(accuracy_score(y_valid, predicted)), 4),
        "precision": round(float(precision_score(y_valid, predicted, average="weighted", zero_division=0)), 4),
        "recall": round(float(recall_score(y_valid, predicted, average="weighted", zero_division=0)), 4),
        "f1_score": round(float(f1_score(y_valid, predicted, average="weighted", zero_division=0)), 4),
    }


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Missing input file: {INPUT_FILE}")

    df = pd.read_csv(INPUT_FILE)
    for column in ["state", "district", "year", "main_crime_driver"]:
        if column not in df.columns:
            raise ValueError(f"Missing required column: {column}")

    df = df.copy()
    df["main_crime_driver"] = df["main_crime_driver"].apply(normalize_driver)
    df = df[df["main_crime_driver"].ne("unknown")]

    valid_classes = df["main_crime_driver"].value_counts()
    df = df[df["main_crime_driver"].isin(valid_classes[valid_classes >= 20].index)].copy()

    state_encoder = LabelEncoder()
    district_encoder = LabelEncoder()
    target_encoder = LabelEncoder()
    df["state_encoded"] = state_encoder.fit_transform(df["state"].astype(str))
    df["district_encoded"] = district_encoder.fit_transform(df["district"].astype(str))
    df["target_encoded"] = target_encoder.fit_transform(df["main_crime_driver"].astype(str))

    excluded = {"state", "district", "risk_level", "main_crime_driver", "target_encoded", "source_file", "next_year_risk_score"}
    feature_cols = [col for col in df.columns if col not in excluded and pd.api.types.is_numeric_dtype(df[col])]
    rename_map = {col: clean_feature_name(col) for col in feature_cols}
    df = df.rename(columns=rename_map)
    feature_cols = [rename_map[col] for col in feature_cols]

    latest_year = int(df["year"].max())
    train_df = df[df["year"] < latest_year].copy()
    valid_df = df[df["year"] == latest_year].copy()
    use_time_split = (
        not train_df.empty
        and not valid_df.empty
        and train_df["target_encoded"].nunique() >= 2
        and valid_df["target_encoded"].nunique() >= 2
    )

    if not use_time_split:
        stratify = df["target_encoded"] if df["target_encoded"].nunique() >= 2 else None
        train_df, valid_df = train_test_split(
            df,
            test_size=0.2,
            random_state=42,
            stratify=stratify,
        )

    x_train = train_df[feature_cols].fillna(0)
    y_train = train_df["target_encoded"]
    x_valid = valid_df[feature_cols].fillna(0)
    y_valid = valid_df["target_encoded"]

    single_class_baseline = y_train.nunique() < 2
    if single_class_baseline:
        candidates = {
            "SingleClassBaseline": DummyClassifier(strategy="most_frequent")
        }
    else:
        candidates = {
            "RandomForestClassifier": RandomForestClassifier(
                n_estimators=300,
                max_depth=18,
                min_samples_split=4,
                min_samples_leaf=2,
                class_weight="balanced",
                random_state=42,
                n_jobs=-1,
            ),
            "GradientBoostingClassifier": GradientBoostingClassifier(
                n_estimators=200,
                learning_rate=0.05,
                max_depth=4,
                random_state=42,
            ),
        }

    results = []
    trained = {}
    for name, model in candidates.items():
        model.fit(x_train, y_train)
        result = {
            "model_name": name,
            "train_rows": int(len(x_train)),
            "validation_rows": int(len(x_valid)),
            "feature_count": int(len(feature_cols)),
            **metrics_for(model, x_valid, y_valid),
        }
        results.append(result)
        trained[name] = model

    best = sorted(results, key=lambda item: item["f1_score"], reverse=True)[0]
    best_model = trained[best["model_name"]]

    metrics_payload = {
        "model_name": "model2_india_crime_type",
        "best_algorithm": best["model_name"],
        "target_column": "main_crime_driver",
        "single_class_baseline": single_class_baseline,
        "warning": "Only one crime-driver class was available after filtering; collect richer labels for a real Model 2 classifier."
        if single_class_baseline
        else None,
        "training_date": datetime.now().isoformat(),
        "classes": target_encoder.classes_.tolist(),
        "features_used": feature_cols,
        "results": results,
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
            "state_encoder": state_encoder,
            "district_encoder": district_encoder,
            "target_encoder": target_encoder,
            "metrics": metrics_payload,
        },
        MODEL_FILE,
    )

    latest_df = valid_df.copy()
    x_latest = latest_df[feature_cols].fillna(0)
    predicted = best_model.predict(x_latest)
    confidence = (
        best_model.predict_proba(x_latest).max(axis=1)
        if hasattr(best_model, "predict_proba")
        else np.ones(len(x_latest)) * 0.7
    )

    out = latest_df[["state", "district", "year"]].copy()
    out["prediction_year"] = out["year"] + 1
    out["predicted_crime_type"] = target_encoder.inverse_transform(predicted)
    out["confidence_score"] = np.round(confidence, 4)
    out["model_name"] = "model2_india_crime_type"
    out["algorithm"] = best["model_name"]
    out["created_at"] = datetime.now().isoformat()
    out.to_csv(PREDICTIONS_FILE, index=False)

    print(json.dumps({"best": best, "predictions": len(out)}, indent=2))


if __name__ == "__main__":
    main()
