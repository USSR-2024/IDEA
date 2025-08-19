import express, { Application } from 'express';
import cron from 'node-cron';
import { config } from '@tms/config';
import orderRoutes from './routes/order.routes';
import omsWebhookRoutes from './routes/oms-webhook.routes';
import { syncOrdersFromOMS } from './services/oms-integration.service';
import { errorHandler } from './middleware/errorHandler';

const app: Application = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'order',
    omsIntegration: 'active'
  });
});

// Routes
app.use('/webhook', omsWebhookRoutes);  // OMS webhooks (no auth required)
app.use('/', orderRoutes);              // Order management endpoints

// Error handler
app.use(errorHandler);

// Schedule periodic sync with OMS (every 5 minutes)
cron.schedule('*/5 * * * *', async () => {
  console.log('Running scheduled OMS sync...');
  try {
    await syncOrdersFromOMS();
    console.log('OMS sync completed successfully');
  } catch (error) {
    console.error('OMS sync failed:', error);
  }
});

// Initial sync on startup
setTimeout(async () => {
  console.log('Running initial OMS sync...');
  try {
    await syncOrdersFromOMS();
    console.log('Initial OMS sync completed');
  } catch (error) {
    console.error('Initial OMS sync failed:', error);
  }
}, 5000); // Wait 5 seconds after startup

// Start server
const PORT = config.services.order.port;
app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`);
  console.log('OMS Integration: Enabled');
  console.log('Webhook endpoint: /webhook/oms');
  console.log('Sync schedule: Every 5 minutes');
});

export default app;