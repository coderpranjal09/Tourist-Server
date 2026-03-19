const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/database');
const crowdRoutes = require('./routes/crowdRoutes');
const { errorHandler, notFound } = require('./middleware/errorHandler');

dotenv.config();

connectDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

app.use('/api/crowd', crowdRoutes);

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Crowd Management API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Crowd Management API',
    version: '1.0.0',
    description: 'API for managing crowd counts at different locations',
    endpoints: {
      registerCamera: {
        method: 'POST',
        url: '/api/crowd/register-camera',
        body: { cameraId: 'string', cameraName: 'string', location: 'string' }
      },
      checkIn: {
        method: 'POST',
        url: '/api/crowd/checkin',
        body: { cameraId: 'string', count: 'number (optional, default=1)' }
      },
      checkOut: {
        method: 'POST',
        url: '/api/crowd/checkout',
        body: { cameraId: 'string', count: 'number (optional, default=1)' }
      },
      getStats: {
        method: 'GET',
        url: '/api/crowd/stats/:cameraId',
        query: { date: 'YYYY-MM-DD (optional)' }
      },
      getAllStats: {
        method: 'GET',
        url: '/api/crowd/all-stats'
      },
      getHistory: {
        method: 'GET',
        url: '/api/crowd/history/:cameraId',
        query: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', limit: 'number', page: 'number' }
      }
    },
    timestamp: new Date().toISOString()
  });
});

app.use(notFound);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}`);
});

process.on('unhandledRejection', (err) => {
  console.log('Unhandled Rejection! Shutting down...');
  console.log('Error:', err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception! Shutting down...');
  console.log('Error:', err.name, err.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated!');
  });
});