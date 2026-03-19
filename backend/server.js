const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');

const crowdRoutes = require('./routes/crowdRoutes');
const { errorHandler, notFound } = require('./middleware/errorHandler');

dotenv.config();

const app = express();

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;
  const conn = await mongoose.connect(process.env.MONGODB_URI);
  isConnected = conn.connections[0].readyState;
};

connectDB();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl} - ${new Date().toISOString()}`);
  next();
});

app.use('/api/crowd', crowdRoutes);

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Crowd Management API',
    version: '1.0.0'
  });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on('unhandledRejection', (err) => {
  console.log(err.message);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.log(err.message);
  process.exit(1);
});