import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { Server } from 'socket.io';
import http from 'http';

import notificationRoutes from './routes/notification.routes';
import templateRoutes from './routes/template.routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { EmailService } from './services/emailService';
import { PushService } from './services/pushService';

dotenv.config();

const app: Application = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

const PORT = process.env.NOTIFICATION_SERVICE_PORT || 4005;

// Initialize email service
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const emailService = new EmailService(emailTransporter);
const pushService = new PushService(io);

// Export for use in controllers
export { emailService, pushService, io };

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
    service: 'notification',
    timestamp: new Date().toISOString(),
    email: emailTransporter ? 'configured' : 'not configured',
    websocket: 'active'
  });
});

// Routes
app.use('/notifications', notificationRoutes);
app.use('/templates', templateRoutes);

// WebSocket connections
io.on('connection', (socket) => {
  logger.info(`Client connected to notifications: ${socket.id}`);

  socket.on('subscribe', (userId: string) => {
    socket.join(`user:${userId}`);
    logger.info(`User ${userId} subscribed to notifications`);
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Error handler
app.use(errorHandler);

// Start server
server.listen(PORT, () => {
  logger.info(`Notification Service running on port ${PORT}`);
  logger.info(`WebSocket ready for connections`);
});

export default app;