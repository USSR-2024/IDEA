import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import * as orderController from '../controllers/order.controller';

const router = Router();

// Order management routes
router.get('/', asyncHandler(orderController.getOrders));
router.get('/pending', asyncHandler(orderController.getPendingOrders));
router.get('/stats', asyncHandler(orderController.getOrderStats));
router.get('/:id', asyncHandler(orderController.getOrderById));

// Order assignment and status
router.post('/:id/assign', asyncHandler(orderController.assignOrderToCourier));
router.put('/:id/status', asyncHandler(orderController.updateOrderStatus));
router.put('/:id/delivery-status', asyncHandler(orderController.updateDeliveryStatus));
router.post('/:id/cancel', asyncHandler(orderController.cancelOrder));

// Batch operations
router.post('/batch/assign', asyncHandler(orderController.batchAssignOrders));
router.post('/sync', asyncHandler(orderController.syncWithOMS));

// Priority and notes
router.put('/:id/priority', asyncHandler(orderController.updateOrderPriority));
router.put('/:id/notes', asyncHandler(orderController.updateDeliveryNotes));

export default router;