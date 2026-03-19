const mongoose = require('mongoose');
const RoadAlert = require('../models/RoadAlert');
const { validationResult } = require('express-validator');
const {
  catchAsync,
  AppError,
  NotFoundError,
  ValidationError
} = require('../middleware/errorHandler');

// @desc    Report a new road alert
// @route   POST /api/road-alerts/report
// @access  Public
exports.reportAlert = catchAsync(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError(errors.array()[0].msg);
  }

  const {
    phoneNumber,
    location,
    longitude,
    latitude,
    reason,
    severity = 'medium',
    description = ''
  } = req.body;

  // Create the alert
  const alert = await RoadAlert.create({
    phoneNumber,
    location,
    coordinates: {
      type: 'Point',
      coordinates: [longitude, latitude]
    },
    reason,
    severity,
    description,
    reportedBy: phoneNumber,
    status: 'pending'
  });

  // Find nearby active alerts
  const nearbyAlerts = await RoadAlert.find({
    coordinates: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: 2000
      }
    },
    status: 'active',
    _id: { $ne: alert._id }
  }).limit(5).lean();

  res.status(201).json({
    success: true,
    message: 'Road alert reported successfully',
    data: {
      id: alert._id,
      location: alert.location,
      coordinates: alert.coordinates.coordinates,
      reason: alert.reason,
      severity: alert.severity,
      status: alert.status,
      reportedAt: alert.reportedAt,
      nearbyAlerts: nearbyAlerts.length
    }
  });
});

// @desc    Get all alerts with filters
// @route   GET /api/road-alerts
// @access  Public
exports.getAllAlerts = catchAsync(async (req, res, next) => {
  const { 
    status, 
    reason, 
    severity, 
    fromDate, 
    toDate, 
    phoneNumber,
    page = 1, 
    limit = 20,
    sortBy = 'reportedAt',
    sortOrder = 'desc'
  } = req.query;

  // Build query
  const query = {};
  if (status && status !== 'all') query.status = status;
  if (reason) query.reason = reason;
  if (severity) query.severity = severity;
  if (phoneNumber) query.phoneNumber = phoneNumber;
  
  // Date range filter
  if (fromDate || toDate) {
    query.reportedAt = {};
    if (fromDate) query.reportedAt.$gte = new Date(fromDate);
    if (toDate) query.reportedAt.$lte = new Date(toDate);
  }

  // Build sort
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const alerts = await RoadAlert.find(query)
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  const total = await RoadAlert.countDocuments(query);

  res.json({
    success: true,
    count: alerts.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    filters: { status, reason, severity, fromDate, toDate },
    data: alerts.map(alert => formatAlert(alert))
  });
});

// @desc    Get pending alerts (for admin approval)
// @route   GET /api/road-alerts/pending
// @access  Public
exports.getPendingAlerts = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, reason } = req.query;

  const query = { status: 'pending' };
  if (reason) query.reason = reason;

  const alerts = await RoadAlert.find(query)
    .sort({ reportedAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  const total = await RoadAlert.countDocuments(query);

  res.json({
    success: true,
    count: alerts.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    data: alerts.map(alert => ({
      id: alert._id,
      phoneNumber: alert.phoneNumber,
      location: alert.location,
      coordinates: alert.coordinates.coordinates,
      reason: alert.reason,
      severity: alert.severity,
      status: alert.status,
      description: alert.description,
      reportedAt: alert.reportedAt,
      timeSinceReported: getTimeSinceReported(alert.reportedAt),
      verificationCount: alert.verificationCount
    }))
  });
});

// @desc    Get approved alerts
// @route   GET /api/road-alerts/approved
// @access  Public
exports.getApprovedAlerts = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;

  const query = { status: 'approved' };

  const alerts = await RoadAlert.find(query)
    .sort({ approvedAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  const total = await RoadAlert.countDocuments(query);

  res.json({
    success: true,
    count: alerts.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    data: alerts.map(alert => ({
      id: alert._id,
      location: alert.location,
      coordinates: alert.coordinates.coordinates,
      reason: alert.reason,
      severity: alert.severity,
      status: alert.status,
      description: alert.description,
      reportedAt: alert.reportedAt,
      approvedAt: alert.approvedAt,
      approvedBy: alert.approvedBy,
      timeSinceReported: getTimeSinceReported(alert.reportedAt),
      verificationCount: alert.verificationCount
    }))
  });
});

// @desc    Get rejected alerts
// @route   GET /api/road-alerts/rejected
// @access  Public
exports.getRejectedAlerts = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;

  const query = { status: 'rejected' };

  const alerts = await RoadAlert.find(query)
    .sort({ rejectedAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  const total = await RoadAlert.countDocuments(query);

  res.json({
    success: true,
    count: alerts.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    data: alerts.map(alert => ({
      id: alert._id,
      phoneNumber: alert.phoneNumber,
      location: alert.location,
      coordinates: alert.coordinates.coordinates,
      reason: alert.reason,
      severity: alert.severity,
      status: alert.status,
      description: alert.description,
      reportedAt: alert.reportedAt,
      rejectedAt: alert.rejectedAt,
      rejectedBy: alert.rejectedBy,
      rejectionReason: alert.rejectionReason,
      verificationCount: alert.verificationCount
    }))
  });
});

