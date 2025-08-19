import { Request, Response } from 'express';
import { query, withTransaction } from '@tms/database';
import { locationTracker, redisClient } from '../index';
import { logger } from '../utils/logger';

// Update courier location
export const updateLocation = async (req: Request, res: Response) => {
  try {
    const { courier_id, lat, lng, speed, heading, accuracy } = req.body;

    if (!courier_id || !lat || !lng) {
      return res.status(400).json({ 
        error: 'courier_id, lat, and lng are required' 
      });
    }

    // Store in Redis for real-time access (TTL: 5 minutes)
    const locationData = {
      courier_id,
      lat,
      lng,
      speed: speed || 0,
      heading: heading || 0,
      accuracy: accuracy || 0,
      timestamp: new Date().toISOString()
    };

    await redisClient.setEx(
      `location:${courier_id}`,
      300, // 5 minutes TTL
      JSON.stringify(locationData)
    );

    // Store in database for history
    await query(`
      INSERT INTO location_history (
        courier_id, location_lat, location_lng, 
        speed, heading, accuracy, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [courier_id, lat, lng, speed, heading, accuracy]);

    // Update courier's current location
    await query(`
      UPDATE couriers 
      SET current_location_lat = $1, 
          current_location_lng = $2,
          last_location_update = NOW()
      WHERE id = $3
    `, [lat, lng, courier_id]);

    // Check geofences
    await locationTracker.checkGeofences(courier_id, lat, lng);

    // Emit to WebSocket for real-time updates
    // This would be handled by API Gateway
    
    res.json({
      message: 'Location updated successfully',
      location: locationData
    });
  } catch (error) {
    logger.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
};

// Get current location of courier
export const getCourierLocation = async (req: Request, res: Response) => {
  try {
    const { courier_id } = req.params;

    // First check Redis cache
    const cachedLocation = await redisClient.get(`location:${courier_id}`);
    
    if (cachedLocation) {
      return res.json({
        source: 'cache',
        location: JSON.parse(cachedLocation)
      });
    }

    // Fallback to database
    const result = await query(`
      SELECT 
        c.id as courier_id,
        c.current_location_lat as lat,
        c.current_location_lng as lng,
        c.last_location_update as timestamp,
        cs.status as shift_status
      FROM couriers c
      LEFT JOIN courier_shifts cs ON cs.courier_id = c.id 
        AND cs.status = 'active'
      WHERE c.id = $1
    `, [courier_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    res.json({
      source: 'database',
      location: result.rows[0]
    });
  } catch (error) {
    logger.error('Error fetching courier location:', error);
    res.status(500).json({ error: 'Failed to fetch location' });
  }
};

// Get location history
export const getLocationHistory = async (req: Request, res: Response) => {
  try {
    const { courier_id } = req.params;
    const { start_date, end_date, limit = 100 } = req.query;

    let sqlQuery = `
      SELECT 
        location_lat as lat,
        location_lng as lng,
        speed,
        heading,
        accuracy,
        recorded_at as timestamp
      FROM location_history
      WHERE courier_id = $1
    `;

    const params: any[] = [courier_id];
    let paramIndex = 2;

    if (start_date) {
      sqlQuery += ` AND recorded_at >= $${paramIndex++}`;
      params.push(start_date);
    }

    if (end_date) {
      sqlQuery += ` AND recorded_at <= $${paramIndex++}`;
      params.push(end_date);
    }

    sqlQuery += ` ORDER BY recorded_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query(sqlQuery, params);

    res.json({
      courier_id,
      history: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching location history:', error);
    res.status(500).json({ error: 'Failed to fetch location history' });
  }
};

// Get all active courier locations
export const getAllActiveLocations = async (req: Request, res: Response) => {
  try {
    // Get all active courier IDs from database
    const activeCouries = await query(`
      SELECT 
        c.id,
        c.full_name,
        c.phone,
        c.current_vehicle_id,
        v.plate_number,
        v.vehicle_type,
        cs.shift_start,
        r.route_number,
        r.orders_count
      FROM couriers c
      JOIN courier_shifts cs ON cs.courier_id = c.id
      LEFT JOIN vehicles v ON v.id = c.current_vehicle_id
      LEFT JOIN routes r ON r.courier_id = c.id AND r.status = 'active'
      WHERE cs.status = 'active'
      AND c.is_available = true
    `);

    // Get locations from Redis
    const locations = await Promise.all(
      activeCouries.rows.map(async (courier) => {
        const cachedLocation = await redisClient.get(`location:${courier.id}`);
        
        if (cachedLocation) {
          const location = JSON.parse(cachedLocation);
          return {
            ...courier,
            ...location
          };
        }
        
        // Fallback to database location
        return {
          ...courier,
          lat: courier.current_location_lat,
          lng: courier.current_location_lng,
          timestamp: courier.last_location_update
        };
      })
    );

    res.json({
      locations: locations.filter(l => l.lat && l.lng),
      total: locations.length
    });
  } catch (error) {
    logger.error('Error fetching active locations:', error);
    res.status(500).json({ error: 'Failed to fetch active locations' });
  }
};

// Calculate distance between two points
export const calculateDistance = async (req: Request, res: Response) => {
  try {
    const { from_lat, from_lng, to_lat, to_lng } = req.query;

    if (!from_lat || !from_lng || !to_lat || !to_lng) {
      return res.status(400).json({ 
        error: 'from_lat, from_lng, to_lat, to_lng are required' 
      });
    }

    // Using PostGIS for accurate distance calculation
    const result = await query(`
      SELECT ST_Distance(
        ST_MakePoint($1, $2)::geography,
        ST_MakePoint($3, $4)::geography
      ) as distance_meters
    `, [from_lng, from_lat, to_lng, to_lat]);

    const distanceMeters = result.rows[0].distance_meters;
    
    res.json({
      distance_meters: distanceMeters,
      distance_km: (distanceMeters / 1000).toFixed(2),
      distance_miles: (distanceMeters / 1609.34).toFixed(2)
    });
  } catch (error) {
    logger.error('Error calculating distance:', error);
    res.status(500).json({ error: 'Failed to calculate distance' });
  }
};

// Get couriers near location
export const getCouriersNearLocation = async (req: Request, res: Response) => {
  try {
    const { lat, lng, radius_km = 5 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ 
        error: 'lat and lng are required' 
      });
    }

    const radiusMeters = parseFloat(radius_km as string) * 1000;

    // Using PostGIS to find couriers within radius
    const result = await query(`
      SELECT 
        c.id,
        c.full_name,
        c.phone,
        c.current_location_lat as lat,
        c.current_location_lng as lng,
        c.is_available,
        v.plate_number,
        v.vehicle_type,
        ST_Distance(
          ST_MakePoint(c.current_location_lng, c.current_location_lat)::geography,
          ST_MakePoint($2, $1)::geography
        ) as distance_meters
      FROM couriers c
      LEFT JOIN vehicles v ON v.id = c.current_vehicle_id
      JOIN courier_shifts cs ON cs.courier_id = c.id
      WHERE cs.status = 'active'
      AND c.current_location_lat IS NOT NULL
      AND c.current_location_lng IS NOT NULL
      AND ST_DWithin(
        ST_MakePoint(c.current_location_lng, c.current_location_lat)::geography,
        ST_MakePoint($2, $1)::geography,
        $3
      )
      ORDER BY distance_meters ASC
    `, [lat, lng, radiusMeters]);

    res.json({
      center: { lat, lng },
      radius_km,
      couriers: result.rows.map(courier => ({
        ...courier,
        distance_km: (courier.distance_meters / 1000).toFixed(2)
      })),
      total: result.rows.length
    });
  } catch (error) {
    logger.error('Error finding nearby couriers:', error);
    res.status(500).json({ error: 'Failed to find nearby couriers' });
  }
};

// Track route progress
export const trackRouteProgress = async (req: Request, res: Response) => {
  try {
    const { route_id } = req.params;

    // Get route details with courier location
    const routeResult = await query(`
      SELECT 
        r.*,
        c.full_name as courier_name,
        c.current_location_lat as courier_lat,
        c.current_location_lng as courier_lng,
        v.plate_number,
        v.vehicle_type
      FROM routes r
      JOIN couriers c ON c.id = r.courier_id
      LEFT JOIN vehicles v ON v.id = c.current_vehicle_id
      WHERE r.id = $1
    `, [route_id]);

    if (routeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Get route orders with delivery status
    const ordersResult = await query(`
      SELECT 
        ro.*,
        o.delivery_address,
        o.delivery_lat,
        o.delivery_lng,
        o.customer_name,
        o.customer_phone
      FROM route_orders ro
      JOIN orders o ON o.id = ro.order_id
      WHERE ro.route_id = $1
      ORDER BY ro.sequence_number
    `, [route_id]);

    // Calculate progress
    const totalOrders = ordersResult.rows.length;
    const deliveredOrders = ordersResult.rows.filter(
      o => o.delivery_status === 'delivered'
    ).length;
    
    const progress = totalOrders > 0 
      ? Math.round((deliveredOrders / totalOrders) * 100) 
      : 0;

    res.json({
      route: routeResult.rows[0],
      orders: ordersResult.rows,
      progress: {
        total_orders: totalOrders,
        delivered_orders: deliveredOrders,
        pending_orders: totalOrders - deliveredOrders,
        percentage: progress
      }
    });
  } catch (error) {
    logger.error('Error tracking route progress:', error);
    res.status(500).json({ error: 'Failed to track route progress' });
  }
};