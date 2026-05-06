const router = require('express').Router();
const ctrl = require('../controllers/meController');
router.get('/', (req,res)=>res.json({success:true,data:req.user}));
router.patch('/', ctrl.updateMe);
router.patch('/password', ctrl.changePassword);
router.get('/settings', ctrl.getSettings);
router.patch('/settings', ctrl.updateSettings);
router.patch('/location-consent', ctrl.locationConsent);
module.exports = router;
