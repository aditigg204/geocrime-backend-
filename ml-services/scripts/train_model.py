"""
Train zone risk prediction model
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    PROCESSED_DATA_FILE, MODEL_FILE, SCALER_FILE, FEATURE_NAMES_FILE,
    FEATURE_COLUMNS, TARGET_COLUMN, MODEL_PARAMS, TEST_SIZE, RANDOM_STATE
)
from utils.data_loader import DataLoader
from utils.model_utils import ZoneRiskModel, save_training_artifacts
import pandas as pd


def main():
    print("=" * 60)
    print("ZONE RISK PREDICTION MODEL - TRAINING PIPELINE")
    print("=" * 60)
    
    # Load and prepare data
    print("\n[1/5] Loading data...")
    loader = DataLoader(
        data_path=PROCESSED_DATA_FILE,
        feature_columns=FEATURE_COLUMNS,
        target_column=TARGET_COLUMN,
        test_size=TEST_SIZE
    )
    
    df = loader.load_data()
    X, y, available_features = loader.prepare_data(df)
    
    # Split data
    print("\n[2/5] Splitting data...")
    X_train, X_val, X_test, y_train, y_val, y_test = loader.split_data(X, y, validation_size=0.1)
    
    # Scale features
    print("\n[3/5] Scaling features...")
    X_train_scaled, X_val_scaled, X_test_scaled = loader.scale_features(
        X_train, X_val, X_test
    )
    
    # Train model
    print("\n[4/5] Training model...")
    model = ZoneRiskModel(model_params=MODEL_PARAMS)
    model.train(X_train_scaled, y_train, X_val_scaled, y_val)
    
    # Evaluate
    print("\n[5/5] Evaluating model...")
    train_metrics, y_train_pred = model.evaluate(X_train_scaled, y_train, "Train")
    val_metrics, y_val_pred = model.evaluate(X_val_scaled, y_val, "Validation")
    test_metrics, y_test_pred = model.evaluate(X_test_scaled, y_test, "Test")
    
    # Feature importance
    print("\nAnalyzing feature importance...")
    importance = model.get_feature_importance(available_features, top_k=15)
    
    # Save model and artifacts
    print("\nSaving model and artifacts...")
    model.save(MODEL_FILE)
    save_training_artifacts(loader.get_scaler(), available_features, SCALER_FILE, FEATURE_NAMES_FILE)
    
    # Summary
    print("\n" + "=" * 60)
    print("TRAINING SUMMARY")
    print("=" * 60)
    print(f"Train RMSE: {train_metrics['rmse']:.4f}")
    print(f"Val RMSE:   {val_metrics['rmse']:.4f}")
    print(f"Test RMSE:  {test_metrics['rmse']:.4f}")
    print(f"Test R²:    {test_metrics['r2']:.4f}")
    print(f"\nModels saved to:")
    print(f"  - Model: {MODEL_FILE}")
    print(f"  - Scaler: {SCALER_FILE}")
    print(f"  - Features: {FEATURE_NAMES_FILE}")
    print("=" * 60)


if __name__ == "__main__":
    main()
