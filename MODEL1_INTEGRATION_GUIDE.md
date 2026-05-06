# Model 1 Backend Integration Guide

## 🚀 Complete Integration Setup

### Overview
This document shows how to integrate the Model 1 (India IPC District-wise Risk Prediction) ML model with your GeoCrime backend.

**Model Stats:**
- R² Score: 0.9542 (95.42% accuracy)
- RMSE: 1.6787 (±1.68 error on 0-100 scale)
- Training Samples: 5,974
- Test Samples: 1,707

---

## 📋 Integration Steps

### Step 1: Prepare Python Environment

```bash
cd ml-services

# Install dependencies
pip install -r requirements.txt

# Verify Python environment
python -c "import xgboost; import pandas; print('✓ Dependencies ready')"
```

### Step 2: Train and Generate Predictions

```bash
# Train model and generate predictions CSV
python scripts/train_model1_india_ipc.py
```

**Expected Output Files:**
- `models/zone_risk_model.pkl` - Trained XGBoost model
- `models/feature_scaler.pkl` - Feature scaling object
- `models/feature_names.pkl` - Feature names list
- `datasets/processed/model1_india_ipc_future_predictions.csv` - Predictions to import
- `audit_outputs/model1_india_ipc_metrics.json` - Model metrics
- `audit_outputs/model1_india_ipc_feature_importance.csv` - Feature importance

### Step 3: Update Prisma Schema

```bash
cd ../  # Go back to backend root

# Apply schema changes
npx prisma migrate dev --name add_ml_predictions

# Generate Prisma client
npx prisma generate
```

### Step 4: Import Predictions to Database

```bash
# Import predictions CSV to PostgreSQL
node scripts/importModel1Predictions.js
```

**Expected Output:**
```
============================================================
IMPORTING MODEL 1 PREDICTIONS TO DATABASE
============================================================

[1/3] Reading CSV file...
  ✓ Total rows read: 8535

[2/3] Inserting predictions into database...
  ✓ Inserted/Updated: 8535 predictions

[3/3] Database statistics...

  Risk Level Distribution:
    🔴 RED: 1245
    🟡 YELLOW: 2890
    🟢 GREEN: 4400

  Average Risk Score: 6.65/100
  States Covered: 28
  Total Predictions: 8535

============================================================
✓ IMPORT COMPLETED SUCCESSFULLY
============================================================
```

### Step 5: Start Backend

```bash
# Start Node.js backend
npm start
```

---

## 📡 API Endpoints

### 1. Get All District Predictions

**GET** `/api/ml/predictions/india-district-risk`

**Query Parameters:**
- `state` (optional): Filter by state
- `district` (optional): Filter by district
- `riskLevel` (optional): Filter by risk level (red/yellow/green)
- `limit` (optional): Number of results (default: 100)

**Example:**
```bash
curl "http://localhost:5000/api/ml/predictions/india-district-risk?state=DELHI&riskLevel=red"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "DELHI_NEW DELHI_2015_model1_india_ipc",
      "state": "DELHI",
      "district": "NEW DELHI",
      "predictionYear": 2015,
      "predictedRiskScore": 82.5,
      "predictedRiskLevel": "red",
      "mainCrimeDriver": "theft",
      "recommendation": "High priority monitoring required (Risk: 82.5)",
      "confidenceScore": 0.9542,
      "createdAt": "2026-05-02T..."
    }
  ],
  "count": 15
}
```

### 2. Get Specific District Risk

**GET** `/api/ml/predictions/india-district-risk/:district`

**Query Parameters:**
- `state` (optional): Specify state for disambiguation

**Example:**
```bash
curl "http://localhost:5000/api/ml/predictions/india-district-risk/NEW%20DELHI?state=DELHI"
```

### 3. Get Highest Risk Districts

**GET** `/api/ml/predictions/highest-risk`

**Query Parameters:**
- `limit` (optional): Number of results (default: 10)

