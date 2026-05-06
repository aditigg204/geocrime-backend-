const router = require('express').Router();
const ctrl = require('../controllers/meController');

router.get('/', ctrl.getSettings);
router.patch('/', ctrl.updateSettings);

module.exports = router;
