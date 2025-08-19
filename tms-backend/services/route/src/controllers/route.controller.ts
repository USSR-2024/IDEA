import { Request, Response } from 'express';
import { query, withTransaction } from '@tms/database';
import { routeOptimizer } from '../index';
import { logger } from '../utils/logger';

// Get all routes
export const getRoutes = async (req: Request, res: Response) => {
  try {
    const { 
      status, 
      courier_id, 
      date_from,
      date_to,
      limit = 50,
      offset = 0
    } = req.query;

    let sqlQuery = `
      SELECT 
        r.*,
        c.full_name as courier_name,
        c.phone as courier_phone,
        v.plate_number,
        v.vehicle_type,
        (
          SELECT COUNT(*) 
          FROM route_orders ro 
          WHERE ro.route_id = r.id 
          AND ro.delivery_status = 'delivered'
        ) as delivered_count
      FROM routes r
      LEFT JOIN couriers c ON c.id = r.courier_id
      LEFT JOIN vehicles v ON v.id = c.current_vehicle_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      sqlQuery += ` AND r.status = $${paramIndex++}`;
      params.push(status);
    }

    if (courier_id) {
      sqlQuery += ` AND r.courier_id = $${paramIndex++}`;
      params.push(courier_id);
    }

    if (date_from) {
      sqlQuery += ` AND r.created_at >= $${paramIndex++}`;
      params.push(date_from);
    }

    if (date_to) {
      sqlQuery += ` AND r.created_at <= $${paramIndex++}`;
      params.push(date_to);
    }

    sqlQuery += ` ORDER BY r.created_at DESC`;
    sqlQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await query(sqlQuery, params);

    res.json({
      routes: result.rows,
      total: result.rows.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    logger.error('Error fetching routes:', error);
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
};

// Get route by ID
export const getRouteById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const routeResult = await query(`
      SELECT 
        r.*,
        c.full_name as courier_name,
        c.phone as courier_phone,
        c.current_location_lat as courier_lat,
        c.current_location_lng as courier_lng,
        v.plate_number,
        v.vehicle_type
      FROM routes r
      LEFT JOIN couriers c ON c.id = r.courier_id
      LEFT JOIN vehicles v ON v.id = c.current_vehicle_id
      WHERE r.id = $1
    `, [id]);

    if (routeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Get route orders
    const ordersResult = await query(`
      SELECT 
        ro.*,
        o.order_number,
        o.customer_name,
        o.customer_phone,
        o.delivery_address,
        o.delivery_lat,
        o.delivery_lng,
        o.order_value,
        o.payment_method
      FROM route_orders ro
      JOIN orders o ON o.id = ro.order_id
      WHERE ro.route_id = $1
      ORDER BY ro.sequence_number
    `, [id]);

    res.json({
      route: routeResult.rows[0],
      orders: ordersResult.rows
    });
  } catch (error) {
    logger.error('Error fetching route:', error);
    res.status(500).json({ error: 'Failed to fetch route' });
  }
};

// Create new route
export const createRoute = async (req: Request, res: Response) => {
  try {
    const { courier_id, order_ids, optimize = true } = req.body;

    if (!courier_id || !order_ids || order_ids.length === 0) {
      return res.status(400).json({ 
        error: 'courier_id and order_ids are required' 
      });
    }

    // Check if courier is available
    const courierCheck = await query(
      'SELECT is_available, current_vehicle_id FROM couriers WHERE id = $1',
      [courier_id]
    );

    if (courierCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    if (!courierCheck.rows[0].is_available) {
      return res.status(400).json({ error: 'Courier is not available' });
    }

    // Get order details for optimization
    const ordersResult = await query(`
      SELECT 
        id, 
        delivery_lat, 
        delivery_lng, 
        delivery_address,
        is_priority,
        preferred_delivery_date
      FROM orders 
      WHERE id = ANY($1::uuid[])
      AND status = 'pending'
    `, [order_ids]);

    if (ordersResult.rows.length !== order_ids.length) {
      return res.status(400).json({ 
        error: 'Some orders are not available for routing' 
      });
    }

    let routeId: string;
    let optimizedOrders = ordersResult.rows;

    // Optimize route if requested
    if (optimize) {
      optimizedOrders = await routeOptimizer.optimizeRoute(
        ordersResult.rows,
        courierCheck.rows[0].current_location_lat,
        courierCheck.rows[0].current_location_lng
      );
    }

    await withTransaction(async (client) => {
      // Create route
      const routeResult = await client.query(`
        INSERT INTO routes (
          route_number, 
          courier_id, 
          status, 
          orders_count,
          planned_start_time
        ) VALUES (
          'R-' || to_char(NOW(), 'YYYYMMDD-HH24MISS'),
          $1,
          'planned',
          $2,
          NOW() + INTERVAL '30 minutes'
        ) RETURNING id
      `, [courier_id, order_ids.length]);

      routeId = routeResult.rows[0].id;

      // Add orders to route
      for (let i = 0; i < optimizedOrders.length; i++) {
        const order = optimizedOrders[i];
        
        await client.query(`
          INSERT INTO route_orders (
            route_id, 
            order_id, 
            sequence_number,
            planned_arrival_time
          ) VALUES ($1, $2, $3, NOW() + INTERVAL '%s minutes')
        `, [routeId, order.id, i + 1, (i + 1) * 15]);

        // Update order status
        await client.query(`
          UPDATE orders 
          SET status = 'assigned', 
              delivery_status = 'awaiting_pickup'
          WHERE id = $1
        `, [order.id]);
      }

      // Calculate total distance (simplified)
      const totalDistance = await routeOptimizer.calculateTotalDistance(
        optimizedOrders
      );

      await client.query(`
        UPDATE routes 
        SET total_distance = $1,
            estimated_duration = $2
        WHERE id = $3
      `, [totalDistance, Math.ceil(totalDistance * 3), routeId]); // 3 min per km estimate
    });

    logger.info(`Route created: ${routeId}`);

    res.status(201).json({
      message: 'Route created successfully',
      route_id: routeId!,
      orders_count: order_ids.length,
      optimized: optimize
    });
  } catch (error) {
    logger.error('Error creating route:', error);
    res.status(500).json({ error: 'Failed to create route' });
  }
};

// Start route
export const startRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const routeCheck = await query(
      'SELECT status, courier_id FROM routes WHERE id = $1',
      [id]
    );

    if (routeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (routeCheck.rows[0].status !== 'planned') {
      return res.status(400).json({ 
        error: `Cannot start route with status: ${routeCheck.rows[0].status}` 
      });
    }

    await withTransaction(async (client) => {
      // Update route status
      await client.query(`
        UPDATE routes 
        SET status = 'active', 
            started_at = NOW()
        WHERE id = $1
      `, [id]);

      // Update courier status
      await client.query(`
        UPDATE couriers 
        SET status = 'on_duty'
        WHERE id = $1
      `, [routeCheck.rows[0].courier_id]);

      // Update first order to picked_up
      await client.query(`
        UPDATE orders o
        SET delivery_status = 'picked_up'
        FROM route_orders ro
        WHERE ro.order_id = o.id
        AND ro.route_id = $1
        AND ro.sequence_number = 1
      `, [id]);
    });

    logger.info(`Route started: ${id}`);

    res.json({
      message: 'Route started successfully',
      route_id: id
    });
  } catch (error) {
    logger.error('Error starting route:', error);
    res.status(500).json({ error: 'Failed to start route' });
  }
};

// Complete route
export const completeRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const routeCheck = await query(
      'SELECT status, courier_id FROM routes WHERE id = $1',
      [id]
    );

    if (routeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (routeCheck.rows[0].status !== 'active') {
      return res.status(400).json({ 
        error: `Cannot complete route with status: ${routeCheck.rows[0].status}` 
      });
    }

    // Get route statistics
    const statsResult = await query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE delivery_status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE delivery_status = 'failed') as failed
      FROM route_orders
      WHERE route_id = $1
    `, [id]);

    await withTransaction(async (client) => {
      // Update route
      await client.query(`
        UPDATE routes 
        SET status = 'completed',
            ended_at = NOW(),
            completion_notes = $1,
            delivered_count = $2,
            failed_count = $3
        WHERE id = $4
      `, [
        notes, 
        statsResult.rows[0].delivered,
        statsResult.rows[0].failed,
        id
      ]);

      // Update courier availability
      await client.query(`
        UPDATE couriers 
        SET is_available = true
        WHERE id = $1
      `, [routeCheck.rows[0].courier_id]);
    });

    logger.info(`Route completed: ${id}`);

    res.json({
      message: 'Route completed successfully',
      route_id: id,
      statistics: statsResult.rows[0]
    });
  } catch (error) {
    logger.error('Error completing route:', error);
    res.status(500).json({ error: 'Failed to complete route' });
  }
};

