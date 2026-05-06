const router = require('express').Router();
const ctrl = require('../controllers/assistantController');
router.post('/session', ctrl.createSession);
router.get('/history', ctrl.history);
router.get('/faqs', ctrl.faqs);
router.post('/message', ctrl.message);
module.exports = router;
