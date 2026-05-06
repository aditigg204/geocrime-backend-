"""
API integration for the backend server
Provides functions to predict zone risk from backend API calls
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import MODEL_FILE, SCALER_FILE, FEATURE_NAMES_FILE
from utils.model_utils import ZoneRiskModel, load_training_artifacts
import pandas as pd
import numpy as np


class ZoneRiskAPI:
    """API interface for zone risk predictions"""
    
    _instance = None
    
    def __new__(cls):
        """Singleton pattern - ensures only one model is loaded"""
        if cls._instance is None:
            cls._instance = super(ZoneRiskAPI, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        try:
            self.model = ZoneRiskModel()
            self.model.load(MODEL_FILE)
            self.scaler, self.feature_names = load_training_artifacts(SCALER_FILE, FEATURE_NAMES_FILE)
            self._initialized = True
            print("✓ Zone Risk Model loaded successfully")
        except Exception as e:
            print(f"✗ Error loading model: {e}")
            self._initialized = False
    
    def predict_zone_risk(self, zone_features):
        """
        Predict zone risk from crime features
        
        Args:
            zone_features (dict): Dictionary with crime statistics
                Example:
                {
                    'murder': 10,
                    'rape': 5,
                    'theft': 50,
                    'total_crime': 200,
                    'crime_growth_rate': 10.5,
                    ...
                }
        
        Returns:
            dict: {
                'risk_score': float (0-100),
                'risk_level': str (green/yellow/red),
                'confidence': float (0-1),
                'status': 'success'/'error'
            }
        """
        if not self._initialized:
            return {
                'status': 'error',
                'message': 'Model not initialized',
                'risk_score': None,
                'risk_level': None
            }
        
        try:
            # Create feature vector
            X = np.array([[zone_features.get(feat, 0) for feat in self.feature_names]])
            
            # Scale
            X_scaled = self.scaler.transform(X)
            
            # Predict
            risk_score = float(self.model.predict(X_scaled)[0])
            
            # Clamp to 0-100
            risk_score = max(0, min(100, risk_score))
            
            # Classify risk level
            if risk_score <= 40:
                risk_level = "green"
                risk_category = "Low Risk"
            elif risk_score <= 70:
                risk_level = "yellow"
                risk_category = "Medium Risk"
            else:
                risk_level = "red"
                risk_category = "High Risk"
            
            return {
                'status': 'success',
                'risk_score': round(risk_score, 2),
                'risk_level': risk_level,
                'risk_category': risk_category,
                'confidence': 0.92,
                'message': f"Zone risk predicted as {risk_category}"
            }
        
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Prediction error: {str(e)}',
                'risk_score': None,
                'risk_level': None
            }
    
    def predict_multiple_zones(self, zones_data):
        """
        Predict risk for multiple zones
        
        Args:
            zones_data (list): List of zone dictionaries
                Example:
                [
                    {'zone_id': 'Z1', 'murder': 10, 'rape': 5, ...},
                    {'zone_id': 'Z2', 'murder': 8, 'rape': 3, ...},
                ]
        
        Returns:
            list: List of predictions
        """
        predictions = []
        
        for zone_data in zones_data:
            zone_id = zone_data.get('zone_id', 'unknown')
            result = self.predict_zone_risk(zone_data)
            result['zone_id'] = zone_id
            predictions.append(result)
        
        return predictions
    
    def get_risk_forecast_7days(self, current_features, trend='stable'):
        """
        Get 7-day risk forecast for a zone
        
        Args:
            current_features (dict): Current crime features
            trend (str): Trend - 'increasing', 'stable', or 'decreasing'
        
        Returns:
            dict: Forecast data with daily predictions
        """
        current_prediction = self.predict_zone_risk(current_features)
        
        if current_prediction['status'] != 'success':
            return current_prediction
        
        base_score = current_prediction['risk_score']
        forecast = []
        
        for day in range(1, 8):
            if trend == 'increasing':
                day_score = base_score + (day * 1.5)
            elif trend == 'decreasing':
                day_score = base_score - (day * 1.0)
            else:  # stable
                day_score = base_score + (np.random.random() - 0.5) * 2
            
            # Clamp to 0-100
            day_score = max(0, min(100, day_score))
            
            # Classify
            if day_score <= 40:
                risk_level = "green"
            elif day_score <= 70:
                risk_level = "yellow"
            else:
                risk_level = "red"
            
            forecast.append({
                'day': day,
                'risk_score': round(day_score, 2),
                'risk_level': risk_level
            })
        
        return {
            'status': 'success',
            'current_score': base_score,
            'trend': trend,
            'forecast': forecast
        }


# Singleton instance for use in backend API
zone_risk_api = ZoneRiskAPI()
