const router = require('express').Router();
const role = require('../middleware/roleMiddleware');
const ctrl = require('../controllers/officerController');
const incident = require('../controllers/incidentController');

// Dashboard & Overview
router.get('/dashboard', role('officer'), ctrl.dashboard);

// Incidents
router.get('/incidents', role('officer'), ctrl.incidents);
router.get('/incidents/:id', role('officer'), ctrl.incidentDetail);
router.patch('/incidents/:id/status', role('officer'), incident.updateStatus);

// Map & Heatmap
router.get('/heatmap', role('officer'), require('../controllers/commonController').heatmapLive);

// Patrol Planning
router.get('/patrol-plan', role('officer'), ctrl.patrolPlan);
router.post('/patrol-routes/generate', role('officer'), ctrl.generatePatrolRoute);
router.post('/patrol-routes/:id/start', role('officer'), ctrl.startPatrolRoute);

module.exports = router;
