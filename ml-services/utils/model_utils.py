"""
Model training and evaluation utilities
"""
import numpy as np
import xgboost as xgb
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import joblib
from pathlib import Path


class ZoneRiskModel:
    """Zone risk prediction model wrapper"""
    
    def __init__(self, model_params=None):
        self.model_params = model_params or {}
        self.model = None
        self.training_history = {
            'train_loss': [],
            'val_loss': [],
            'epochs': []
        }
    
    def train(self, X_train, y_train, X_val, y_val, eval_metric='rmse'):
        """Train XGBoost model"""
        print("\nTraining model...")
        
        eval_set = [(X_train, y_train), (X_val, y_val)]
        
        self.model = xgb.XGBRegressor(
            **self.model_params,
            eval_metric=eval_metric
        )
        
        self.model.fit(
            X_train, y_train,
            eval_set=eval_set,
            verbose=True
        )
        
        print("Training completed!")
    
    def predict(self, X):
        """Make predictions"""
        if self.model is None:
            raise ValueError("Model not trained yet")
        return self.model.predict(X)
    
    def evaluate(self, X_test, y_test, set_name="Test"):
        """Evaluate model on test set"""
        y_pred = self.predict(X_test)
        
        mse = mean_squared_error(y_test, y_pred)
        rmse = np.sqrt(mse)
        mae = mean_absolute_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)
        
        metrics = {
            'rmse': rmse,
            'mae': mae,
            'mse': mse,
            'r2': r2
        }
        
        print(f"\n{set_name} Metrics:")
        print(f"  RMSE: {rmse:.4f}")
        print(f"  MAE:  {mae:.4f}")
        print(f"  MSE:  {mse:.4f}")
        print(f"  R²:   {r2:.4f}")
        
        return metrics, y_pred
    
    def get_feature_importance(self, feature_names, top_k=20):
        """Get feature importance"""
        if self.model is None:
            raise ValueError("Model not trained yet")
        
        importances = self.model.feature_importances_
        indices = np.argsort(importances)[::-1][:top_k]
        
        print(f"\nTop {top_k} Important Features:")
        for i, idx in enumerate(indices):
            print(f"  {i+1}. {feature_names[idx]}: {importances[idx]:.4f}")
        
        return {feature_names[idx]: importances[idx] for idx in indices}
    
    def save(self, model_path):
        """Save model to disk"""
        model_path = Path(model_path)
        model_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, model_path)
        print(f"Model saved to {model_path}")
    
    def load(self, model_path):
        """Load model from disk"""
        self.model = joblib.load(model_path)
        print(f"Model loaded from {model_path}")


def save_training_artifacts(scaler, feature_names, scaler_path, features_path):
    """Save training artifacts"""
    joblib.dump(scaler, scaler_path)
    joblib.dump(feature_names, features_path)
    print(f"Scaler saved to {scaler_path}")
    print(f"Features saved to {features_path}")


def load_training_artifacts(scaler_path, features_path):
    """Load training artifacts"""
    scaler = joblib.load(scaler_path)
    feature_names = joblib.load(features_path)
    return scaler, feature_names
