/**
 * ML Service - Handles predictions and model operations
 */

const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const prisma = require('../config/prisma');

const MODEL_NAME = 'model1_india_ipc';
const ROOT_DIR = path.join(__dirname, '../..');
const ML_DIR = path.join(ROOT_DIR, 'ml-services');
const METRICS_PATH = path.join(ML_DIR, 'audit_outputs/model1_india_ipc_metrics.json');
const FEATURE_IMPORTANCE_PATH = path.join(
  ML_DIR,
  'audit_outputs/model1_india_ipc_feature_importance.csv'
);
const TRAIN_SCRIPT = path.join(ML_DIR, 'scripts/train_model1_india_ipc.py');
const IMPORT_SCRIPT = path.join(ROOT_DIR, 'scripts/importModel1Predictions.js');
const IMPORT_MODEL2_SCRIPT = path.join(ROOT_DIR, 'scripts/importModel2Predictions.js');
const IMPORT_MODEL3_SCRIPT = path.join(ROOT_DIR, 'scripts/importModel3Hotspots.js');
const IMPORT_MODEL4_SCRIPT = path.join(ROOT_DIR, 'scripts/importModel4Forecasts.js');
const MODEL2_METRICS_PATH = path.join(
  ML_DIR,
  'audit_outputs/model2_india_crime_type_metrics.json'
);
const MODEL3_SUMMARY_PATH = path.join(ML_DIR, 'audit_outputs/model3_hotspot_summary.json');
const MODEL4_METRICS_PATH = path.join(
  ML_DIR,
  'audit_outputs/model4_7day_forecast_metrics.json'
);

