"""
Evaluate model performance with visualization
"""
import sys
from pathlib import Path
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    PROCESSED_DATA_FILE, MODEL_FILE, SCALER_FILE, FEATURE_NAMES_FILE,
    FEATURE_COLUMNS, TARGET_COLUMN, TEST_SIZE
)
from utils.data_loader import DataLoader
from utils.model_utils import ZoneRiskModel, load_training_artifacts


def plot_predictions_vs_actual(y_true, y_pred, set_name, save_path=None):
    """Plot predictions vs actual values"""
    plt.figure(figsize=(10, 6))
    plt.scatter(y_true, y_pred, alpha=0.6, s=30)
    
    # Perfect prediction line
    min_val = min(y_true.min(), y_pred.min())
    max_val = max(y_true.max(), y_pred.max())
    plt.plot([min_val, max_val], [min_val, max_val], 'r--', lw=2, label='Perfect Prediction')
    
    plt.xlabel('Actual Risk Score')
    plt.ylabel('Predicted Risk Score')
    plt.title(f'{set_name} Set: Predictions vs Actual')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    if save_path:
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        print(f"Plot saved to {save_path}")
    
    plt.show()


def plot_residuals(y_true, y_pred, set_name, save_path=None):
    """Plot residuals"""
    residuals = y_true - y_pred
    
    plt.figure(figsize=(12, 5))
    
    # Residuals vs predicted
    plt.subplot(1, 2, 1)
    plt.scatter(y_pred, residuals, alpha=0.6, s=30)
    plt.axhline(y=0, color='r', linestyle='--', lw=2)
    plt.xlabel('Predicted Risk Score')
    plt.ylabel('Residuals')
    plt.title(f'{set_name}: Residuals vs Predicted')
    plt.grid(True, alpha=0.3)
    
    # Histogram of residuals
    plt.subplot(1, 2, 2)
    plt.hist(residuals, bins=30, edgecolor='black', alpha=0.7)
    plt.xlabel('Residuals')
    plt.ylabel('Frequency')
    plt.title(f'{set_name}: Distribution of Residuals')
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    if save_path:
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        print(f"Plot saved to {save_path}")
    
    plt.show()


def plot_feature_importance(feature_importance, save_path=None):
    """Plot feature importance"""
    features = list(feature_importance.keys())
    importances = list(feature_importance.values())
    
    # Sort by importance
    sorted_idx = np.argsort(importances)
    features = [features[i] for i in sorted_idx]
    importances = [importances[i] for i in sorted_idx]
    
    plt.figure(figsize=(10, 8))
    plt.barh(features, importances, color='steelblue', edgecolor='black')
    plt.xlabel('Feature Importance')
    plt.title('Top Features for Zone Risk Prediction')
    plt.tight_layout()
    
    if save_path:
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        print(f"Plot saved to {save_path}")
    
    plt.show()


def main():
    print("=" * 60)
    print("MODEL EVALUATION")
    print("=" * 60)
    
    # Load data
    print("\nLoading data...")
    loader = DataLoader(
        data_path=PROCESSED_DATA_FILE,
        feature_columns=FEATURE_COLUMNS,
        target_column=TARGET_COLUMN,
        test_size=TEST_SIZE
    )
    
    df = loader.load_data()
    X, y, available_features = loader.prepare_data(df)
    X_train, X_val, X_test, y_train, y_val, y_test = loader.split_data(X, y)
    X_train_scaled, X_val_scaled, X_test_scaled = loader.scale_features(X_train, X_val, X_test)
    
    # Load model
    print("Loading model...")
    model = ZoneRiskModel()
    model.load(MODEL_FILE)
    scaler, feature_names = load_training_artifacts(SCALER_FILE, FEATURE_NAMES_FILE)
    
    # Evaluate on all sets
    print("\nEvaluating on all sets...")
    train_metrics, y_train_pred = model.evaluate(X_train_scaled, y_train, "Train")
    val_metrics, y_val_pred = model.evaluate(X_val_scaled, y_val, "Validation")
    test_metrics, y_test_pred = model.evaluate(X_test_scaled, y_test, "Test")
    
    # Feature importance
    print("\nTop Features:")
    importance = model.get_feature_importance(available_features, top_k=15)
    
    # Create visualizations
    print("\nGenerating visualizations...")
    logs_dir = Path(__file__).resolve().parent.parent / "logs"
    logs_dir.mkdir(exist_ok=True)
    
    plot_predictions_vs_actual(
        y_test, y_test_pred, "Test",
        save_path=logs_dir / "predictions_vs_actual.png"
    )
    
    plot_residuals(
        y_test, y_test_pred, "Test",
        save_path=logs_dir / "residuals.png"
    )
    
    plot_feature_importance(
        importance,
        save_path=logs_dir / "feature_importance.png"
    )
    
    # Summary report
    print("\n" + "=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    print(f"\nTrain Metrics:")
    print(f"  RMSE: {train_metrics['rmse']:.4f}")
    print(f"  MAE:  {train_metrics['mae']:.4f}")
    print(f"  R²:   {train_metrics['r2']:.4f}")
    
    print(f"\nValidation Metrics:")
    print(f"  RMSE: {val_metrics['rmse']:.4f}")
    print(f"  MAE:  {val_metrics['mae']:.4f}")
    print(f"  R²:   {val_metrics['r2']:.4f}")
    
    print(f"\nTest Metrics:")
    print(f"  RMSE: {test_metrics['rmse']:.4f}")
    print(f"  MAE:  {test_metrics['mae']:.4f}")
    print(f"  R²:   {test_metrics['r2']:.4f}")
    
    print(f"\nVisualizations saved to: {logs_dir}")
    print("=" * 60)


if __name__ == "__main__":
    main()
