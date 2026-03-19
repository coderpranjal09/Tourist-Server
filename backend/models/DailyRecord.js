const mongoose = require('mongoose');

const dailyRecordSchema = new mongoose.Schema({
  cameraId: {
    type: String,
    required: true,
    trim: true
  },
  cameraName: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  liveCount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCount: {
    type: Number,
    default: 0,
    min: 0
  },
  remainingCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Ensure unique record per camera per day
dailyRecordSchema.index({ cameraId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyRecord', dailyRecordSchema);