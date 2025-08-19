import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { Server } from 'socket.io';
import http from 'http';

import { config, getServiceUrl } from '@tms/config';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

const app: Application = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    credentials: config.cors.credentials
  }
});

// Basic middleware
app.use(helmet());
app.use(cors(config.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      gateway: 'up',
      database: 'connected'
    }
  });
});

// API Documentation
try {
  const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (error) {
  logger.warn('Swagger documentation not found');
}

// Service Routes with Proxy
const createServiceProxy = (serviceName: keyof typeof config.services, path: string) => {
  return createProxyMiddleware({
    target: getServiceUrl(serviceName),
    changeOrigin: true,
    pathRewrite: {
      [`^/api/${path}`]: ''
    },
    onError: (err, req, res) => {
      logger.error(`Proxy error for ${serviceName}:`, err);
      (res as Response).status(503).json({
        error: 'Service Unavailable',
        message: `The ${serviceName} service is currently unavailable`
      });
    }
  });
};

// Auth endpoints (no auth required)
app.use('/api/auth', createServiceProxy('auth', 'auth'));

// Protected service endpoints
app.use('/api/orders', authMiddleware, createServiceProxy('order', 'orders'));
app.use('/api/couriers', authMiddleware, createServiceProxy('courier', 'couriers'));
app.use('/api/vehicles', authMiddleware, createServiceProxy('vehicle', 'vehicles'));
app.use('/api/routes', authMiddleware, createServiceProxy('route', 'routes'));
app.use('/api/locations', authMiddleware, createServiceProxy('location', 'locations'));
app.use('/api/analytics', authMiddleware, createServiceProxy('analytics', 'analytics'));
app.use('/api/notifications', authMiddleware, createServiceProxy('notification', 'notifications'));

// WebSocket connections for real-time updates
io.on('connection', (socket) => {
  logger.info(`New WebSocket connection: ${socket.id}`);

  // Join room based on user role
  socket.on('join', (data: { userId: string, role: string }) => {
    socket.join(`user:${data.userId}`);
    socket.join(`role:${data.role}`);
    logger.info(`User ${data.userId} joined rooms`);
  });

  // Handle location updates from couriers
  socket.on('location:update', async (data: {
    courierId: string,
    lat: number,
    lng: number,
    speed?: number,
    heading?: number
  }) => {
    // Broadcast to all managers and dispatchers
    io.to('role:manager').to('role:dispatcher').emit('courier:location', data);
    
    // Forward to location service
    try {
      const response = await fetch(`${getServiceUrl('location')}/locations/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        logger.error('Failed to update location in service');
      }
    } catch (error) {
      logger.error('Error updating location:', error);
    }
  });

  // Handle order status updates
  socket.on('order:statusUpdate', (data: {
    orderId: string,
    status: string,
    courierId?: string
  }) => {
    // Broadcast to relevant users
    io.emit('order:updated', data);
  });

  // Handle route updates
  socket.on('route:update', (data: {
    routeId: string,
    status: string,
    courierId: string
  }) => {
    io.to('role:manager').to('role:dispatcher').emit('route:updated', data);
  });

  socket.on('disconnect', () => {
    logger.info(`WebSocket disconnected: ${socket.id}`);
  });
});

// Global error handler
app.use(errorHandler);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: req.path
  });
});

// Start server
const PORT = config.services.apiGateway.port;
server.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info(`Environment: ${config.env}`);
  logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
  logger.info('WebSocket server is ready for connections');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export { app, io };