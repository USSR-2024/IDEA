import { Request, Response } from 'express';
import { query, withTransaction } from '@tms/database';

// Get all couriers with filters
export const getCouriers = async (req: Request, res: Response) => {
  try {
    const { 
      status, 
      vehicle_type, 
      is_available, 
      search,
      limit = 50,
      offset = 0
    } = req.query;

    let sqlQuery = `
      SELECT 
        c.*,
        v.plate_number,
        v.vehicle_type,
        v.model,
        cs.shift_start,
        cs.shift_end,
        cs.status as shift_status,
        (
          SELECT COUNT(*) 
          FROM route_orders ro 
          JOIN routes r ON r.id = ro.route_id 
          WHERE r.courier_id = c.id 
          AND ro.delivery_status = 'delivered'
        ) as total_deliveries,
        (
          SELECT AVG(rating) 
          FROM delivery_ratings 
          WHERE courier_id = c.id
        ) as avg_rating
      FROM couriers c
      LEFT JOIN vehicles v ON v.id = c.current_vehicle_id
      LEFT JOIN courier_shifts cs ON cs.courier_id = c.id 
        AND cs.status = 'active'
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      sqlQuery += ` AND c.status = $${paramIndex++}`;
      params.push(status);
    }

    if (vehicle_type) {
      sqlQuery += ` AND v.vehicle_type = $${paramIndex++}`;
      params.push(vehicle_type);
    }

    if (is_available !== undefined) {
      sqlQuery += ` AND c.is_available = $${paramIndex++}`;
      params.push(is_available === 'true');
    }

    if (search) {
      sqlQuery += ` AND (
        c.full_name ILIKE $${paramIndex} OR
        c.phone ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sqlQuery += ` ORDER BY c.created_at DESC`;
    sqlQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await query(sqlQuery, params);

    res.json({
      couriers: result.rows,
      total: result.rows.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    logger.error('Error fetching couriers:', error);
    res.status(500).json({ error: 'Failed to fetch couriers' });
  }
};

// Get courier by ID
export const getCourierById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const courierResult = await query(`
      SELECT 
        c.*,
        v.plate_number,
        v.vehicle_type,
        v.model,
        v.brand
      FROM couriers c
      LEFT JOIN vehicles v ON v.id = c.current_vehicle_id
      WHERE c.id = $1
    `, [id]);

    if (courierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    // Get current shift
    const shiftResult = await query(`
      SELECT * FROM courier_shifts
      WHERE courier_id = $1 AND status = 'active'
      ORDER BY shift_start DESC
      LIMIT 1
    `, [id]);

    // Get statistics
    const statsResult = await query(`
      SELECT 
        COUNT(DISTINCT ro.order_id) as total_deliveries,
        COUNT(DISTINCT ro.order_id) FILTER (WHERE ro.delivery_status = 'delivered') as successful_deliveries,
        COUNT(DISTINCT ro.order_id) FILTER (WHERE ro.delivery_status = 'failed') as failed_deliveries,
        AVG(dr.rating) as avg_rating,
        COUNT(DISTINCT dr.id) as total_ratings
      FROM couriers c
      LEFT JOIN routes r ON r.courier_id = c.id
      LEFT JOIN route_orders ro ON ro.route_id = r.id
      LEFT JOIN delivery_ratings dr ON dr.courier_id = c.id
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);

    res.json({
      courier: courierResult.rows[0],
      currentShift: shiftResult.rows[0] || null,
      statistics: statsResult.rows[0] || {
        total_deliveries: 0,
        successful_deliveries: 0,
        failed_deliveries: 0,
        avg_rating: null,
        total_ratings: 0
      }
    });
  } catch (error) {
    logger.error('Error fetching courier:', error);
    res.status(500).json({ error: 'Failed to fetch courier' });
  }
};

// Create new courier
export const createCourier = async (req: Request, res: Response) => {
  try {
    const {
      full_name,
      phone,
      email,
      birth_date,
      license_number,
      license_types,
      emergency_contact,
      emergency_phone,
      address,
      bank_account,
      status = 'inactive'
    } = req.body;

    // Validate required fields
    if (!full_name || !phone || !email) {
      return res.status(400).json({ 
        error: 'Full name, phone, and email are required' 
      });
    }

    // Check if courier with same email or phone exists
    const existingCourier = await query(
      'SELECT id FROM couriers WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (existingCourier.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Courier with this email or phone already exists' 
      });
    }

    const result = await query(`
      INSERT INTO couriers (
        full_name, phone, email, birth_date, 
        license_number, license_types, emergency_contact, 
        emergency_phone, address, bank_account, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      full_name, phone, email, birth_date,
      license_number, license_types, emergency_contact,
      emergency_phone, address, bank_account, status
    ]);

    logger.info(`New courier created: ${result.rows[0].id}`);

    res.status(201).json({
      message: 'Courier created successfully',
      courier: result.rows[0]
    });
  } catch (error) {
    logger.error('Error creating courier:', error);
    res.status(500).json({ error: 'Failed to create courier' });
  }
};

// Update courier
export const updateCourier = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'created_at') {
        updateFields.push(`${key} = $${paramIndex++}`);
        values.push(updates[key]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const updateQuery = `
      UPDATE couriers 
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    logger.info(`Courier updated: ${id}`);

    res.json({
      message: 'Courier updated successfully',
      courier: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating courier:', error);
    res.status(500).json({ error: 'Failed to update courier' });
  }
};

// Delete courier (soft delete)
export const deleteCourier = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if courier has active routes
    const activeRoutes = await query(
      `SELECT COUNT(*) as count FROM routes 
       WHERE courier_id = $1 AND status IN ('active', 'planned')`,
      [id]
    );

    if (parseInt(activeRoutes.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete courier with active routes' 
      });
    }

    // Soft delete - set status to deleted
    const result = await query(
      `UPDATE couriers 
       SET status = 'deleted', is_available = false, updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    logger.info(`Courier deleted: ${id}`);

    res.json({
      message: 'Courier deleted successfully',
      courier: result.rows[0]
    });
  } catch (error) {
    logger.error('Error deleting courier:', error);
    res.status(500).json({ error: 'Failed to delete courier' });
  }
};

// Assign vehicle to courier
export const assignVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { vehicle_id } = req.body;

    // Check if vehicle is available
    const vehicleCheck = await query(
      'SELECT status, assigned_to FROM vehicles WHERE id = $1',
      [vehicle_id]
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

    await withTransaction(async (client) => {
      // Update courier
      await client.query(
        'UPDATE couriers SET current_vehicle_id = $1 WHERE id = $2',
        [vehicle_id, id]
      );

      // Update vehicle
      await client.query(
        `UPDATE vehicles 
         SET assigned_to = $1, status = 'in_use', updated_at = NOW()
         WHERE id = $2`,
        [id, vehicle_id]
      );
    });

    logger.info(`Vehicle ${vehicle_id} assigned to courier ${id}`);

    res.json({
      message: 'Vehicle assigned successfully',
      courier_id: id,
      vehicle_id
    });
  } catch (error) {
    logger.error('Error assigning vehicle:', error);
    res.status(500).json({ error: 'Failed to assign vehicle' });
  }
};

