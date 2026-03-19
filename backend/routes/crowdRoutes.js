const express = require('express');
const router = express.Router();
const crowdController = require('../controllers/crowdController');

router.post('/register-camera', crowdController.registerCamera);
router.patch('/camera/:cameraId/status', crowdController.updateCameraStatus);
router.delete('/camera/:cameraId', crowdController.deleteCamera);

router.post('/checkin', crowdController.checkIn);
router.post('/checkout', crowdController.checkOut);

router.get('/stats/:cameraId', crowdController.getCameraStats);
router.get('/all-stats', crowdController.getAllCamerasStats);
router.get('/history/:cameraId', crowdController.getCameraHistory);

module.exports = router;