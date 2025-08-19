import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import vehicleRoutes from './routes/vehicle.routes';
import maintenanceRoutes from './routes/maintenance.routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

dotenv.config();

const app: Application = express();
const PORT = process.env.VEHICLE_SERVICE_PORT || 4007;

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
    service: 'vehicle',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/vehicles', vehicleRoutes);
app.use('/maintenance', maintenanceRoutes);

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Vehicle Service running on port ${PORT}`);
});

export default app;