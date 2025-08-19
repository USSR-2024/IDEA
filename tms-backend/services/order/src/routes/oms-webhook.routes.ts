import { Router, Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { handleOMSWebhook, verifyOMSWebhookSignature } from '../services/oms-integration.service';

const router = Router();

// OMS Webhook endpoint
router.post('/oms', asyncHandler(async (req: Request, res: Response) => {
  // Verify webhook signature
  const signature = req.headers['x-oms-signature'] as string;
  const payload = JSON.stringify(req.body);

  if (!verifyOMSWebhookSignature(payload, signature)) {
    console.warn('Invalid OMS webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook event
  try {
    await handleOMSWebhook(req.body);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('OMS webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}));

// Health check for OMS to verify webhook endpoint
router.get('/oms/health', (req: Request, res: Response) => {
  res.json({
    status: 'active',
    endpoint: '/webhook/oms',
    method: 'POST'
  });
});

export default router;