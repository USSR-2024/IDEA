import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import courierRoutes from './routes/courier.routes';
import shiftRoutes from './routes/shift.routes';
import statsRoutes from './routes/stats.routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

dotenv.config();

const app: Application = express();
const PORT = process.env.COURIER_SERVICE_PORT || 4003;

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
    service: 'courier',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/couriers', courierRoutes);
app.use('/shifts', shiftRoutes);
app.use('/stats', statsRoutes);

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Courier Service running on port ${PORT}`);
});

export default app;