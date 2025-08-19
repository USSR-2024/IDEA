import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createClient } from 'redis';

import locationRoutes from './routes/location.routes';
import trackingRoutes from './routes/tracking.routes';
import geofenceRoutes from './routes/geofence.routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { LocationTracker } from './services/locationTracker';

dotenv.config();

const app: Application = express();
const PORT = process.env.LOCATION_SERVICE_PORT || 4008;

// Redis client for caching locations
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.connect().catch(console.error);

// Initialize location tracker
const locationTracker = new LocationTracker(redisClient);

// Export for use in controllers
export { redisClient, locationTracker };

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'location',
    timestamp: new Date().toISOString(),
    redis: redisClient.isReady ? 'connected' : 'disconnected'
  });
});

// Routes
app.use('/locations', locationRoutes);
app.use('/tracking', trackingRoutes);
app.use('/geofences', geofenceRoutes);

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Location Service running on port ${PORT}`);
  logger.info(`Redis connected: ${redisClient.isReady}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing Location Service');
  await redisClient.quit();
  process.exit(0);
});

export default app;