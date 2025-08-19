import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createClient } from 'redis';
import cron from 'node-cron';

import dashboardRoutes from './routes/dashboard.routes';
import reportsRoutes from './routes/reports.routes';
import metricsRoutes from './routes/metrics.routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { MetricsCalculator } from './services/metricsCalculator';
import { ReportGenerator } from './services/reportGenerator';

dotenv.config();

const app: Application = express();
const PORT = process.env.ANALYTICS_SERVICE_PORT || 4006;

// Redis client for caching metrics
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.connect().catch(console.error);

// Initialize services
const metricsCalculator = new MetricsCalculator(redisClient);
const reportGenerator = new ReportGenerator();

// Export for use in controllers
export { redisClient, metricsCalculator, reportGenerator };

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
    service: 'analytics',
    timestamp: new Date().toISOString(),
    redis: redisClient.isReady ? 'connected' : 'disconnected'
  });
});

// Routes
app.use('/dashboard', dashboardRoutes);
app.use('/reports', reportsRoutes);
app.use('/metrics', metricsRoutes);

// Error handler
app.use(errorHandler);

// Schedule metrics calculation every hour
cron.schedule('0 * * * *', async () => {
  logger.info('Running scheduled metrics calculation...');
  try {
    await metricsCalculator.calculateDailyMetrics();
    logger.info('Metrics calculation completed');
  } catch (error) {
    logger.error('Metrics calculation failed:', error);
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Analytics Service running on port ${PORT}`);
  logger.info('Scheduled jobs configured');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing Analytics Service');
  await redisClient.quit();
  process.exit(0);
});

export default app;