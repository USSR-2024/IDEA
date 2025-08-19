import { Request, Response } from 'express';
import { query, withTransaction } from '@tms/database';
import { logger } from '../utils/logger';

// Get all vehicles with filters
export const getVehicles = async (req: Request, res: Response) => {
  try {
    const { 
      status, 
      vehicle_type, 
      assigned_to,
      search,
      limit = 50,
      offset = 0
    } = req.query;

    let sqlQuery = `
      SELECT 
        v.*,
        c.full_name as assigned_courier_name,
        (
          SELECT COUNT(*) 
          FROM routes r 
          WHERE r.courier_id = v.assigned_to 
          AND r.created_at >= NOW() - INTERVAL '30 days'
        ) as routes_last_30_days,
        (
          SELECT SUM(total_distance) 
          FROM routes r 
          WHERE r.courier_id = v.assigned_to 
          AND r.created_at >= NOW() - INTERVAL '30 days'
        ) as distance_last_30_days
      FROM vehicles v
      LEFT JOIN couriers c ON c.id = v.assigned_to
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      sqlQuery += ` AND v.status = $${paramIndex++}`;
      params.push(status);
    }

    if (vehicle_type) {
      sqlQuery += ` AND v.vehicle_type = $${paramIndex++}`;
      params.push(vehicle_type);
    }

    if (assigned_to) {
      sqlQuery += ` AND v.assigned_to = $${paramIndex++}`;
      params.push(assigned_to);
    }

    if (search) {
      sqlQuery += ` AND (
        v.plate_number ILIKE $${paramIndex} OR
        v.model ILIKE $${paramIndex} OR
        v.brand ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sqlQuery += ` ORDER BY v.created_at DESC`;
    sqlQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await query(sqlQuery, params);

    res.json({
      vehicles: result.rows,
      total: result.rows.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    logger.error('Error fetching vehicles:', error);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
};

// Get vehicle by ID
export const getVehicleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const vehicleResult = await query(`
      SELECT 
        v.*,
        c.full_name as assigned_courier_name,
        c.phone as assigned_courier_phone
      FROM vehicles v
      LEFT JOIN couriers c ON c.id = v.assigned_to
      WHERE v.id = $1
    `, [id]);

    if (vehicleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // Get maintenance history
    const maintenanceResult = await query(`
      SELECT * FROM vehicle_maintenance
      WHERE vehicle_id = $1
      ORDER BY scheduled_date DESC
      LIMIT 10
    `, [id]);

    // Get usage statistics
    const statsResult = await query(`
      SELECT 
        COUNT(DISTINCT r.id) as total_routes,
        SUM(r.total_distance) as total_distance,
        AVG(r.total_distance) as avg_distance_per_route,
        COUNT(DISTINCT r.courier_id) as unique_drivers
      FROM routes r
      JOIN couriers c ON c.id = r.courier_id
      WHERE c.current_vehicle_id = $1 OR v.assigned_to = r.courier_id
      FROM vehicles v
      WHERE v.id = $1
    `, [id]);

    res.json({
      vehicle: vehicleResult.rows[0],
      maintenance_history: maintenanceResult.rows,
      statistics: statsResult.rows[0] || {
        total_routes: 0,
        total_distance: 0,
        avg_distance_per_route: 0,
        unique_drivers: 0
      }
    });
  } catch (error) {
    logger.error('Error fetching vehicle:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle' });
  }
};

// Create new vehicle
export const createVehicle = async (req: Request, res: Response) => {
  try {
    const {
      plate_number,
      vehicle_type,
      brand,
      model,
      year,
      color,
      capacity_kg,
      capacity_m3,
      fuel_type,
      fuel_consumption_per_100km,
      insurance_expiry,
      registration_expiry,
      last_maintenance_date,
      next_maintenance_date,
      status = 'available'
    } = req.body;

    // Validate required fields
    if (!plate_number || !vehicle_type || !brand || !model) {
      return res.status(400).json({ 
        error: 'Plate number, vehicle type, brand, and model are required' 
      });
    }

    // Check if vehicle with same plate number exists
    const existingVehicle = await query(
      'SELECT id FROM vehicles WHERE plate_number = $1',
      [plate_number]
    );

    if (existingVehicle.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Vehicle with this plate number already exists' 
      });
    }

    const result = await query(`
      INSERT INTO vehicles (
        plate_number, vehicle_type, brand, model, year, color,
        capacity_kg, capacity_m3, fuel_type, fuel_consumption_per_100km,
        insurance_expiry, registration_expiry, last_maintenance_date,
        next_maintenance_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      plate_number, vehicle_type, brand, model, year, color,
      capacity_kg, capacity_m3, fuel_type, fuel_consumption_per_100km,
      insurance_expiry, registration_expiry, last_maintenance_date,
      next_maintenance_date, status
    ]);

    logger.info(`New vehicle created: ${result.rows[0].id}`);

    res.status(201).json({
      message: 'Vehicle created successfully',
      vehicle: result.rows[0]
    });
  } catch (error) {
    logger.error('Error creating vehicle:', error);
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
};

// Update vehicle
export const updateVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'created_at' && key !== 'assigned_to') {
        updateFields.push(`${key} = $${paramIndex++}`);
        values.push(updates[key]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const updateQuery = `
      UPDATE vehicles 
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    logger.info(`Vehicle updated: ${id}`);

    res.json({
      message: 'Vehicle updated successfully',
      vehicle: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating vehicle:', error);
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
};

// Delete vehicle
export const deleteVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if vehicle is assigned
    const vehicleCheck = await query(
      'SELECT assigned_to, status FROM vehicles WHERE id = $1',
      [id]
    );

    if (vehicleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (vehicleCheck.rows[0].assigned_to) {
      return res.status(400).json({ 
        error: 'Cannot delete vehicle that is currently assigned to a courier' 
      });
    }

    if (vehicleCheck.rows[0].status === 'in_use') {
      return res.status(400).json({ 
        error: 'Cannot delete vehicle that is currently in use' 
      });
    }

    // Soft delete - set status to deleted
    const result = await query(
      `UPDATE vehicles 
       SET status = 'deleted', updated_at = NOW()
       WHERE id = $1
       RETURNING id, plate_number`,
      [id]
    );

    logger.info(`Vehicle deleted: ${id}`);

    res.json({
      message: 'Vehicle deleted successfully',
      vehicle: result.rows[0]
    });
  } catch (error) {
    logger.error('Error deleting vehicle:', error);
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
};

// Assign vehicle to courier
export const assignVehicleToCourier = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { courier_id } = req.body;

    // Check if vehicle exists and is available
    const vehicleCheck = await query(
      'SELECT status, assigned_to FROM vehicles WHERE id = $1',
      [id]
    );

    if (vehicleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (vehicleCheck.rows[0].status !== 'available') {
      return res.status(400).json({ error: 'Vehicle is not available' });
    }

    if (vehicleCheck.rows[0].assigned_to) {
      return res.status(400).json({ error: 'Vehicle is already assigned' });
    }

    // Check if courier exists
    const courierCheck = await query(
      'SELECT current_vehicle_id FROM couriers WHERE id = $1',
      [courier_id]
    );

    if (courierCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    if (courierCheck.rows[0].current_vehicle_id) {
      return res.status(400).json({ 
        error: 'Courier already has a vehicle assigned' 
      });
    }

    await withTransaction(async (client) => {
      // Update vehicle
      await client.query(
        `UPDATE vehicles 
         SET assigned_to = $1, status = 'in_use', updated_at = NOW()
         WHERE id = $2`,
        [courier_id, id]
      );

      // Update courier
      await client.query(
        'UPDATE couriers SET current_vehicle_id = $1 WHERE id = $2',
        [id, courier_id]
      );
    });

    logger.info(`Vehicle ${id} assigned to courier ${courier_id}`);

    res.json({
      message: 'Vehicle assigned successfully',
      vehicle_id: id,
      courier_id
    });
  } catch (error) {
    logger.error('Error assigning vehicle:', error);
    res.status(500).json({ error: 'Failed to assign vehicle' });
  }
};

// Release vehicle from courier
export const releaseVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const vehicleResult = await query(
      'SELECT assigned_to FROM vehicles WHERE id = $1',
      [id]
    );

    if (vehicleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const courierId = vehicleResult.rows[0].assigned_to;

    if (!courierId) {
      return res.status(400).json({ error: 'Vehicle is not assigned' });
    }

    await withTransaction(async (client) => {
      // Update vehicle
      await client.query(
        `UPDATE vehicles 
         SET assigned_to = NULL, status = 'available', updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      // Update courier
      await client.query(
        'UPDATE couriers SET current_vehicle_id = NULL WHERE id = $1',
        [courierId]
      );
    });

    logger.info(`Vehicle ${id} released from courier ${courierId}`);

    res.json({
      message: 'Vehicle released successfully',
      vehicle_id: id
    });
  } catch (error) {
    logger.error('Error releasing vehicle:', error);
    res.status(500).json({ error: 'Failed to release vehicle' });
  }
};

// Update vehicle status
export const updateVehicleStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['available', 'in_use', 'maintenance', 'out_of_service', 'deleted'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    const result = await query(
      `UPDATE vehicles 
       SET status = $1, 
           status_notes = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, plate_number, status`,
      [status, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    logger.info(`Vehicle ${id} status updated to ${status}`);

    res.json({
      message: 'Vehicle status updated successfully',
      vehicle: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating vehicle status:', error);
    res.status(500).json({ error: 'Failed to update vehicle status' });
  }
};

// Get available vehicles
export const getAvailableVehicles = async (req: Request, res: Response) => {
  try {
    const { vehicle_type } = req.query;

    let sqlQuery = `
      SELECT * FROM vehicles 
      WHERE status = 'available' 
      AND assigned_to IS NULL
    `;

    const params: any[] = [];

    if (vehicle_type) {
      sqlQuery += ' AND vehicle_type = $1';
      params.push(vehicle_type);
    }

    sqlQuery += ' ORDER BY vehicle_type, brand, model';

    const result = await query(sqlQuery, params);

    res.json({
      vehicles: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching available vehicles:', error);
    res.status(500).json({ error: 'Failed to fetch available vehicles' });
  }
};

// Get vehicle usage statistics
export const getVehicleStats = async (req: Request, res: Response) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total_vehicles,
        COUNT(*) FILTER (WHERE status = 'available') as available_count,
        COUNT(*) FILTER (WHERE status = 'in_use') as in_use_count,
        COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance_count,
        COUNT(*) FILTER (WHERE status = 'out_of_service') as out_of_service_count,
        COUNT(DISTINCT vehicle_type) as vehicle_types,
        AVG(EXTRACT(YEAR FROM age(NOW(), TO_DATE(year::text, 'YYYY')))) as avg_age_years
      FROM vehicles
      WHERE status != 'deleted'
    `);

    const byType = await query(`
      SELECT 
        vehicle_type,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'available') as available
      FROM vehicles
      WHERE status != 'deleted'
      GROUP BY vehicle_type
    `);

    res.json({
      overview: stats.rows[0],
      by_type: byType.rows
    });
  } catch (error) {
    logger.error('Error fetching vehicle statistics:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle statistics' });
  }
};