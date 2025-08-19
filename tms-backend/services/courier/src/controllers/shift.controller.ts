import { Request, Response } from 'express';
import { query, withTransaction } from '@tms/database';
import { logger } from '../utils/logger';

// Get all shifts
export const getShifts = async (req: Request, res: Response) => {
  try {
    const { 
      courier_id, 
      status, 
      date_from,
      date_to,
      limit = 50,
      offset = 0
    } = req.query;

    let sqlQuery = `
      SELECT 
        cs.*,
        c.full_name as courier_name,
        c.phone as courier_phone,
        v.plate_number,
        v.vehicle_type
      FROM courier_shifts cs
      JOIN couriers c ON c.id = cs.courier_id
      LEFT JOIN vehicles v ON v.id = c.current_vehicle_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (courier_id) {
      sqlQuery += ` AND cs.courier_id = $${paramIndex++}`;
      params.push(courier_id);
    }

    if (status) {
      sqlQuery += ` AND cs.status = $${paramIndex++}`;
      params.push(status);
    }

    if (date_from) {
      sqlQuery += ` AND cs.shift_start >= $${paramIndex++}`;
      params.push(date_from);
    }

    if (date_to) {
      sqlQuery += ` AND cs.shift_end <= $${paramIndex++}`;
      params.push(date_to);
    }

    sqlQuery += ` ORDER BY cs.shift_start DESC`;
    sqlQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await query(sqlQuery, params);

    res.json({
      shifts: result.rows,
      total: result.rows.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    logger.error('Error fetching shifts:', error);
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
};

// Start shift
export const startShift = async (req: Request, res: Response) => {
  try {
    const { courier_id, vehicle_id } = req.body;

    // Check if courier exists and is available
    const courierCheck = await query(
      'SELECT status, is_available FROM couriers WHERE id = $1',
      [courier_id]
    );

    if (courierCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    if (courierCheck.rows[0].status !== 'active') {
      return res.status(400).json({ error: 'Courier is not active' });
    }

    // Check for active shift
    const activeShift = await query(
      `SELECT id FROM courier_shifts 
       WHERE courier_id = $1 AND status = 'active'`,
      [courier_id]
    );

    if (activeShift.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Courier already has an active shift' 
      });
    }

    let shiftId: string;

    await withTransaction(async (client) => {
      // Create new shift
      const shiftResult = await client.query(`
        INSERT INTO courier_shifts (
          courier_id, 
          shift_start, 
          status,
          start_location_lat,
          start_location_lng
        ) VALUES ($1, NOW(), 'active', $2, $3)
        RETURNING id
      `, [courier_id, req.body.start_lat || null, req.body.start_lng || null]);

      shiftId = shiftResult.rows[0].id;

      // Update courier status
      await client.query(`
        UPDATE couriers 
        SET status = 'on_duty', 
            is_available = true,
            current_vehicle_id = COALESCE($1, current_vehicle_id),
            updated_at = NOW()
        WHERE id = $2
      `, [vehicle_id || null, courier_id]);

      // If vehicle provided, update vehicle status
      if (vehicle_id) {
        await client.query(`
          UPDATE vehicles 
          SET status = 'in_use', 
              assigned_to = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [courier_id, vehicle_id]);
      }
    });

    logger.info(`Shift started for courier ${courier_id}`);

    res.status(201).json({
      message: 'Shift started successfully',
      shift_id: shiftId!,
      courier_id
    });
  } catch (error) {
    logger.error('Error starting shift:', error);
    res.status(500).json({ error: 'Failed to start shift' });
  }
};

// End shift
export const endShift = async (req: Request, res: Response) => {
  try {
    const { shift_id } = req.params;
    const { end_notes } = req.body;

    // Get shift details
    const shiftResult = await query(
      'SELECT * FROM courier_shifts WHERE id = $1',
      [shift_id]
    );

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    const shift = shiftResult.rows[0];

    if (shift.status !== 'active') {
      return res.status(400).json({ error: 'Shift is not active' });
    }

    // Calculate shift statistics
    const statsResult = await query(`
      SELECT 
        COUNT(DISTINCT ro.order_id) as orders_delivered,
        SUM(r.total_distance) as total_distance
      FROM routes r
      JOIN route_orders ro ON ro.route_id = r.id
      WHERE r.courier_id = $1
      AND r.created_at >= $2
      AND ro.delivery_status = 'delivered'
    `, [shift.courier_id, shift.shift_start]);

    await withTransaction(async (client) => {
      // Update shift
      await client.query(`
        UPDATE courier_shifts 
        SET shift_end = NOW(),
            status = 'completed',
            orders_delivered = $1,
            total_distance = $2,
            end_notes = $3,
            end_location_lat = $4,
            end_location_lng = $5
        WHERE id = $6
      `, [
        statsResult.rows[0].orders_delivered || 0,
        statsResult.rows[0].total_distance || 0,
        end_notes,
        req.body.end_lat || null,
        req.body.end_lng || null,
        shift_id
      ]);

      // Update courier status
      await client.query(`
        UPDATE couriers 
        SET status = 'off_duty', 
            is_available = false,
            updated_at = NOW()
        WHERE id = $1
      `, [shift.courier_id]);

      // Release vehicle if assigned
      const courierResult = await client.query(
        'SELECT current_vehicle_id FROM couriers WHERE id = $1',
        [shift.courier_id]
      );

      if (courierResult.rows[0].current_vehicle_id) {
        await client.query(`
          UPDATE vehicles 
          SET status = 'available', 
              assigned_to = NULL,
              updated_at = NOW()
          WHERE id = $1
        `, [courierResult.rows[0].current_vehicle_id]);

        await client.query(
          'UPDATE couriers SET current_vehicle_id = NULL WHERE id = $1',
          [shift.courier_id]
        );
      }
    });

    logger.info(`Shift ${shift_id} ended for courier ${shift.courier_id}`);

    res.json({
      message: 'Shift ended successfully',
      shift_id,
      statistics: {
        duration_hours: ((Date.now() - new Date(shift.shift_start).getTime()) / 1000 / 3600).toFixed(2),
        orders_delivered: statsResult.rows[0].orders_delivered || 0,
        total_distance: statsResult.rows[0].total_distance || 0
      }
    });
  } catch (error) {
    logger.error('Error ending shift:', error);
    res.status(500).json({ error: 'Failed to end shift' });
  }
};

