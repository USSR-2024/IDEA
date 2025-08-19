import { Request, Response } from 'express';
import { query, withTransaction } from '@tms/database';
import { syncOrdersFromOMS, updateDeliveryStatusInOMS } from '../services/oms-integration.service';

// Get all orders with filters
export const getOrders = async (req: Request, res: Response) => {
  const { 
    status, 
    delivery_status, 
    courier_id, 
    store_id,
    date_from,
    date_to,
    search,
    limit = 50,
    offset = 0
  } = req.query;

  let sqlQuery = `
    SELECT 
      o.*,
      s.name as store_name,
      c.full_name as courier_name,
      r.route_number
    FROM orders o
    LEFT JOIN stores s ON s.id = o.store_id
    LEFT JOIN route_orders ro ON ro.order_id = o.id
    LEFT JOIN routes r ON r.id = ro.route_id
    LEFT JOIN couriers c ON c.id = r.courier_id
    WHERE 1=1
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (status) {
    sqlQuery += ` AND o.status = $${paramIndex++}`;
    params.push(status);
  }

  if (delivery_status) {
    sqlQuery += ` AND o.delivery_status = $${paramIndex++}`;
    params.push(delivery_status);
  }

  if (courier_id) {
    sqlQuery += ` AND r.courier_id = $${paramIndex++}`;
    params.push(courier_id);
  }

  if (store_id) {
    sqlQuery += ` AND o.store_id = $${paramIndex++}`;
    params.push(store_id);
  }

  if (date_from) {
    sqlQuery += ` AND o.created_at >= $${paramIndex++}`;
    params.push(date_from);
  }

  if (date_to) {
    sqlQuery += ` AND o.created_at <= $${paramIndex++}`;
    params.push(date_to);
  }

  if (search) {
    sqlQuery += ` AND (
      o.order_number ILIKE $${paramIndex} OR
      o.customer_name ILIKE $${paramIndex} OR
      o.customer_phone ILIKE $${paramIndex} OR
      o.delivery_address ILIKE $${paramIndex}
    )`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  sqlQuery += ` ORDER BY o.created_at DESC`;
  sqlQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  const result = await query(sqlQuery, params);

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM orders o
    LEFT JOIN route_orders ro ON ro.order_id = o.id
    LEFT JOIN routes r ON r.id = ro.route_id
    WHERE 1=1
  `;
  
  const countResult = await query(
    countQuery + sqlQuery.split('WHERE 1=1')[1].split('ORDER BY')[0],
    params.slice(0, -2)
  );

  res.json({
    orders: result.rows,
    total: parseInt(countResult.rows[0]?.total || 0),
    limit: parseInt(limit as string),
    offset: parseInt(offset as string)
  });
};

// Get pending orders ready for assignment
export const getPendingOrders = async (req: Request, res: Response) => {
  const result = await query(`
    SELECT 
      o.*,
      s.name as store_name,
      s.address as store_address,
      s.location_lat as store_lat,
      s.location_lng as store_lng
    FROM orders o
    LEFT JOIN stores s ON s.id = o.store_id
    WHERE o.status = 'pending'
    AND o.delivery_status = 'awaiting_pickup'
    ORDER BY 
      o.is_priority DESC,
      o.preferred_delivery_date ASC NULLS LAST,
      o.created_at ASC
  `);

  res.json({
    orders: result.rows,
    total: result.rows.length
  });
};

