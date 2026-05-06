const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/authController');
router.post('/register', ctrl.register);
router.post('/signup', ctrl.register);
router.post('/login', ctrl.login);
router.get('/me', auth, ctrl.me);
router.post('/logout', auth, ctrl.logout);
module.exports = router;