// @desc    Get active alerts
// @route   GET /api/road-alerts/active
// @access  Public
exports.getActiveAlerts = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, reason, severity } = req.query;
  
  const query = { status: 'active' };
  if (reason) query.reason = reason;
  if (severity) query.severity = severity;

  const alerts = await RoadAlert.find(query)
    .sort({ severity: -1, reportedAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  const total = await RoadAlert.countDocuments(query);

  res.json({
    success: true,
    count: alerts.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    data: alerts.map(formatAlert)
  });
});

// @desc    Get alert by ID
// @route   GET /api/road-alerts/:alertId
// @access  Public
exports.getAlertById = catchAsync(async (req, res, next) => {
  const alert = await RoadAlert.findById(req.params.alertId).lean();
  
  if (!alert) {
    throw new NotFoundError('Alert not found');
  }

  res.json({
    success: true,
    data: formatAlert(alert)
  });
});

// @desc    Get nearby active alerts
// @route   GET /api/road-alerts/nearby
// @access  Public
exports.getNearbyAlerts = catchAsync(async (req, res, next) => {
  const { lng, lat, radius = 5000 } = req.query;

  if (!lng || !lat) {
    throw new ValidationError('Longitude and latitude are required');
  }

  const alerts = await RoadAlert.find({
    coordinates: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [parseFloat(lng), parseFloat(lat)]
        },
        $maxDistance: parseInt(radius)
      }
    },
    status: 'active'
  }).limit(50).lean();

  const formattedAlerts = alerts.map(alert => {
    const distance = calculateDistance(
      [parseFloat(lng), parseFloat(lat)],
      alert.coordinates.coordinates
    );
    
    return {
      id: alert._id,
      location: alert.location,
      coordinates: alert.coordinates.coordinates,
      reason: alert.reason,
      severity: alert.severity,
      status: alert.status,
      description: alert.description,
      distance: distance,
      distanceUnit: 'km',
      reportedAt: alert.reportedAt,
      timeSinceReported: getTimeSinceReported(alert.reportedAt),
      verificationCount: alert.verificationCount
    };
  });

  res.json({
    success: true,
    count: formattedAlerts.length,
    center: [parseFloat(lng), parseFloat(lat)],
    radius: parseInt(radius),
    data: formattedAlerts
  });
});

// @desc    Approve an alert
// @route   PUT /api/road-alerts/:alertId/approve
// @access  Public
exports.approveAlert = catchAsync(async (req, res, next) => {
  const { adminId, notes } = req.body;

  const alert = await RoadAlert.findById(req.params.alertId);
  
  if (!alert) {
    throw new NotFoundError('Alert not found');
  }

  if (alert.status !== 'pending') {
    throw new AppError('Can only approve pending alerts', 400);
  }

  alert.status = 'active';
  alert.approvedAt = new Date();
  alert.approvedBy = adminId || 'admin';
  alert.adminNotes = notes || null;

  // Add to status history
  alert.statusHistory = alert.statusHistory || [];
  alert.statusHistory.push({
    previousStatus: 'pending',
    newStatus: 'active',
    updatedAt: new Date(),
    updatedBy: adminId || 'admin',
    reason: notes || 'Approved by admin'
  });

  await alert.save();

  res.json({
    success: true,
    message: 'Alert approved successfully',
    data: {
      id: alert._id,
      location: alert.location,
      reason: alert.reason,
      severity: alert.severity,
      status: alert.status,
      approvedAt: alert.approvedAt,
      approvedBy: alert.approvedBy
    }
  });
});

// @desc    Reject an alert
// @route   PUT /api/road-alerts/:alertId/reject
// @access  Public
exports.rejectAlert = catchAsync(async (req, res, next) => {
  const { adminId, rejectionReason } = req.body;

  if (!rejectionReason) {
    throw new ValidationError('Rejection reason is required');
  }

  const alert = await RoadAlert.findById(req.params.alertId);
  
  if (!alert) {
    throw new NotFoundError('Alert not found');
  }

  if (alert.status !== 'pending') {
    throw new AppError('Can only reject pending alerts', 400);
  }

  alert.status = 'rejected';
  alert.rejectedAt = new Date();
  alert.rejectedBy = adminId || 'admin';
  alert.rejectionReason = rejectionReason;

  // Add to status history
  alert.statusHistory = alert.statusHistory || [];
  alert.statusHistory.push({
    previousStatus: 'pending',
    newStatus: 'rejected',
    updatedAt: new Date(),
    updatedBy: adminId || 'admin',
    reason: rejectionReason
  });

  await alert.save();

  res.json({
    success: true,
    message: 'Alert rejected successfully',
    data: {
      id: alert._id,
      location: alert.location,
      reason: alert.reason,
      status: alert.status,
      rejectedAt: alert.rejectedAt,
      rejectedBy: alert.rejectedBy,
      rejectionReason: alert.rejectionReason
    }
  });
});