// Get order by ID
export const getOrderById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await query(`
    SELECT 
      o.*,
      s.name as store_name,
      s.address as store_address,
      c.full_name as courier_name,
      c.phone as courier_phone,
      r.route_number,
      ro.sequence_number,
      ro.planned_arrival_time,
      ro.delivery_attempts
    FROM orders o
    LEFT JOIN stores s ON s.id = o.store_id
    LEFT JOIN route_orders ro ON ro.order_id = o.id
    LEFT JOIN routes r ON r.id = ro.route_id
    LEFT JOIN couriers c ON c.id = r.courier_id
    WHERE o.id = $1
  `, [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Get delivery history
  const historyResult = await query(`
    SELECT * FROM delivery_attempts
    WHERE order_id = $1
    ORDER BY attempt_time DESC
  `, [id]);

  res.json({
    order: result.rows[0],
    deliveryHistory: historyResult.rows
  });
};

// Assign order to courier
export const assignOrderToCourier = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { courier_id, route_id, sequence_number } = req.body;

  try {
    await withTransaction(async (client) => {
      // Check if order exists and is pending
      const orderCheck = await client.query(
        'SELECT status FROM orders WHERE id = $1',
        [id]
      );

      if (orderCheck.rows.length === 0) {
        throw new Error('Order not found');
      }

      if (orderCheck.rows[0].status !== 'pending') {
        throw new Error('Order is not in pending status');
      }

      // If route_id provided, add to existing route
      if (route_id) {
        await client.query(`
          INSERT INTO route_orders (route_id, order_id, sequence_number)
          VALUES ($1, $2, $3)
        `, [route_id, id, sequence_number || 999]);
      } else {
        // Create new route for this order
        const routeResult = await client.query(`
          INSERT INTO routes (route_number, courier_id, status, orders_count)
          VALUES ('R-' || to_char(NOW(), 'YYYYMMDD-HH24MISS'), $1, 'planned', 1)
          RETURNING id
        `, [courier_id]);

        const newRouteId = routeResult.rows[0].id;

        await client.query(`
          INSERT INTO route_orders (route_id, order_id, sequence_number)
          VALUES ($1, $2, 1)
        `, [newRouteId, id]);
      }

      // Update order status
      await client.query(`
        UPDATE orders 
        SET status = 'assigned', 
            delivery_status = 'awaiting_pickup',
            updated_at = NOW()
        WHERE id = $1
      `, [id]);
    });

    res.json({
      message: 'Order assigned successfully',
      order_id: id,
      courier_id
    });

  } catch (error) {
    console.error('Error assigning order:', error);
    res.status(400).json({ error: error.message });
  }
};

// Update order status
export const updateOrderStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  await query(
    'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, id]
  );

  res.json({
    message: 'Order status updated',
    order_id: id,
    status
  });
};

// Update delivery status
export const updateDeliveryStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { delivery_status, notes, photo_url, signature_url } = req.body;

  try {
    // Update local database
    await query(`
      UPDATE orders 
      SET delivery_status = $1, 
          delivery_notes = COALESCE($2, delivery_notes),
          updated_at = NOW()
      WHERE id = $3
    `, [delivery_status, notes, id]);

    // Update route_order if exists
    if (photo_url || signature_url) {
      await query(`
        UPDATE route_orders 
        SET photo_proof_url = COALESCE($1, photo_proof_url),
            customer_signature_url = COALESCE($2, customer_signature_url),
            delivery_status = $3
        WHERE order_id = $4
      `, [photo_url, signature_url, delivery_status, id]);
    }

    // Sync with OMS
    await updateDeliveryStatusInOMS(id, delivery_status, {
      notes,
      photo_url,
      signature_url
    });

    res.json({
      message: 'Delivery status updated',
      order_id: id,
      delivery_status
    });

  } catch (error) {
    console.error('Error updating delivery status:', error);
    res.status(500).json({ error: 'Failed to update delivery status' });
  }
};

