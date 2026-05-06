/**
 * ML Controller - Handles prediction API requests
 */

const prisma = require('../config/prisma');
const { ok, created } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const mlService = require('../services/mlService');

/**
 * GET /api/ml/status
 * Get ML model status
 */
exports.status = asyncHandler(async (req, res) => {
  const lastRun = await prisma.mlModelRun.findFirst({ orderBy: { completedAt: 'desc' } });
  ok(res, { riskModel: 'active', crimeTypeModel: 'active', hotspotModel: 'active', lastRun });
});

/**
 * GET /api/ml/jobs
 * Get all ML training jobs
 */
exports.jobs = asyncHandler(async (req, res) => 
  ok(res, await prisma.mlModelRun.findMany({ orderBy: { completedAt: 'desc' }, take: 50 }))
);

/**
 * GET /api/ml/report
 * Get model performance report
 */
exports.report = asyncHandler(async (req, res) => {
  ok(res, await mlService.getModelReport());
});

/**
 * POST /api/ml/train
 * Trigger ML model training
 */
exports.train = asyncHandler(async (req, res) => {
  req.io?.to('admin').emit('ml:run_started', { modelName: 'all_models', startedAt: new Date() });
  req.io?.to('analyst').emit('ml:run_started', { modelName: 'all_models', startedAt: new Date() });
  const run = await mlService.runModelTrainingAndImport();
  req.io?.to('admin').emit('ml:run_completed', run);
  req.io?.to('analyst').emit('ml:run_completed', run);
  req.io?.emit('prediction:updated', { runId: run.id });
  req.io?.emit('ml.job_updated', run);
  created(res, run, 'ML training job completed');
});

/**
 * POST /api/ml/predict
 * Import latest Model 1, Model 2, Model 3, and Model 4 outputs into PostgreSQL
 */
exports.predict = asyncHandler(async (req, res) => {
  req.io?.to('admin').emit('ml:run_started', { modelName: 'import_latest_outputs', startedAt: new Date() });
  req.io?.to('analyst').emit('ml:run_started', { modelName: 'import_latest_outputs', startedAt: new Date() });
  const statistics = await mlService.importModelPredictions();
  req.io?.to('admin').emit('ml:run_completed', statistics);
  req.io?.to('analyst').emit('ml:run_completed', statistics);
  req.io?.emit('prediction:updated', statistics);
  req.io?.emit('ml.predictions_updated', statistics);
  created(res, statistics, 'Latest ML outputs imported');
});

/**
 * GET /api/predictions/india-district-risk
 * Get all district risk predictions with optional filters
 */
exports.getIndiaDistrictRisks = asyncHandler(async (req, res) => {
  const { state, district, riskLevel, limit } = req.query;

  const predictions = await mlService.getDistrictRisks({
    state,
    district,
    riskLevel,
    limit: limit ? parseInt(limit) : 100,
  });

  ok(res, {
    data: predictions,
    count: predictions.length,
  });
});

/**
 * GET /api/predictions/india-district-risk/:district
 * Get specific district risk prediction
 */
exports.getDistrictRisk = asyncHandler(async (req, res) => {
  const { district } = req.params;
  const { state } = req.query;

  const prediction = await mlService.getDistrictRisk(state, district);

  if (!prediction) {
    return res.status(404).json({
      success: false,
      message: `Prediction not found for district: ${district}`,
    });
  }

  ok(res, prediction);
});

/**
 * GET /api/predictions/highest-risk
 * Get highest risk districts
 */
exports.getHighestRiskDistricts = asyncHandler(async (req, res) => {
  const { limit } = req.query;
  const predictions = await mlService.getHighestRiskDistricts(
    limit ? parseInt(limit) : 10
  );

  ok(res, {
    data: predictions,
    count: predictions.length,
  });
});

/**
 * GET /api/predictions/by-state
 * Get average risk by state
 */
exports.getAverageRiskByState = asyncHandler(async (req, res) => {
  const stateRisks = await mlService.getAverageRiskByState();

  ok(res, {
    data: stateRisks,
    count: stateRisks.length,
  });
});

/**
 * GET /api/analyst/dashboard
 * Get analyst dashboard with predictions summary
 */
exports.getAnalystDashboard = asyncHandler(async (req, res) => {
  const dashboard = await mlService.getAnalystDashboard();
  ok(res, dashboard);
});

/**
 * GET /api/predictions/statistics
 * Get prediction statistics
 */
exports.getPredictionStatistics = asyncHandler(async (req, res) => {
  ok(res, await mlService.getPredictionStatistics());
});
