"""
Data loading and preprocessing utilities
"""
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split


class DataLoader:
    """Load and preprocess data for model training"""
    
    def __init__(self, data_path, feature_columns, target_column, test_size=0.2):
        self.data_path = Path(data_path)
        self.feature_columns = feature_columns
        self.target_column = target_column
        self.test_size = test_size
        self.scaler = StandardScaler()
        
    def load_data(self):
        """Load data from CSV"""
        print(f"Loading data from {self.data_path}")
        df = pd.read_csv(self.data_path)
        print(f"Data shape: {df.shape}")
        return df
    
    def prepare_data(self, df):
        """Prepare features and target"""
        # Select features and target
        available_features = [col for col in self.feature_columns if col in df.columns]
        missing_features = set(self.feature_columns) - set(available_features)
        
        if missing_features:
            print(f"Warning: Missing features {missing_features}")
        
        X = df[available_features].copy()
        
        if self.target_column not in df.columns:
            raise ValueError(f"Target column '{self.target_column}' not found in data")
        
        y = df[self.target_column].copy()
        
        # Remove rows with NaN values
        valid_idx = ~(X.isna().any(axis=1) | y.isna())
        X = X[valid_idx]
        y = y[valid_idx]
        
        print(f"Data after removing NaN: X shape {X.shape}, y shape {y.shape}")
        print(f"Target statistics: min={y.min():.2f}, max={y.max():.2f}, mean={y.mean():.2f}")
        
        return X, y, available_features
    
    def split_data(self, X, y, validation_size=0.1):
        """Split data into train, validation, test"""
        # First split: train+val vs test
        X_temp, X_test, y_temp, y_test = train_test_split(
            X, y, test_size=self.test_size, random_state=42
        )
        
        # Second split: train vs val (from temp set)
        val_size = validation_size / (1 - self.test_size)
        X_train, X_val, y_train, y_val = train_test_split(
            X_temp, y_temp, test_size=val_size, random_state=42
        )
        
        print(f"\nData split:")
        print(f"  Train: {X_train.shape[0]} samples")
        print(f"  Val:   {X_val.shape[0]} samples")
        print(f"  Test:  {X_test.shape[0]} samples")
        
        return X_train, X_val, X_test, y_train, y_val, y_test
    
    def scale_features(self, X_train, X_val, X_test):
        """Scale features using StandardScaler"""
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_val_scaled = self.scaler.transform(X_val)
        X_test_scaled = self.scaler.transform(X_test)
        
        return X_train_scaled, X_val_scaled, X_test_scaled
    
    def get_feature_names(self):
        """Get feature names after preparation"""
        return self.feature_columns
    
    def get_scaler(self):
        """Return the fitted scaler"""
        return self.scaler
