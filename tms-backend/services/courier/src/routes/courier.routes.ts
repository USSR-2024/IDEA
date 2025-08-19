import { Router } from 'express';
import * as courierController from '../controllers/courier.controller';
import { validateRequest } from '../middleware/validateRequest';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all couriers (managers and dispatchers can view)
router.get('/', 
  requireRole(['manager', 'dispatcher', 'admin']),
  courierController.getCouriers
);

// Get available couriers
router.get('/available',
  requireRole(['manager', 'dispatcher']),
  courierController.getCouriers
);

// Get courier statistics
router.get('/stats',
  requireRole(['manager', 'admin']),
  courierController.getCouriers
);

// Get courier by ID
router.get('/:id',
  requireRole(['manager', 'dispatcher', 'admin']),
  courierController.getCourierById
);

// Get courier metrics
router.get('/:id/metrics',
  requireRole(['manager', 'admin']),
  courierController.getCourierMetrics
);

// Create new courier (only managers and admins)
router.post('/',
  requireRole(['manager', 'admin']),
  validateRequest,
  courierController.createCourier
);

// Update courier
router.put('/:id',
  requireRole(['manager', 'admin']),
  validateRequest,
  courierController.updateCourier
);

// Delete courier (only admins)
router.delete('/:id',
  requireRole(['admin']),
  courierController.deleteCourier
);

// Assign vehicle to courier
router.post('/:id/assign-vehicle',
  requireRole(['manager', 'dispatcher']),
  validateRequest,
  courierController.assignVehicle
);

// Remove vehicle from courier
router.post('/:id/remove-vehicle',
  requireRole(['manager', 'dispatcher']),
  courierController.removeVehicle
);

// Update courier availability
router.patch('/:id/availability',
  requireRole(['manager', 'dispatcher']),
  validateRequest,
  courierController.updateAvailability
);

export default router;