// Update route status
export const updateRouteStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['planned', 'active', 'paused', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    const result = await query(
      'UPDATE routes SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }

    logger.info(`Route ${id} status updated to ${status}`);

    res.json({
      message: 'Route status updated successfully',
      route_id: id,
      status
    });
  } catch (error) {
    logger.error('Error updating route status:', error);
    res.status(500).json({ error: 'Failed to update route status' });
  }
};

// Optimize existing route
export const optimizeRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get route with orders
    const routeResult = await query(
      'SELECT * FROM routes WHERE id = $1',
      [id]
    );

    if (routeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (routeResult.rows[0].status !== 'planned') {
      return res.status(400).json({ 
        error: 'Can only optimize planned routes' 
      });
    }

    // Get route orders
    const ordersResult = await query(`
      SELECT 
        ro.*, 
        o.delivery_lat, 
        o.delivery_lng,
        o.is_priority
      FROM route_orders ro
      JOIN orders o ON o.id = ro.order_id
      WHERE ro.route_id = $1
      AND ro.delivery_status NOT IN ('delivered', 'failed')
      ORDER BY ro.sequence_number
    `, [id]);

    if (ordersResult.rows.length === 0) {
      return res.json({ 
        message: 'No orders to optimize' 
      });
    }

    // Get courier location
    const courierResult = await query(
      'SELECT current_location_lat, current_location_lng FROM couriers WHERE id = $1',
      [routeResult.rows[0].courier_id]
    );

    // Optimize
    const optimizedOrders = await routeOptimizer.optimizeRoute(
      ordersResult.rows,
      courierResult.rows[0].current_location_lat,
      courierResult.rows[0].current_location_lng
    );

    // Update sequence numbers
    await withTransaction(async (client) => {
      for (let i = 0; i < optimizedOrders.length; i++) {
        await client.query(`
          UPDATE route_orders 
          SET sequence_number = $1,
              planned_arrival_time = NOW() + INTERVAL '%s minutes'
          WHERE route_id = $2 AND order_id = $3
        `, [i + 1, (i + 1) * 15, id, optimizedOrders[i].id]);
      }

      // Update total distance
      const totalDistance = await routeOptimizer.calculateTotalDistance(
        optimizedOrders
      );

      await client.query(`
        UPDATE routes 
        SET total_distance = $1,
            is_optimized = true
        WHERE id = $2
      `, [totalDistance, id]);
    });

    logger.info(`Route optimized: ${id}`);

    res.json({
      message: 'Route optimized successfully',
      route_id: id,
      original_distance: routeResult.rows[0].total_distance,
      optimized_distance: await routeOptimizer.calculateTotalDistance(optimizedOrders),
      orders_reordered: optimizedOrders.length
    });
  } catch (error) {
    logger.error('Error optimizing route:', error);
    res.status(500).json({ error: 'Failed to optimize route' });
  }
};