**Example:**
```bash
curl "http://localhost:5000/api/ml/predictions/highest-risk?limit=5"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "state": "MAHARASHTRA",
      "district": "MUMBAI",
      "predictedRiskScore": 92.3,
      "predictedRiskLevel": "red",
      "mainCrimeDriver": "robbery",
      "recommendation": "High priority monitoring required"
    }
  ],
  "count": 5
}
```

### 4. Get Average Risk by State

**GET** `/api/ml/predictions/by-state`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "state": "MAHARASHTRA",
      "averageRiskScore": 45.2,
      "districtCount": 36,
      "riskLevel": "yellow"
    }
  ],
  "count": 28
}
```

### 5. Get Model Report

**GET** `/api/ml/report`

**Response:**
```json
{
  "success": true,
  "data": {
    "modelName": "model1_india_ipc",
    "performance": {
      "mae": 0.276,
      "rmse": 1.6787,
      "r2Score": 0.9542,
      "accuracy": "95.42%"
    },
    "trainingInfo": {
      "trainingRows": 5974,
      "validationRows": 854,
      "testRows": 1707,
      "totalRows": 8535,
      "featureCount": 22
    },
    "featureImportance": [
      { "feature": "total_ipc_crimes", "importance": 0.245, "rank": 1 },
      { "feature": "total_crime", "importance": 0.198, "rank": 2 }
    ],
    "lastTrained": "2026-05-02T...",
    "status": "success"
  }
}
```

### 6. Get Analyst Dashboard

**GET** `/api/ml/analyst/dashboard`

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalPredictions": 8535,
      "averageRiskScore": 6.65,
      "redRiskDistrictCount": 1245,
      "modelAccuracy": "95.42%"
    },
    "highestRiskDistricts": [
      {
        "state": "MAHARASHTRA",
        "district": "MUMBAI",
        "predictedRiskScore": 92.3,
        "predictedRiskLevel": "red"
      }
    ],
    "topCrimeDrivers": [
      { "crime": "theft", "count": 2103 },
      { "crime": "robbery", "count": 1856 }
    ],
    "stateRisks": [
      {
        "state": "MAHARASHTRA",
        "averageRiskScore": 45.2,
        "districtCount": 36,
        "riskLevel": "yellow"
      }
    ],
    "modelMetrics": { ... }
  }
}
```

### 7. Get Prediction Statistics

**GET** `/api/ml/predictions/statistics`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPredictions": 8535,
    "riskDistribution": {
      "red": 1245,
      "yellow": 2890,
      "green": 4400
    },
    "averageRiskScore": 6.65,
    "statesCovered": 28,
    "redPercentage": "14.58%"
  }
}
```

---

## 🎨 Frontend Integration

### Analyst Dashboard Screen

```jsx
import React, { useEffect, useState } from 'react';

export function AnalystDashboard() {
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    fetch('/api/ml/analyst/dashboard')
      .then(res => res.json())
      .then(data => setDashboard(data.data));
  }, []);

  if (!dashboard) return <Loading />;

  return (
    <div className="dashboard">
      <div className="summary-cards">
        <Card title="Average Risk" value={dashboard.summary.averageRiskScore} />
        <Card title="Red Zones" value={dashboard.summary.redRiskDistrictCount} />
        <Card title="Model Accuracy" value={dashboard.summary.modelAccuracy} />
      </div>

      <HighestRiskTable data={dashboard.highestRiskDistricts} />
      <StateRiskMap data={dashboard.stateRisks} />
      <CrimeDriverChart data={dashboard.topCrimeDrivers} />
    </div>
  );
}
```

### District Risk Detail Screen

```jsx
export function DistrictRisk({ state, district }) {
  const [prediction, setPrediction] = useState(null);

  useEffect(() => {
    fetch(`/api/ml/predictions/india-district-risk/${district}?state=${state}`)
      .then(res => res.json())
      .then(data => setPrediction(data.data));
  }, [state, district]);

  if (!prediction) return <Loading />;

  return (
    <div className="district-risk">
      <h2>{prediction.district}, {prediction.state}</h2>
      
      <RiskScoreDisplay 
        score={prediction.predictedRiskScore}
        level={prediction.predictedRiskLevel}
      />

      <div className="details">
        <p><strong>Crime Driver:</strong> {prediction.mainCrimeDriver}</p>
        <p><strong>Recommendation:</strong> {prediction.recommendation}</p>
        <p><strong>Confidence:</strong> {(prediction.confidenceScore * 100).toFixed(1)}%</p>
      </div>
    </div>
  );
}
```

---

## 🔄 Re-training Pipeline

### Monthly Re-training Schedule

```bash
#!/bin/bash
# scripts/retrain_model1.sh

