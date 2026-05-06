const router = require('express').Router();
const ctrl = require('../controllers/alertController');
router.get('/', ctrl.mine);
router.get('/my', ctrl.mine);
router.patch('/:id/read', ctrl.markRead);
router.post('/geofence-check', ctrl.geofenceCheck);
module.exports = router;