function runCommand(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function bestModelResult(metrics) {
  const results = Array.isArray(metrics.all_model_results)
    ? metrics.all_model_results
    : [];
  return (
    results.find((item) => item.model_name === metrics.best_algorithm) ||
    results[0] ||
    null
  );
}

class MlService {
  get modelName() {
    return MODEL_NAME;
  }

  /**
   * Get all predictions for India district risks
   */
  async getDistrictRisks(filters = {}) {
    try {
      const where = {
        modelName: 'model1_india_ipc',
      };

      if (filters.state) {
        where.state = filters.state.toUpperCase();
      }

      if (filters.district) {
        where.district = filters.district.toUpperCase();
      }

      if (filters.riskLevel) {
        where.predictedRiskLevel = filters.riskLevel.toLowerCase();
      }

      const predictions = await prisma.mlPrediction.findMany({
        where,
        orderBy: { predictedRiskScore: 'desc' },
        take: filters.limit || 100,
      });

      return predictions;
    } catch (error) {
      throw new Error(`Failed to get district risks: ${error.message}`);
    }
  }

  /**
   * Get prediction for specific district
   */
  async getDistrictRisk(state, district) {
    try {
      const normalizedDistrict = district?.toUpperCase() || '';
      const where = {
        district: {
          startsWith: normalizedDistrict,
        },
        modelName: MODEL_NAME,
      };

      if (state) {
        where.state = state.toUpperCase();
      }

      const prediction = await prisma.mlPrediction.findFirst({
        where,
        orderBy: { predictionYear: 'desc' },
      });

      if (!prediction) {
        return null;
      }

      return this._formatPredictionResponse(prediction);
    } catch (error) {
      throw new Error(`Failed to get district risk: ${error.message}`);
    }
  }

  /**
   * Get highest risk districts
   */
  async getHighestRiskDistricts(limit = 10) {
    try {
      const predictions = await prisma.mlPrediction.findMany({
        where: {
        modelName: MODEL_NAME,
          predictedRiskLevel: 'red',
        },
        orderBy: { predictedRiskScore: 'desc' },
        take: limit,
      });

      return predictions.map(p => this._formatPredictionResponse(p));
    } catch (error) {
      throw new Error(`Failed to get highest risk districts: ${error.message}`);
    }
  }

  /**
   * Get average risk score by state
   */
  async getAverageRiskByState() {
    try {
      const stateRisks = await prisma.mlPrediction.groupBy({
        by: ['state'],
        _avg: { predictedRiskScore: true },
        _count: true,
        where: { modelName: 'model1_india_ipc' },
      });

      return stateRisks.map(item => ({
        state: item.state,
        averageRiskScore: parseFloat((item._avg.predictedRiskScore || 0).toFixed(2)),
        districtCount: item._count,
        riskLevel: this._getRiskLevel(item._avg.predictedRiskScore),
      }));
    } catch (error) {
      throw new Error(`Failed to get state risks: ${error.message}`);
    }
  }

  /**
   * Get red risk districts count
   */
  async getRedRiskCount() {
    try {
      const count = await prisma.mlPrediction.count({
        where: {
          predictedRiskLevel: 'red',
          modelName: MODEL_NAME,
        },
      });

      return count;
    } catch (error) {
      throw new Error(`Failed to get red risk count: ${error.message}`);
    }
  }

  /**
   * Get model performance metrics
   */
  async getModelMetrics() {
    try {
      const modelRun = await prisma.mlModelRun.findFirst({
        where: { modelName: MODEL_NAME },
        orderBy: { completedAt: 'desc' },
      });

      if (!modelRun) return this.getMetricsFromArtifacts();

      const metricsJson = modelRun.metricsJson ? JSON.parse(modelRun.metricsJson) : {};

      return {
        modelName: modelRun.modelName,
        mae: modelRun.mae,
        rmse: modelRun.rmse,
        r2Score: modelRun.r2Score,
        trainingRows: modelRun.trainingRows,
        validationRows: modelRun.validationRows,
        testRows: modelRun.testRows,
        featureCount: modelRun.featureCount,
        lastTrained: modelRun.completedAt,
        status: modelRun.status,
      };
    } catch (error) {
      throw new Error(`Failed to get model metrics: ${error.message}`);
    }
  }

  async getPredictionStatistics() {
    const [totalCount, redCount, yellowCount, greenCount, avgScore, stateCount] =
      await Promise.all([
        prisma.mlPrediction.count({ where: { modelName: MODEL_NAME } }),
        prisma.mlPrediction.count({
          where: { predictedRiskLevel: 'red', modelName: MODEL_NAME },
        }),
        prisma.mlPrediction.count({
          where: { predictedRiskLevel: 'yellow', modelName: MODEL_NAME },
        }),
        prisma.mlPrediction.count({
          where: { predictedRiskLevel: 'green', modelName: MODEL_NAME },
        }),
        prisma.mlPrediction.aggregate({
          _avg: { predictedRiskScore: true },
          where: { modelName: MODEL_NAME },
        }),
        prisma.mlPrediction.findMany({
          distinct: ['state'],
          select: { state: true },
          where: { modelName: MODEL_NAME },
        }),
      ]);

    return {
      totalPredictions: totalCount,
      riskDistribution: {
        red: redCount,
        yellow: yellowCount,
        green: greenCount,
      },
      averageRiskScore: parseFloat(
        (avgScore._avg.predictedRiskScore || 0).toFixed(2)
      ),
      statesCovered: stateCount.length,
      redPercentage: totalCount > 0 ? ((redCount / totalCount) * 100).toFixed(2) : 0,
    };
  }

  async getMetricsFromArtifacts() {
    try {
      const raw = await fs.readFile(METRICS_PATH, 'utf8');
      const metrics = JSON.parse(raw);
      const best = bestModelResult(metrics);
      const validation = best?.validation_metrics || {};

      return {
        modelName: metrics.model_name || MODEL_NAME,
        modelType: metrics.best_algorithm || best?.model_name || 'RandomForestRegressor',
        mae: parseNumber(validation.mae),
        rmse: parseNumber(validation.rmse),
        r2Score: parseNumber(validation.r2),
        trainingRows: parseNumber(best?.train_rows),
        validationRows: parseNumber(best?.validation_rows || validation.rows),
        testRows: 0,
        featureCount: parseNumber(best?.feature_count || metrics.features_used?.length),
        lastTrained: metrics.training_date || null,
        status: 'success',
        raw: metrics,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get feature importance
   */
  async getFeatureImportance(limit = 15) {
    try {
      const raw = await fs.readFile(FEATURE_IMPORTANCE_PATH, 'utf8');
      return raw
        .split(/\r?\n/)
        .slice(1)
        .filter(Boolean)
        .map((line, index) => {
          const [feature, importance] = line.split(',');
          return {
            feature,
            importance: parseNumber(importance) || 0,
            rank: index + 1,
          };
        })
        .sort((a, b) => b.importance - a.importance)
        .slice(0, limit);
    } catch (error) {
      throw new Error(`Failed to get feature importance: ${error.message}`);
    }
  }

  async getModelReport() {
    const [runs, artifactMetrics, featureImportance, model2, model3, model4] = await Promise.all([
      prisma.mlModelRun.findMany({
        where: { modelName: MODEL_NAME },
        orderBy: { completedAt: 'desc' },
        take: 10,
      }),
      this.getMetricsFromArtifacts(),
      this.getFeatureImportance(15),
      this.getJsonArtifact(MODEL2_METRICS_PATH),
      this.getJsonArtifact(MODEL3_SUMMARY_PATH),
      this.getJsonArtifact(MODEL4_METRICS_PATH),
    ]);

    return {
      latest: runs[0] || artifactMetrics,
      runs,
      artifactMetrics,
      extraModels: {
        crimeType: model2,
        hotspots: model3,
        forecast7Day: model4,
      },
      featureImportance,
      confusionMatrix: null,
    };
  }

  async getJsonArtifact(filePath) {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Get analyst dashboard data
   */
  async getAnalystDashboard() {
    try {
      const [
        highestRisk,
        averageRisk,
        redCount,
        metrics,
        stateRisks,
      ] = await Promise.all([
        this.getHighestRiskDistricts(5),
        prisma.mlPrediction.aggregate({
          _avg: { predictedRiskScore: true },
          where: { modelName: MODEL_NAME },
        }),
        this.getRedRiskCount(),
        this.getModelMetrics(),
        this.getAverageRiskByState(),
      ]);

      // Get most common crime drivers
      const crimeDrivers = await prisma.mlPrediction.groupBy({
        by: ['mainCrimeDriver'],
        _count: true,
        where: { modelName: MODEL_NAME },
        orderBy: { _count: { mainCrimeDriver: 'desc' } },
        take: 5,
      });

      return {
        summary: {
          totalPredictions: await prisma.mlPrediction.count({
            where: { modelName: MODEL_NAME },
          }),
          averageRiskScore: parseFloat((averageRisk._avg.predictedRiskScore || 0).toFixed(2)),
          redRiskDistrictCount: redCount,
          modelAccuracy: metrics?.r2Score ? `${(metrics.r2Score * 100).toFixed(2)}%` : 'N/A',
        },
        highestRiskDistricts: highestRisk,
        topCrimeDrivers: crimeDrivers.map(item => ({
          crime: item.mainCrimeDriver,
          count: item._count,
        })),
        stateRisks: stateRisks.slice(0, 10),
        modelMetrics: metrics,
      };
    } catch (error) {
      throw new Error(`Failed to get analyst dashboard: ${error.message}`);
    }
  }

  async runModelTrainingAndImport() {
    const python = process.env.PYTHON_BIN || process.env.PYTHON || 'python';
    await runCommand(python, [TRAIN_SCRIPT], { cwd: ML_DIR, timeout: 10 * 60 * 1000 });
    await runCommand(process.execPath, [IMPORT_SCRIPT], {
      cwd: ROOT_DIR,
      timeout: 5 * 60 * 1000,
    });

    const metrics = await this.getMetricsFromArtifacts();
    const run = await prisma.mlModelRun.create({
      data: {
        modelName: MODEL_NAME,
        modelType: metrics?.modelType || 'RandomForestRegressor',
        mae: metrics?.mae,
        rmse: metrics?.rmse,
        r2Score: metrics?.r2Score,
        trainingRows: metrics?.trainingRows || 0,
        validationRows: metrics?.validationRows || 0,
        testRows: metrics?.testRows || 0,
        totalSamples: (metrics?.trainingRows || 0) + (metrics?.validationRows || 0),
        status: 'success',
        featureCount: metrics?.featureCount || 0,
        metricsJson: metrics?.raw ? JSON.stringify(metrics.raw) : null,
      },
    });

    return run;
  }

  async importModelPredictions() {
    await runCommand(process.execPath, [IMPORT_SCRIPT], {
      cwd: ROOT_DIR,
      timeout: 5 * 60 * 1000,
    });

    let model2 = null;
    let model3 = null;
    let model4 = null;

    try {
      const result = await runCommand(process.execPath, [IMPORT_MODEL2_SCRIPT], {
        cwd: ROOT_DIR,
        timeout: 5 * 60 * 1000,
      });
      model2 = result.stdout ? JSON.parse(result.stdout) : null;
    } catch (error) {
      model2 = { error: error.message };
    }

    try {
      const result = await runCommand(process.execPath, [IMPORT_MODEL3_SCRIPT], {
        cwd: ROOT_DIR,
        timeout: 5 * 60 * 1000,
      });
      model3 = result.stdout ? JSON.parse(result.stdout) : null;
    } catch (error) {
      model3 = { error: error.message };
    }

    try {
      const result = await runCommand(process.execPath, [IMPORT_MODEL4_SCRIPT], {
        cwd: ROOT_DIR,
        timeout: 5 * 60 * 1000,
      });
      model4 = result.stdout ? JSON.parse(result.stdout) : null;
    } catch (error) {
      model4 = { error: error.message };
    }

    return {
      model1: await this.getPredictionStatistics(),
      model2,
      model3,
      model4,
    };
  }

  /**
   * Helper: Format prediction response
   */
  _formatPredictionResponse(prediction) {
    return {
      id: prediction.id,
      state: prediction.state,
      district: prediction.district,
      predictionYear: prediction.predictionYear,
      predictedRiskScore: prediction.predictedRiskScore,
      predictedRiskLevel: prediction.predictedRiskLevel,
      mainCrimeDriver: prediction.mainCrimeDriver,
      recommendation: prediction.recommendation,
      confidenceScore: prediction.confidenceScore,
      createdAt: prediction.createdAt,
    };
  }

  /**
   * Helper: Get risk level from score
   */
  _getRiskLevel(score) {
    if (score === null || score === undefined) return 'green';
    if (score >= 70) return 'red';
    if (score >= 40) return 'yellow';
    return 'green';
  }
}

module.exports = new MlService();
