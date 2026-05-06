const router = require('express').Router();
const citizen = require('../controllers/citizenController');
router.post('/', citizen.sos);
module.exports = router;
