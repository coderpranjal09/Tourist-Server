const DailyRecord = require('../models/DailyRecord');
const Camera = require('../models/Camera');
const {
  catchAsync,
  AppError,
  NotFoundError,
  ValidationError,
  DuplicateError
} = require('../middleware/errorHandler');

const getDayRange = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
};

const getOrCreateTodayRecord = async (cameraId, cameraName) => {
  const { start, end } = getDayRange();
  
  let record = await DailyRecord.findOne({
    cameraId,
    date: { $gte: start, $lte: end }
  });

  if (!record) {
    record = new DailyRecord({
      cameraId,
      cameraName,
      date: new Date(),
      liveCount: 0,
      totalCount: 0,
      remainingCount: 0
    });
    await record.save();
  }

  return record;
};

exports.registerCamera = catchAsync(async (req, res, next) => {
  const { cameraId, cameraName, location } = req.body;

  if (!cameraId || !cameraName || !location) {
    throw new ValidationError('Camera ID, Camera Name, and Location are required');
  }

  if (cameraId.length < 3) {
    throw new ValidationError('Camera ID must be at least 3 characters long');
  }

  if (cameraName.length < 2) {
    throw new ValidationError('Camera Name must be at least 2 characters long');
  }

  const existingCamera = await Camera.findOne({ cameraId });
  if (existingCamera) {
    throw new DuplicateError(`Camera with ID '${cameraId}'`);
  }

  const camera = await Camera.create({
    cameraId,
    cameraName,
    location
  });

  res.status(201).json({
    success: true,
    message: 'Camera registered successfully',
    data: {
      cameraId: camera.cameraId,
      cameraName: camera.cameraName,
      location: camera.location,
      createdAt: camera.createdAt
    }
  });
});
// API: Check-in - ADD count to total/remaining, SET liveCount to exact value
exports.checkIn = catchAsync(async (req, res, next) => {
  const { cameraId, count } = req.body;

  if (!cameraId) {
    throw new ValidationError('Camera ID is required');
  }

  if (typeof count !== 'number' || count < 0) {
    throw new ValidationError('Count must be a non-negative number');
  }

  const camera = await Camera.findOne({ cameraId });
  if (!camera) {
    throw new NotFoundError(`Camera with ID '${cameraId}'`);
  }

  if (!camera.isActive) {
    throw new AppError('Camera is currently inactive', 403);
  }

  const record = await getOrCreateTodayRecord(cameraId, camera.cameraName);

  // ADD count to totalCount and remainingCount
  record.totalCount += count;
  record.remainingCount += count;
  
  // SET liveCount to exact value from frontend
  record.liveCount = count;
  
  record.lastUpdated = new Date();

  await record.save();

  res.json({
    success: true,
    message: `Check-in successful: ${count} person(s) entered`,
    data: {
      cameraId: record.cameraId,
      cameraName: record.cameraName,
      liveCount: record.liveCount,
      totalCount: record.totalCount,
      remainingCount: record.remainingCount,
      lastUpdated: record.lastUpdated
    }
  });
});

// API: Check-out - ONLY subtract from remainingCount
exports.checkOut = catchAsync(async (req, res, next) => {
  const { cameraId, count = 1 } = req.body;

  if (!cameraId) {
    throw new ValidationError('Camera ID is required');
  }

  if (typeof count !== 'number' || count <= 0) {
    throw new ValidationError('Count must be a positive number');
  }

  if (count > 100) {
    throw new ValidationError('Cannot check-out more than 100 people at once');
  }

  const camera = await Camera.findOne({ cameraId });
  if (!camera) {
    throw new NotFoundError(`Camera with ID '${cameraId}'`);
  }

  if (!camera.isActive) {
    throw new AppError('Camera is currently inactive', 403);
  }

  const record = await getOrCreateTodayRecord(cameraId, camera.cameraName);

  if (record.remainingCount < count) {
    throw new AppError(
      `Cannot checkout ${count} people. Only ${record.remainingCount} people currently inside`,
      400
    );
  }

  // ONLY subtract from remainingCount
  // liveCount and totalCount DO NOT CHANGE
  record.remainingCount -= count;
  record.lastUpdated = new Date();

  await record.save();

  res.json({
    success: true,
    message: `Check-out successful: ${count} person(s) exited`,
    data: {
      cameraId: record.cameraId,
      cameraName: record.cameraName,
      liveCount: record.liveCount,
      totalCount: record.totalCount,
      remainingCount: record.remainingCount,
      lastUpdated: record.lastUpdated
    }
  });
});

exports.getCameraStats = catchAsync(async (req, res, next) => {
  const { cameraId } = req.params;
  const { date } = req.query;

  if (!cameraId) {
    throw new ValidationError('Camera ID is required');
  }

  const camera = await Camera.findOne({ cameraId });
  if (!camera) {
    throw new NotFoundError(`Camera with ID '${cameraId}'`);
  }

  let queryDate = date ? new Date(date) : new Date();
  
  if (date && isNaN(queryDate.getTime())) {
    throw new ValidationError('Invalid date format. Use YYYY-MM-DD');
  }

  const { start, end } = getDayRange(queryDate);

  const record = await DailyRecord.findOne({
    cameraId,
    date: { $gte: start, $lte: end }
  });

  res.json({
    success: true,
    data: {
      cameraId: camera.cameraId,
      cameraName: camera.cameraName,
      location: camera.location,
      liveCount: record ? record.liveCount : 0,
      totalCount: record ? record.totalCount : 0,
      remainingCount: record ? record.remainingCount : 0,
      date: queryDate,
      lastUpdated: record ? record.lastUpdated : null,
      hasData: !!record
    }
  });
});

