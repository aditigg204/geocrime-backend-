# ML Pipeline - Zone Risk Prediction Model

## 📋 Overview
This ML pipeline predicts crime risk scores for geographical zones based on historical crime data. The model uses XGBoost regression to predict the `next_year_risk_score` (0-100 scale).

## 🏗️ Architecture

```
Data Flow:
  Raw Crime Data
       ↓
  Data Loading & Cleaning
       ↓
  Feature Engineering
       ↓
  Train/Val/Test Split
       ↓
  Feature Scaling
       ↓
  Model Training (XGBoost)
       ↓
  Model Evaluation
       ↓
  Saved Artifacts (Model + Scaler + Features)
       ↓
  API Integration for Predictions
```

## 📁 Files Structure

```
ml-services/
├── config.py                      # Configuration (paths, hyperparams)
├── requirements.txt               # Python dependencies
├── utils/
│   ├── data_loader.py            # Data loading & preprocessing
│   └── model_utils.py            # Model training & evaluation
├── scripts/
│   ├── prepare_model1_india_ipc.py    # Data preparation (existing)
│   ├── train_model.py                 # Training script
│   ├── evaluate_model.py              # Evaluation & visualization
│   ├── predict_zone_risk.py           # Batch predictions
│   └── api_integration.py             # Backend API integration
├── models/                        # Saved models & scalers
├── logs/                          # Training logs & visualizations
└── datasets/
    ├── raw/                       # Original CSV files
    ├── selected/                  # Selected files for training
    └── processed/                 # Cleaned & merged data
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd ml-services
pip install -r requirements.txt
```

### 2. Prepare Data (Already Done ✓)
```bash
python scripts/prepare_model1_india_ipc.py
```
This creates `datasets/processed/clean_india_ipc_merged.csv`

### 3. Train Model
```bash
python scripts/train_model.py
```

**Output:**
- Model saved to: `models/zone_risk_model.pkl`
- Scaler saved to: `models/feature_scaler.pkl`
- Feature names saved to: `models/feature_names.pkl`

**Metrics (Example):**
```
Test Metrics:
  RMSE: 8.234
  MAE:  5.891
  R²:   0.847
```

### 4. Evaluate Model
```bash
python scripts/evaluate_model.py
```

**Generates:**
- `logs/predictions_vs_actual.png`
- `logs/residuals.png`
- `logs/feature_importance.png`

### 5. Make Predictions
```bash
python scripts/predict_zone_risk.py
```

## 📊 Features Used (23 Total)

### Crime Statistics:
- `murder`, `attempt_to_murder`
- `rape`, `kidnapping_&_abduction`
- `dacoity`, `robbery`, `burglary`
- `theft`, `riots`, `arson`
- `hurt_grevious_hurt`, `dowry_deaths`
- `assault_on_women_with_intent_to_outrage_her_modesty`
- `cruelty_by_husband_or_his_relatives`

### Aggregate Features:
- `total_crime`: Sum of all crimes
- `weighted_severity_raw`: Weighted by crime severity
- `risk_score`: Normalized risk (0-100)

### Temporal Features:
- `previous_year_total_crime`: Lag feature
- `previous_year_risk_score`: Previous risk level
- `rolling_3yr_total_crime`: 3-year rolling average
- `rolling_3yr_risk_score`: 3-year rolling risk average
- `crime_growth_rate`: YoY % change in crimes

## 🎯 Risk Classification

| Score Range | Level | Color  | Description |
|------------|-------|--------|-------------|
| 0-40      | Green | 🟢     | Low Risk    |
| 41-70     | Yellow| 🟡     | Medium Risk |
| 71-100    | Red   | 🔴     | High Risk   |

## 💻 API Integration

### Using in Backend:

```python
from ml_services.scripts.api_integration import zone_risk_api

# Single prediction
result = zone_risk_api.predict_zone_risk({
    'murder': 10,
    'rape': 5,
    'theft': 50,
    'total_crime': 200,
    # ... other features
})

# Response:
{
    'status': 'success',
    'risk_score': 45.23,
    'risk_level': 'yellow',
    'risk_category': 'Medium Risk',
    'confidence': 0.92
}

# Multiple predictions
predictions = zone_risk_api.predict_multiple_zones([
    {'zone_id': 'Z1', 'murder': 10, ...},
    {'zone_id': 'Z2', 'murder': 8, ...},
])

# 7-day forecast
forecast = zone_risk_api.get_risk_forecast_7days(
    current_features={...},
    trend='stable'  # or 'increasing' / 'decreasing'
)
```

## 🔧 Model Hyperparameters

```python
{
    'n_estimators': 100,      # Number of boosting rounds
    'max_depth': 8,           # Tree depth
    'learning_rate': 0.1,     # Step size shrinkage
    'subsample': 0.8,         # Row sampling ratio
    'colsample_bytree': 0.8,  # Column sampling ratio
    'random_state': 42
}
```

## 📈 Training Data Statistics

- **Total Records:** ~4,000+ district-year combinations
- **Training Set:** ~70% (2,800+)
- **Validation Set:** ~10% (400+)
- **Test Set:** ~20% (800+)
- **Time Period:** 2001-2014
- **Geographic Coverage:** All Indian states/districts

## ⚠️ Known Issues & Solutions

| Issue | Solution |
|-------|----------|
| Missing CSV files in selected/ | Run `prepare_model1_india_ipc.py` first |
| Model not found when predicting | Run training script: `train_model.py` |
| Out of memory on large batches | Reduce batch size or use streaming |
| Poor performance on new zones | Retrain with latest data quarterly |

## 🔄 Retraining Schedule

Recommended retraining frequency:
- **Monthly:** With latest incident reports
- **Quarterly:** Full retraining with all data
- **Yearly:** Model validation and hyperparameter tuning

## 📝 Next Steps

1. ✅ **Data Preparation:** Done
2. ✅ **Pipeline Setup:** Done
3. ⏭️ **Train Model:** `python scripts/train_model.py`
4. ⏭️ **Integrate with Backend:** Use `api_integration.py`
5. ⏭️ **API Endpoints:** Create `/api/zones/risk` endpoint
6. ⏭️ **Dashboard:** Display risk predictions on frontend

## 📞 Support

For issues or questions:
1. Check logs in `logs/` directory
2. Verify data in `datasets/processed/`
3. Review config in `config.py`
4. Run evaluation: `python scripts/evaluate_model.py`