// Remove vehicle from courier
export const removeVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const courierResult = await query(
      'SELECT current_vehicle_id FROM couriers WHERE id = $1',
      [id]
    );

    if (courierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    const vehicleId = courierResult.rows[0].current_vehicle_id;

    if (!vehicleId) {
      return res.status(400).json({ error: 'Courier has no assigned vehicle' });
    }

    await withTransaction(async (client) => {
      // Update courier
      await client.query(
        'UPDATE couriers SET current_vehicle_id = NULL WHERE id = $1',
        [id]
      );

      // Update vehicle
      await client.query(
        `UPDATE vehicles 
         SET assigned_to = NULL, status = 'available', updated_at = NOW()
         WHERE id = $1`,
        [vehicleId]
      );
    });

    logger.info(`Vehicle ${vehicleId} removed from courier ${id}`);

    res.json({
      message: 'Vehicle removed successfully',
      courier_id: id
    });
  } catch (error) {
    logger.error('Error removing vehicle:', error);
    res.status(500).json({ error: 'Failed to remove vehicle' });
  }
};

// Update courier availability
export const updateAvailability = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_available } = req.body;

    const result = await query(
      `UPDATE couriers 
       SET is_available = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, full_name, is_available`,
      [is_available, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    logger.info(`Courier ${id} availability updated to ${is_available}`);

    res.json({
      message: 'Availability updated successfully',
      courier: result.rows[0]
    });
  } catch (error) {
    logger.error('Error updating availability:', error);
    res.status(500).json({ error: 'Failed to update availability' });
  }
};

// Get courier performance metrics
export const getCourierMetrics = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;

    let metricsQuery = `
      SELECT 
        COUNT(DISTINCT ro.order_id) as total_orders,
        COUNT(DISTINCT ro.order_id) FILTER (WHERE ro.delivery_status = 'delivered') as delivered_orders,
        COUNT(DISTINCT ro.order_id) FILTER (WHERE ro.delivery_status = 'failed') as failed_orders,
        AVG(EXTRACT(EPOCH FROM (ro.actual_delivery_time - ro.planned_arrival_time))/60) as avg_delay_minutes,
        SUM(r.total_distance) as total_distance_km,
        SUM(EXTRACT(EPOCH FROM (r.ended_at - r.started_at))/3600) as total_hours_worked,
        AVG(dr.rating) as avg_rating,
        COUNT(DISTINCT dr.id) as total_ratings
      FROM couriers c
      LEFT JOIN routes r ON r.courier_id = c.id
      LEFT JOIN route_orders ro ON ro.route_id = r.id
      LEFT JOIN delivery_ratings dr ON dr.courier_id = c.id
      WHERE c.id = $1
    `;

    const params: any[] = [id];
    let paramIndex = 2;

    if (start_date) {
      metricsQuery += ` AND r.created_at >= $${paramIndex++}`;
      params.push(start_date);
    }

    if (end_date) {
      metricsQuery += ` AND r.created_at <= $${paramIndex++}`;
      params.push(end_date);
    }

    metricsQuery += ' GROUP BY c.id';

    const result = await query(metricsQuery, params);

    res.json({
      courier_id: id,
      metrics: result.rows[0] || {
        total_orders: 0,
        delivered_orders: 0,
        failed_orders: 0,
        avg_delay_minutes: null,
        total_distance_km: 0,
        total_hours_worked: 0,
        avg_rating: null,
        total_ratings: 0
      },
      success_rate: result.rows[0] ? 
        (result.rows[0].delivered_orders / result.rows[0].total_orders * 100).toFixed(2) : 0
    });
  } catch (error) {
    logger.error('Error fetching courier metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
};

// Import logger
import { logger } from '../utils/logger';