exports.getAllCamerasStats = catchAsync(async (req, res, next) => {
  const { start, end } = getDayRange();

  const [records, cameras] = await Promise.all([
    DailyRecord.find({ date: { $gte: start, $lte: end } }),
    Camera.find({ isActive: true })
  ]);

  const statsMap = new Map();
  records.forEach(record => {
    statsMap.set(record.cameraId, record);
  });

  const allStats = cameras.map(camera => {
    const record = statsMap.get(camera.cameraId);
    return {
      cameraId: camera.cameraId,
      cameraName: camera.cameraName,
      location: camera.location,
      liveCount: record ? record.liveCount : 0,
      totalCount: record ? record.totalCount : 0,
      remainingCount: record ? record.remainingCount : 0,
      lastUpdated: record ? record.lastUpdated : null,
      isActive: camera.isActive,
      hasDataToday: !!record
    };
  });

  const totals = allStats.reduce((acc, curr) => ({
    totalLive: acc.totalLive + curr.liveCount,
    totalEntries: acc.totalEntries + curr.totalCount,
    totalRemaining: acc.totalRemaining + curr.remainingCount,
    activeCameras: acc.activeCameras + (curr.isActive ? 1 : 0)
  }), { totalLive: 0, totalEntries: 0, totalRemaining: 0, activeCameras: 0 });

  res.json({
    success: true,
    count: allStats.length,
    summary: totals,
    data: allStats
  });
});

exports.getCameraHistory = catchAsync(async (req, res, next) => {
  const { cameraId } = req.params;
  const { startDate, endDate, limit = 30, page = 1 } = req.query;

  if (!cameraId) {
    throw new ValidationError('Camera ID is required');
  }

  const camera = await Camera.findOne({ cameraId });
  if (!camera) {
    throw new NotFoundError(`Camera with ID '${cameraId}'`);
  }

  let query = { cameraId };
  const dateQuery = {};

  if (startDate) {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      throw new ValidationError('Invalid startDate format. Use YYYY-MM-DD');
    }
    start.setHours(0, 0, 0, 0);
    dateQuery.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
      throw new ValidationError('Invalid endDate format. Use YYYY-MM-DD');
    }
    end.setHours(23, 59, 59, 999);
    dateQuery.$lte = end;
  }

  if (Object.keys(dateQuery).length > 0) {
    query.date = dateQuery;
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const totalRecords = await DailyRecord.countDocuments(query);

  const records = await DailyRecord.find(query)
    .sort({ date: -1 })
    .skip(skip)
    .limit(limitNum);

  const stats = records.length > 0 ? {
    averageDailyLive: Math.round(records.reduce((acc, r) => acc + r.liveCount, 0) / records.length),
    totalEntriesPeriod: records.reduce((acc, r) => acc + r.totalCount, 0),
    maxLiveCount: Math.max(...records.map(r => r.liveCount)),
    minLiveCount: Math.min(...records.map(r => r.liveCount)),
    busiestDay: records.reduce((max, r) => r.totalCount > (max?.totalCount || 0) ? r : max, null)
  } : null;

  res.json({
    success: true,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limitNum),
      hasNext: pageNum < Math.ceil(totalRecords / limitNum),
      hasPrev: pageNum > 1
    },
    stats,
    data: records.map(record => ({
      cameraId: record.cameraId,
      cameraName: record.cameraName,
      date: record.date,
      liveCount: record.liveCount,
      totalCount: record.totalCount,
      remainingCount: record.remainingCount,
      lastUpdated: record.lastUpdated
    }))
  });
});

exports.updateCameraStatus = catchAsync(async (req, res, next) => {
  const { cameraId } = req.params;
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    throw new ValidationError('isActive must be a boolean value');
  }

  const camera = await Camera.findOneAndUpdate(
    { cameraId },
    { isActive, updatedAt: new Date() },
    { new: true, runValidators: true }
  );

  if (!camera) {
    throw new NotFoundError(`Camera with ID '${cameraId}'`);
  }

  res.json({
    success: true,
    message: `Camera ${isActive ? 'activated' : 'deactivated'} successfully`,
    data: {
      cameraId: camera.cameraId,
      cameraName: camera.cameraName,
      isActive: camera.isActive
    }
  });
});

exports.deleteCamera = catchAsync(async (req, res, next) => {
  const { cameraId } = req.params;

  const camera = await Camera.findOneAndUpdate(
    { cameraId },
    { isActive: false, deletedAt: new Date() },
    { new: true }
  );

  if (!camera) {
    throw new NotFoundError(`Camera with ID '${cameraId}'`);
  }

  res.json({
    success: true,
    message: 'Camera deactivated successfully'
  });
});