// Cancel order
export const cancelOrder = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    // Check current status
    const orderResult = await query(
      'SELECT status FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const currentStatus = orderResult.rows[0].status;
    
    if (['delivered', 'cancelled'].includes(currentStatus)) {
      return res.status(400).json({ 
        error: `Cannot cancel order with status: ${currentStatus}` 
      });
    }

    // Update order status
    await query(`
      UPDATE orders 
      SET status = 'cancelled', 
          delivery_status = 'cancelled',
          delivery_notes = COALESCE(delivery_notes || ' | ', '') || 'Cancelled: ' || $1,
          updated_at = NOW()
      WHERE id = $2
    `, [reason || 'No reason provided', id]);

    // Remove from route if assigned
    await query(
      'DELETE FROM route_orders WHERE order_id = $1',
      [id]
    );

    // Sync with OMS
    await updateDeliveryStatusInOMS(id, 'cancelled', { reason });

    res.json({
      message: 'Order cancelled successfully',
      order_id: id
    });

  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
};

// Batch assign orders
export const batchAssignOrders = async (req: Request, res: Response) => {
  const { order_ids, courier_id, create_route = true } = req.body;

  try {
    let routeId: string;

    if (create_route) {
      // Create new route
      const routeResult = await query(`
        INSERT INTO routes (route_number, courier_id, status, orders_count)
        VALUES ('R-' || to_char(NOW(), 'YYYYMMDD-HH24MISS'), $1, 'planned', $2)
        RETURNING id
      `, [courier_id, order_ids.length]);

      routeId = routeResult.rows[0].id;
    } else {
      // Get active route for courier
      const activeRoute = await query(
        `SELECT id FROM routes 
         WHERE courier_id = $1 AND status IN ('planned', 'active')
         ORDER BY created_at DESC LIMIT 1`,
        [courier_id]
      );

      if (activeRoute.rows.length === 0) {
        return res.status(400).json({ 
          error: 'No active route found for courier' 
        });
      }

      routeId = activeRoute.rows[0].id;
    }

    // Assign orders to route
    let sequence = 1;
    for (const orderId of order_ids) {
      await query(`
        INSERT INTO route_orders (route_id, order_id, sequence_number)
        VALUES ($1, $2, $3)
        ON CONFLICT (route_id, order_id) DO NOTHING
      `, [routeId, orderId, sequence++]);

      await query(`
        UPDATE orders 
        SET status = 'assigned', 
            delivery_status = 'awaiting_pickup'
        WHERE id = $1
      `, [orderId]);
    }

    res.json({
      message: 'Orders assigned successfully',
      route_id: routeId,
      orders_assigned: order_ids.length
    });

  } catch (error) {
    console.error('Error batch assigning orders:', error);
    res.status(500).json({ error: 'Failed to assign orders' });
  }
};

// Sync with OMS manually
export const syncWithOMS = async (req: Request, res: Response) => {
  try {
    await syncOrdersFromOMS();
    res.json({ message: 'OMS sync completed successfully' });
  } catch (error) {
    console.error('Manual OMS sync error:', error);
    res.status(500).json({ error: 'OMS sync failed' });
  }
};

// Update order priority
export const updateOrderPriority = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { is_priority } = req.body;

  await query(
    'UPDATE orders SET is_priority = $1, updated_at = NOW() WHERE id = $2',
    [is_priority, id]
  );

  res.json({
    message: 'Order priority updated',
    order_id: id,
    is_priority
  });
};

// Update delivery notes
export const updateDeliveryNotes = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { notes } = req.body;

  await query(
    'UPDATE orders SET delivery_notes = $1, updated_at = NOW() WHERE id = $2',
    [notes, id]
  );

  res.json({
    message: 'Delivery notes updated',
    order_id: id
  });
};

// Get order statistics
export const getOrderStats = async (req: Request, res: Response) => {
  const stats = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE status = 'assigned') as assigned_count,
      COUNT(*) FILTER (WHERE status = 'in_transit') as in_transit_count,
      COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
      COUNT(*) FILTER (WHERE is_priority = true) as priority_count,
      COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as today_count,
      AVG(CASE 
        WHEN status = 'delivered' 
        THEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600 
      END) as avg_delivery_hours
    FROM orders
  `);

  res.json(stats.rows[0]);
};