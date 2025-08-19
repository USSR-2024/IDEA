import express, { Application } from 'express';
import { config } from '@tms/config';
import authRoutes from './routes/auth.routes';
import { errorHandler } from './middleware/errorHandler';

const app: Application = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'auth' });
});

// Routes
app.use('/', authRoutes);

// Error handler
app.use(errorHandler);

// Start server
const PORT = config.services.auth.port;
app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);
});

export default app;