// Pause shift
export const pauseShift = async (req: Request, res: Response) => {
  try {
    const { shift_id } = req.params;
    const { reason } = req.body;

    const result = await query(`
      UPDATE courier_shifts 
      SET status = 'paused',
          pause_reason = $1,
          pause_started_at = NOW()
      WHERE id = $2 AND status = 'active'
      RETURNING courier_id
    `, [reason, shift_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Active shift not found' 
      });
    }

    // Update courier availability
    await query(
      'UPDATE couriers SET is_available = false WHERE id = $1',
      [result.rows[0].courier_id]
    );

    logger.info(`Shift ${shift_id} paused`);

    res.json({
      message: 'Shift paused successfully',
      shift_id
    });
  } catch (error) {
    logger.error('Error pausing shift:', error);
    res.status(500).json({ error: 'Failed to pause shift' });
  }
};

// Resume shift
export const resumeShift = async (req: Request, res: Response) => {
  try {
    const { shift_id } = req.params;

    const shiftResult = await query(
      'SELECT courier_id, pause_started_at FROM courier_shifts WHERE id = $1',
      [shift_id]
    );

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    const pauseDuration = shiftResult.rows[0].pause_started_at ? 
      Date.now() - new Date(shiftResult.rows[0].pause_started_at).getTime() : 0;

    await withTransaction(async (client) => {
      // Update shift
      await client.query(`
        UPDATE courier_shifts 
        SET status = 'active',
            pause_reason = NULL,
            pause_started_at = NULL,
            total_pause_duration = COALESCE(total_pause_duration, 0) + $1
        WHERE id = $2
      `, [pauseDuration, shift_id]);

      // Update courier availability
      await client.query(
        'UPDATE couriers SET is_available = true WHERE id = $1',
        [shiftResult.rows[0].courier_id]
      );
    });

    logger.info(`Shift ${shift_id} resumed`);

    res.json({
      message: 'Shift resumed successfully',
      shift_id,
      pause_duration_minutes: Math.round(pauseDuration / 1000 / 60)
    });
  } catch (error) {
    logger.error('Error resuming shift:', error);
    res.status(500).json({ error: 'Failed to resume shift' });
  }
};

// Get shift details
export const getShiftById = async (req: Request, res: Response) => {
  try {
    const { shift_id } = req.params;

    const shiftResult = await query(`
      SELECT 
        cs.*,
        c.full_name as courier_name,
        c.phone as courier_phone,
        v.plate_number,
        v.vehicle_type,
        v.model
      FROM courier_shifts cs
      JOIN couriers c ON c.id = cs.courier_id
      LEFT JOIN vehicles v ON v.id = c.current_vehicle_id
      WHERE cs.id = $1
    `, [shift_id]);

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    // Get routes completed during shift
    const routesResult = await query(`
      SELECT 
        r.id,
        r.route_number,
        r.status,
        r.orders_count,
        r.total_distance,
        r.started_at,
        r.ended_at
      FROM routes r
      WHERE r.courier_id = $1
      AND r.created_at >= $2
      AND ($3::timestamp IS NULL OR r.created_at <= $3)
      ORDER BY r.created_at DESC
    `, [
      shiftResult.rows[0].courier_id,
      shiftResult.rows[0].shift_start,
      shiftResult.rows[0].shift_end
    ]);

    res.json({
      shift: shiftResult.rows[0],
      routes: routesResult.rows
    });
  } catch (error) {
    logger.error('Error fetching shift details:', error);
    res.status(500).json({ error: 'Failed to fetch shift details' });
  }
};

// Get active shifts
export const getActiveShifts = async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        cs.*,
        c.full_name as courier_name,
        c.phone as courier_phone,
        c.current_location_lat,
        c.current_location_lng,
        v.plate_number,
        v.vehicle_type,
        (
          SELECT COUNT(*) 
          FROM routes r 
          WHERE r.courier_id = cs.courier_id 
          AND r.status = 'active'
        ) as active_routes_count
      FROM courier_shifts cs
      JOIN couriers c ON c.id = cs.courier_id
      LEFT JOIN vehicles v ON v.id = c.current_vehicle_id
      WHERE cs.status IN ('active', 'paused')
      ORDER BY cs.shift_start DESC
    `);

    res.json({
      shifts: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching active shifts:', error);
    res.status(500).json({ error: 'Failed to fetch active shifts' });
  }
};