const router = require('express').Router();
const role = require('../middleware/roleMiddleware');
const upload = require('../middleware/uploadMiddleware');
const admin = require('../controllers/adminController');
router.post('/upload', role('admin'), upload.single('file'), admin.datasetUpload);
router.get('/:id/status', role('admin'), admin.datasetStatus);
module.exports = router;
