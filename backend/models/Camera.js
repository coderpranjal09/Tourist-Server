const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema({
  cameraId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  cameraName: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Camera', cameraSchema);