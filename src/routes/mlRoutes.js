const router = require('express').Router();
const role = require('../middleware/roleMiddleware');
const ml = require('../controllers/mlController');

// ML Model Management
router.get('/status', ml.status);
router.get('/jobs', ml.jobs);
router.get('/report', ml.report);
router.post('/train', role('admin'), ml.train);
router.post('/predict', role('admin'), ml.predict);

// Model 1: India District Risk Predictions
router.get('/predictions/india-district-risk', ml.getIndiaDistrictRisks);
router.get('/predictions/india-district-risk/:district', ml.getDistrictRisk);
router.get('/predictions/highest-risk', ml.getHighestRiskDistricts);
router.get('/predictions/by-state', ml.getAverageRiskByState);
router.get('/predictions/statistics', ml.getPredictionStatistics);

// Analyst Dashboard
router.get('/analyst/dashboard', ml.getAnalystDashboard);

module.exports = router;