// @desc    Verify an alert
// @route   PUT /api/road-alerts/:alertId/verify
// @access  Public
exports.verifyAlert = catchAsync(async (req, res, next) => {
  const { phoneNumber } = req.body;
  
  if (!phoneNumber || !phoneNumber.match(/^[0-9]{10}$/)) {
    throw new ValidationError('Valid phone number required');
  }

  const alert = await RoadAlert.findById(req.params.alertId);
  
  if (!alert) {
    throw new NotFoundError('Alert not found');
  }

  if (alert.status !== 'active') {
    throw new AppError('Cannot verify non-active alerts', 400);
  }

  await alert.verify(phoneNumber);

  res.json({
    success: true,
    message: 'Alert verified successfully',
    data: {
      verificationCount: alert.verificationCount,
      status: alert.status
    }
  });
});

// @desc    Resolve an alert
// @route   PUT /api/road-alerts/:alertId/resolve
// @access  Public
exports.resolveAlert = catchAsync(async (req, res, next) => {
  const { phoneNumber, resolution } = req.body;

  const alert = await RoadAlert.findById(req.params.alertId);
  
  if (!alert) {
    throw new NotFoundError('Alert not found');
  }

  alert.status = 'resolved';
  alert.resolvedAt = new Date();
  alert.resolvedBy = phoneNumber || 'system';
  
  if (resolution) {
    alert.resolution = resolution;
  }

  // Add to status history
  alert.statusHistory = alert.statusHistory || [];
  alert.statusHistory.push({
    previousStatus: alert.status,
    newStatus: 'resolved',
    updatedAt: new Date(),
    updatedBy: phoneNumber || 'system',
    reason: resolution || 'Resolved'
  });

  await alert.save();

  res.json({
    success: true,
    message: 'Alert resolved successfully',
    data: {
      id: alert._id,
      status: alert.status,
      resolvedAt: alert.resolvedAt,
      resolvedBy: alert.resolvedBy,
      resolution: alert.resolution
    }
  });
});

// @desc    Delete alert
// @route   DELETE /api/road-alerts/:alertId
// @access  Public
exports.deleteAlert = catchAsync(async (req, res, next) => {
  const alert = await RoadAlert.findById(req.params.alertId);
  
  if (!alert) {
    throw new NotFoundError('Alert not found');
  }

  await alert.deleteOne();

  res.json({
    success: true,
    message: 'Alert deleted successfully'
  });
});

// @desc    Get alert statistics
// @route   GET /api/road-alerts/stats/summary
// @access  Public
exports.getAlertStats = catchAsync(async (req, res, next) => {
  const stats = await RoadAlert.aggregate([
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
              active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
              resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } }
            }
          }
        ],
        byReason: [
          { $match: { status: 'active' } },
          { $group: { _id: '$reason', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],
        bySeverity: [
          { $match: { status: 'active' } },
          { $group: { _id: '$severity', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],
        recent: [
          { $match: { status: 'active' } },
          { $sort: { reportedAt: -1 } },
          { $limit: 5 },
          { $project: { location: 1, reason: 1, severity: 1, reportedAt: 1 } }
        ]
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      summary: stats[0].summary[0] || { 
        total: 0, pending: 0, active: 0, resolved: 0, rejected: 0 
      },
      byReason: stats[0].byReason || [],
      bySeverity: stats[0].bySeverity || [],
      recent: stats[0].recent || []
    }
  });
});

// Helper function to format alert
function formatAlert(alert) {
  return {
    id: alert._id,
    phoneNumber: alert.phoneNumber,
    location: alert.location,
    coordinates: alert.coordinates.coordinates,
    reason: alert.reason,
    severity: alert.severity,
    status: alert.status,
    description: alert.description,
    reportedAt: alert.reportedAt,
    timeSinceReported: getTimeSinceReported(alert.reportedAt),
    verificationCount: alert.verificationCount,
    verifiedBy: alert.verifiedBy || [],
    expiresAt: alert.expiresAt,
    ...(alert.approvedAt && { approvedAt: alert.approvedAt, approvedBy: alert.approvedBy }),
    ...(alert.rejectedAt && { rejectedAt: alert.rejectedAt, rejectedBy: alert.rejectedBy, rejectionReason: alert.rejectionReason }),
    ...(alert.resolvedAt && { resolvedAt: alert.resolvedAt, resolvedBy: alert.resolvedBy, resolution: alert.resolution })
  };
}

// Helper function to calculate time since reported
function getTimeSinceReported(reportedAt) {
  const now = new Date();
  const diffMs = now - new Date(reportedAt);
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHrs > 0) {
    return `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;
  }
  return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
}

// Helper function to calculate distance between two coordinates
function calculateDistance(coord1, coord2) {
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;
  
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c * 100) / 100;
}