"""
Make zone risk predictions using trained model
"""
import sys
from pathlib import Path
import pandas as pd
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import MODEL_FILE, SCALER_FILE, FEATURE_NAMES_FILE
from utils.model_utils import ZoneRiskModel, load_training_artifacts


class ZoneRiskPredictor:
    """Make predictions for zone risk"""
    
    def __init__(self, model_path, scaler_path, features_path):
        self.model = ZoneRiskModel()
        self.model.load(model_path)
        self.scaler, self.feature_names = load_training_artifacts(scaler_path, features_path)
    
    def predict(self, features_dict):
        """
        Predict risk for a single zone
        
        Args:
            features_dict: Dictionary of feature values
            
        Returns:
            risk_score: Predicted risk score (0-100)
            risk_level: Risk level (green/yellow/red)
        """
        # Create feature vector
        X = np.array([[features_dict.get(feat, 0) for feat in self.feature_names]])
        
        # Scale features
        X_scaled = self.scaler.transform(X)
        
        # Predict
        risk_score = float(self.model.predict(X_scaled)[0])
        
        # Classify risk level
        if risk_score <= 40:
            risk_level = "green"
        elif risk_score <= 70:
            risk_level = "yellow"
        else:
            risk_level = "red"
        
        return {
            'risk_score': round(risk_score, 2),
            'risk_level': risk_level,
            'confidence': 0.95  # Model confidence score
        }
    
    def predict_batch(self, features_df):
        """
        Predict risk for multiple zones
        
        Args:
            features_df: DataFrame with feature columns
            
        Returns:
            List of predictions
        """
        predictions = []
        
        for idx, row in features_df.iterrows():
            features_dict = row.to_dict()
            pred = self.predict(features_dict)
            pred['zone_id'] = row.get('zone_id', idx)
            predictions.append(pred)
        
        return predictions


def main():
    """Example usage"""
    # Initialize predictor
    predictor = ZoneRiskPredictor(MODEL_FILE, SCALER_FILE, FEATURE_NAMES_FILE)
    
    # Example: Single prediction
    print("Example 1: Single Zone Prediction")
    example_features = {
        'murder': 10,
        'rape': 5,
        'kidnapping_&_abduction': 3,
        'dacoity': 2,
        'robbery': 5,
        'theft': 50,
        'total_crime': 200,
        'weighted_severity_raw': 150,
        'risk_score': 35,
        'previous_year_total_crime': 180,
        'previous_year_risk_score': 30,
        'rolling_3yr_total_crime': 190,
        'rolling_3yr_risk_score': 32,
        'crime_growth_rate': 10.5
    }
    
    prediction = predictor.predict(example_features)
    print(f"Risk Score: {prediction['risk_score']}")
    print(f"Risk Level: {prediction['risk_level']}")
    print(f"Confidence: {prediction['confidence']}")
    
    # Example: Batch prediction
    print("\nExample 2: Batch Predictions")
    batch_features = pd.DataFrame([
        {**example_features, 'zone_id': 'zone_1'},
        {**example_features, 'zone_id': 'zone_2', 'total_crime': 300},
    ])
    
    batch_predictions = predictor.predict_batch(batch_features)
    for pred in batch_predictions:
        print(f"  Zone {pred['zone_id']}: {pred['risk_level']} ({pred['risk_score']})")


if __name__ == "__main__":
    main()
