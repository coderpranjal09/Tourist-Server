const mongoose = require('mongoose');

const roadAlertSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  location: {
    type: String,
    required: [true, 'Location name is required'],
    trim: true
  },
  coordinates: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: [true, 'Coordinates are required'],
      validate: {
        validator: function(coords) {
          return coords.length === 2 && 
                 coords[0] >= -180 && coords[0] <= 180 && 
                 coords[1] >= -90 && coords[1] <= 90;
        },
        message: 'Invalid coordinates format'
      }
    }
  },
  reason: {
    type: String,
    required: [true, 'Reason is required'],
    enum: {
      values: [
        'accident',
        'road_damage',
        'landslide',
        'water_logging',
        'traffic_jam',
        'road_closure',
        'weather_hazard',
        'wildlife',
        'other'
      ],
      message: 'Please select a valid reason'
    }
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'resolved', 'investigating', 'rejected', 'false_report'], // ✅ Added 'pending'
    default: 'pending' // ✅ Changed to 'pending'
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  reportedBy: {
    type: String,
    default: 'anonymous'
  },
  reportedAt: {
    type: Date,
    default: Date.now
  },
  // Approval fields
  approvedAt: Date,
  approvedBy: String,
  adminNotes: String,
  
  // Rejection fields
  rejectedAt: Date,
  rejectedBy: String,
  rejectionReason: String,
  
  // Resolution fields
  resolvedAt: Date,
  resolvedBy: String,
  resolution: String,
  
  verificationCount: {
    type: Number,
    default: 0
  },
  verifiedBy: [{
    phoneNumber: String,
    verifiedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Status history
  statusHistory: [{
    previousStatus: String,
    newStatus: String,
    updatedAt: {
      type: Date,
      default: Date.now
    },
    updatedBy: String,
    reason: String
  }],
  nearbyCameras: [{
    cameraId: String,
    cameraName: String,
    distance: Number,
    crowdLevel: Number
  }],
  expiresAt: {
    type: Date,
    default: () => new Date(+new Date() + 24*60*60*1000) // 24 hours from now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
roadAlertSchema.index({ coordinates: '2dsphere' });
roadAlertSchema.index({ status: 1, reportedAt: -1 });
roadAlertSchema.index({ reason: 1, severity: 1 });
roadAlertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for time since reported
roadAlertSchema.virtual('timeSinceReported').get(function() {
  const now = new Date();
  const diffMs = now - this.reportedAt;
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHrs > 0) {
    return `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;
  }
  return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
});

// Method to verify alert
roadAlertSchema.methods.verify = async function(phoneNumber) {
  if (!this.verifiedBy.some(v => v.phoneNumber === phoneNumber)) {
    this.verifiedBy.push({ phoneNumber });
    this.verificationCount++;
    await this.save();
  }
  return this;
};

// Method to approve alert
roadAlertSchema.methods.approve = async function(adminId, notes) {
  const previousStatus = this.status;
  this.status = 'active';
  this.approvedAt = new Date();
  this.approvedBy = adminId;
  
  this.statusHistory.push({
    previousStatus,
    newStatus: 'active',
    updatedBy: adminId,
    reason: notes || 'Approved by admin'
  });
  
  await this.save();
  return this;
};

// Method to reject alert
roadAlertSchema.methods.reject = async function(adminId, reason) {
  const previousStatus = this.status;
  this.status = 'rejected';
  this.rejectedAt = new Date();
  this.rejectedBy = adminId;
  this.rejectionReason = reason;
  
  this.statusHistory.push({
    previousStatus,
    newStatus: 'rejected',
    updatedBy: adminId,
    reason: reason
  });
  
  await this.save();
  return this;
};

// Static method to find active alerts near coordinates
roadAlertSchema.statics.findNearby = function(coordinates, maxDistance = 5000) {
  return this.find({
    coordinates: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    },
    status: 'active'
  }).sort({ severity: -1, reportedAt: -1 });
};

// Static method to find pending alerts
roadAlertSchema.statics.findPending = function() {
  return this.find({ status: 'pending' }).sort({ reportedAt: -1 });
};

// Static method to get alert statistics
roadAlertSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
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
              rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
              investigating: { $sum: { $cond: [{ $eq: ['$status', 'investigating'] }, 1, 0] } }
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

  return stats[0];
};

const RoadAlert = mongoose.model('RoadAlert', roadAlertSchema);
module.exports = RoadAlert;