echo "Starting monthly Model 1 re-training..."

# Change to ML services directory
cd ml-services

# Train new model
python scripts/train_model1_india_ipc.py

# If training successful, import predictions
if [ $? -eq 0 ]; then
  echo "Training successful, importing predictions..."
  cd ../
  node scripts/importModel1Predictions.js
  
  # Notify backend
  curl -X POST http://localhost:5000/api/ml/model-updated \
    -H "Content-Type: application/json" \
    -d '{"modelName": "model1_india_ipc", "status": "success"}'
else
  echo "Training failed, aborting import"
  exit 1
fi
```

### Cron Job Setup

```bash
# Add to crontab (runs on 1st of every month at 2 AM)
0 2 1 * * /path/to/scripts/retrain_model1.sh >> /var/log/model1_retrain.log 2>&1
```

---

## 🧪 Testing

### Test Endpoint Connection

```bash
# Test API
curl http://localhost:5000/api/ml/report

# Test specific district
curl "http://localhost:5000/api/ml/predictions/india-district-risk/NEW%20DELHI"

# Test statistics
curl "http://localhost:5000/api/ml/predictions/statistics"
```

### Load Test

```bash
# Using Apache Bench (ab)
ab -n 1000 -c 10 http://localhost:5000/api/ml/predictions/statistics
```

---

## ⚠️ Troubleshooting

### Issue: Import fails with "CSV file not found"
```
Solution: Ensure train_model1_india_ipc.py was executed successfully
Check: ml-services/datasets/processed/model1_india_ipc_future_predictions.csv exists
```

### Issue: "Table mlprediction does not exist"
```
Solution: Run Prisma migration
Command: npx prisma migrate dev
```

### Issue: "Unexpected token in JSON"
```
Solution: Ensure model1_india_ipc_metrics.json is valid JSON
Check: cat ml-services/audit_outputs/model1_india_ipc_metrics.json
```

### Issue: Predictions show all zeros
```
Solution: Check feature scaling in config.py
Verify: FEATURE_COLUMNS match CSV column names
```

---

## 📊 Database Schema

### MlPrediction Table

```sql
-- Auto-generated by Prisma
CREATE TABLE "MlPrediction" (
  id TEXT PRIMARY KEY,
  state TEXT,
  district TEXT,
  zoneId TEXT,
  predictionYear INTEGER,
  predictionDate TIMESTAMP DEFAULT now(),
  predictedRiskScore DOUBLE PRECISION NOT NULL,
  predictedRiskLevel VARCHAR(20) NOT NULL,
  likelyCrime TEXT,
  mainCrimeDriver TEXT,
  peakTime TEXT,
  confidenceScore DOUBLE PRECISION,
  recommendation TEXT,
  modelName VARCHAR(100) DEFAULT 'model1_india_ipc',
  createdAt TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_state ON "MlPrediction"(state);
CREATE INDEX idx_district ON "MlPrediction"(district);
CREATE INDEX idx_predictionYear ON "MlPrediction"(predictionYear);
```

---

## 📞 Support

For issues or questions:
1. Check logs: `tail -f logs/model1_training.log`
2. Review metrics: `cat audit_outputs/model1_india_ipc_metrics.json`
3. Verify predictions CSV: `head -20 datasets/processed/model1_india_ipc_future_predictions.csv`

