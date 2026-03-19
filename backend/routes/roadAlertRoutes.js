const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const roadAlertController = require('../controllers/roadAlertController');

// Validation rules for reporting alert
const reportValidation = [
  body('phoneNumber')
    .matches(/^[0-9]{10}$/)
    .withMessage('Valid 10-digit phone number required'),
  body('location')
    .notEmpty()
    .withMessage('Location name is required')
    .trim(),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Valid longitude required'),
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Valid latitude required'),
  body('reason')
    .isIn([
      'accident', 'road_damage', 'landslide', 'water_logging',
      'traffic_jam', 'road_closure', 'weather_hazard', 'wildlife', 'other'
    ])
    .withMessage('Valid reason required'),
  body('severity')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Valid severity level required'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
];

// Public routes - NO AUTH REQUIRED
router.post('/report', reportValidation, roadAlertController.reportAlert);
router.get('/', roadAlertController.getAllAlerts);
router.get('/nearby', roadAlertController.getNearbyAlerts);
router.get('/active', roadAlertController.getActiveAlerts);
router.get('/stats/summary', roadAlertController.getAlertStats);
router.get('/pending', roadAlertController.getPendingAlerts);
router.get('/approved', roadAlertController.getApprovedAlerts);
router.get('/rejected', roadAlertController.getRejectedAlerts);
router.get('/:alertId', roadAlertController.getAlertById);

// Admin/Verification routes
router.put('/:alertId/approve', roadAlertController.approveAlert);
router.put('/:alertId/reject', roadAlertController.rejectAlert);
router.put('/:alertId/verify', roadAlertController.verifyAlert);
router.put('/:alertId/resolve', roadAlertController.resolveAlert);
// router.patch('/:alertId/status', roadAlertController.updateAlertStatus); // COMMENTED OUT
router.delete('/:alertId', roadAlertController.deleteAlert);

module.exports = router;