import { Router } from 'express';
import * as vehicleController from '../controllers/vehicle.controller';
import { validateRequest } from '../middleware/validateRequest';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all vehicles
router.get('/',
  requireRole(['manager', 'dispatcher', 'admin']),
  vehicleController.getVehicles
);

// Get available vehicles
router.get('/available',
  requireRole(['manager', 'dispatcher']),
  vehicleController.getAvailableVehicles
);

// Get vehicle statistics
router.get('/stats',
  requireRole(['manager', 'admin']),
  vehicleController.getVehicleStats
);

// Get vehicle by ID
router.get('/:id',
  requireRole(['manager', 'dispatcher', 'admin']),
  vehicleController.getVehicleById
);

// Create new vehicle (only managers and admins)
router.post('/',
  requireRole(['manager', 'admin']),
  validateRequest,
  vehicleController.createVehicle
);

// Update vehicle
router.put('/:id',
  requireRole(['manager', 'admin']),
  validateRequest,
  vehicleController.updateVehicle
);

// Delete vehicle (only admins)
router.delete('/:id',
  requireRole(['admin']),
  vehicleController.deleteVehicle
);

// Assign vehicle to courier
router.post('/:id/assign',
  requireRole(['manager', 'dispatcher']),
  validateRequest,
  vehicleController.assignVehicleToCourier
);

// Release vehicle from courier
router.post('/:id/release',
  requireRole(['manager', 'dispatcher']),
  vehicleController.releaseVehicle
);

// Update vehicle status
router.patch('/:id/status',
  requireRole(['manager', 'admin']),
  validateRequest,
  vehicleController.updateVehicleStatus
);

export default router;