// Add order to route
export const addOrderToRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { order_id, sequence_number } = req.body;

    // Check if route exists and is active
    const routeCheck = await query(
      'SELECT status, orders_count FROM routes WHERE id = $1',
      [id]
    );

    if (routeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!['planned', 'active'].includes(routeCheck.rows[0].status)) {
      return res.status(400).json({ 
        error: 'Can only add orders to planned or active routes' 
      });
    }

    // Check if order is available
    const orderCheck = await query(
      'SELECT status FROM orders WHERE id = $1',
      [order_id]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (orderCheck.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Order is not available' });
    }

    await withTransaction(async (client) => {
      // Add order to route
      await client.query(`
        INSERT INTO route_orders (
          route_id, 
          order_id, 
          sequence_number
        ) VALUES ($1, $2, $3)
      `, [id, order_id, sequence_number || 999]);

      // Update order status
      await client.query(`
        UPDATE orders 
        SET status = 'assigned',
            delivery_status = 'awaiting_pickup'
        WHERE id = $1
      `, [order_id]);

      // Update route order count
      await client.query(`
        UPDATE routes 
        SET orders_count = orders_count + 1
        WHERE id = $1
      `, [id]);
    });

    logger.info(`Order ${order_id} added to route ${id}`);

    res.json({
      message: 'Order added to route successfully',
      route_id: id,
      order_id
    });
  } catch (error) {
    logger.error('Error adding order to route:', error);
    res.status(500).json({ error: 'Failed to add order to route' });
  }
};

// Remove order from route
export const removeOrderFromRoute = async (req: Request, res: Response) => {
  try {
    const { id, order_id } = req.params;

    // Check if order is in route and not delivered
    const checkResult = await query(
      'SELECT delivery_status FROM route_orders WHERE route_id = $1 AND order_id = $2',
      [id, order_id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found in route' });
    }

    if (checkResult.rows[0].delivery_status === 'delivered') {
      return res.status(400).json({ error: 'Cannot remove delivered order' });
    }

    await withTransaction(async (client) => {
      // Remove from route
      await client.query(
        'DELETE FROM route_orders WHERE route_id = $1 AND order_id = $2',
        [id, order_id]
      );

      // Update order status back to pending
      await client.query(`
        UPDATE orders 
        SET status = 'pending',
            delivery_status = 'awaiting_pickup'
        WHERE id = $1
      `, [order_id]);

      // Update route order count
      await client.query(`
        UPDATE routes 
        SET orders_count = orders_count - 1
        WHERE id = $1
      `, [id]);
    });

    logger.info(`Order ${order_id} removed from route ${id}`);

    res.json({
      message: 'Order removed from route successfully',
      route_id: id,
      order_id
    });
  } catch (error) {
    logger.error('Error removing order from route:', error);
    res.status(500).json({ error: 'Failed to remove order from route' });
  }
};