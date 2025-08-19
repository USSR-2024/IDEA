import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import routeRoutes from './routes/route.routes';
import optimizationRoutes from './routes/optimization.routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { RouteOptimizer } from './services/routeOptimizer';

dotenv.config();

const app: Application = express();
const PORT = process.env.ROUTE_SERVICE_PORT || 4004;

// Initialize route optimizer
const routeOptimizer = new RouteOptimizer();

// Export for use in controllers
export { routeOptimizer };

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
    service: 'route',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/routes', routeRoutes);
app.use('/optimize', optimizationRoutes);

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Route Service running on port ${PORT}`);
});

export default app;