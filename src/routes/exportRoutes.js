const router = require('express').Router();
const ctrl = require('../controllers/analystController');
router.post('/', ctrl.createExport);
router.get('/', ctrl.listExports);
router.get('/:id/download', (req,res)=>res.json({success:true,message:'Mock export download URL',data:{id:req.params.id,url:'/exports/mock-report.csv'}}));
module.exports = router;
