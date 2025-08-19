import { Request, Response } from 'express';
import { query } from '@tms/database';
import { metricsCalculator, redisClient } from '../index';
import { logger } from '../utils/logger';

// Get dashboard overview
export const getDashboardOverview = async (req: Request, res: Response) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;

    // Try to get cached data first
    const cacheKey = `dashboard:overview:${date}`;
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Orders statistics
    const ordersStats = await query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
        COUNT(*) FILTER (WHERE status = 'assigned') as assigned_orders,
        COUNT(*) FILTER (WHERE status = 'in_transit') as in_transit_orders,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
        COUNT(*) FILTER (WHERE DATE(created_at) = $1) as today_orders,
        AVG(order_value) as avg_order_value,
        SUM(order_value) as total_order_value
      FROM orders
      WHERE DATE(created_at) <= $1
    `, [date]);

    // Couriers statistics
    const couriersStats = await query(`
      SELECT 
        COUNT(*) as total_couriers,
        COUNT(*) FILTER (WHERE status = 'active') as active_couriers,
        COUNT(*) FILTER (WHERE status = 'on_duty') as on_duty_couriers,
        COUNT(*) FILTER (WHERE is_available = true) as available_couriers,
        COUNT(DISTINCT cs.courier_id) as couriers_on_shift
      FROM couriers c
      LEFT JOIN courier_shifts cs ON cs.courier_id = c.id 
        AND cs.status = 'active'
      WHERE c.status != 'deleted'
    `);

    // Routes statistics
    const routesStats = await query(`
      SELECT 
        COUNT(*) as total_routes,
        COUNT(*) FILTER (WHERE status = 'planned') as planned_routes,
        COUNT(*) FILTER (WHERE status = 'active') as active_routes,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_routes,
        COUNT(*) FILTER (WHERE DATE(created_at) = $1) as today_routes,
        AVG(total_distance) as avg_route_distance,
        AVG(EXTRACT(EPOCH FROM (ended_at - started_at))/3600) as avg_route_duration_hours
      FROM routes
      WHERE DATE(created_at) <= $1
    `, [date]);

    // Performance metrics
    const performanceStats = await query(`
      SELECT 
        AVG(CASE 
          WHEN o.status = 'delivered' 
          THEN EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/3600 
        END) as avg_delivery_time_hours,
        COUNT(*) FILTER (WHERE o.status = 'delivered') * 100.0 / 
          NULLIF(COUNT(*), 0) as delivery_success_rate,
        AVG(r.delivered_count * 100.0 / NULLIF(r.orders_count, 0)) as route_completion_rate
      FROM orders o
      LEFT JOIN routes r ON r.created_at::date = $1
      WHERE o.created_at::date = $1
    `, [date]);

    // Vehicles statistics
    const vehiclesStats = await query(`
      SELECT 
        COUNT(*) as total_vehicles,
        COUNT(*) FILTER (WHERE status = 'available') as available_vehicles,
        COUNT(*) FILTER (WHERE status = 'in_use') as in_use_vehicles,
        COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance_vehicles
      FROM vehicles
      WHERE status != 'deleted'
    `);

    const dashboard = {
      date,
      orders: {
        ...ordersStats.rows[0],
        total_orders: parseInt(ordersStats.rows[0].total_orders),
        pending_orders: parseInt(ordersStats.rows[0].pending_orders),
        delivered_orders: parseInt(ordersStats.rows[0].delivered_orders)
      },
      couriers: {
        ...couriersStats.rows[0],
        total_couriers: parseInt(couriersStats.rows[0].total_couriers),
        active_couriers: parseInt(couriersStats.rows[0].active_couriers)
      },
      routes: {
        ...routesStats.rows[0],
        total_routes: parseInt(routesStats.rows[0].total_routes),
        active_routes: parseInt(routesStats.rows[0].active_routes)
      },
      performance: {
        ...performanceStats.rows[0],
        delivery_success_rate: parseFloat(performanceStats.rows[0]?.delivery_success_rate || 0).toFixed(2),
        avg_delivery_time_hours: parseFloat(performanceStats.rows[0]?.avg_delivery_time_hours || 0).toFixed(2)
      },
      vehicles: vehiclesStats.rows[0]
    };

    // Cache for 5 minutes
    await redisClient.setEx(cacheKey, 300, JSON.stringify(dashboard));

    res.json(dashboard);
  } catch (error) {
    logger.error('Error fetching dashboard overview:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

// Get real-time metrics
export const getRealTimeMetrics = async (req: Request, res: Response) => {
  try {
    // Active deliveries right now
    const activeDeliveries = await query(`
      SELECT 
        COUNT(DISTINCT o.id) as active_deliveries,
        COUNT(DISTINCT r.id) as active_routes,
        COUNT(DISTINCT r.courier_id) as active_couriers
      FROM orders o
      JOIN route_orders ro ON ro.order_id = o.id
      JOIN routes r ON r.id = ro.route_id
      WHERE r.status = 'active'
      AND o.delivery_status IN ('picked_up', 'in_transit')
    `);

    // Orders in last hour
    const recentOrders = await query(`
      SELECT 
        COUNT(*) as orders_last_hour,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_last_hour
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '1 hour'
    `);

    // Current courier locations
    const courierLocations = await query(`
      SELECT 
        c.id,
        c.full_name,
        c.current_location_lat,
        c.current_location_lng,
        cs.shift_start,
        r.route_number,
        r.orders_count,
        r.delivered_count
      FROM couriers c
      JOIN courier_shifts cs ON cs.courier_id = c.id
      LEFT JOIN routes r ON r.courier_id = c.id AND r.status = 'active'
      WHERE cs.status = 'active'
      AND c.current_location_lat IS NOT NULL
    `);

    res.json({
      timestamp: new Date().toISOString(),
      active: activeDeliveries.rows[0],
      recent: recentOrders.rows[0],
      courier_locations: courierLocations.rows
    });
  } catch (error) {
    logger.error('Error fetching real-time metrics:', error);
    res.status(500).json({ error: 'Failed to fetch real-time metrics' });
  }
};

// Get KPI metrics
export const getKPIMetrics = async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (start_date && end_date) {
      dateFilter = 'WHERE o.created_at BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    } else {
      // Default to last 30 days
      dateFilter = "WHERE o.created_at >= NOW() - INTERVAL '30 days'";
    }

    // Calculate KPIs
    const kpiResult = await query(`
      SELECT 
        -- Delivery KPIs
        COUNT(DISTINCT o.id) as total_deliveries,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') as successful_deliveries,
        AVG(CASE 
          WHEN o.status = 'delivered' 
          THEN EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/3600 
        END) as avg_delivery_time_hours,
        PERCENTILE_CONT(0.95) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/3600
        ) FILTER (WHERE o.status = 'delivered') as delivery_time_95th_percentile,
        
        -- Route KPIs
        COUNT(DISTINCT r.id) as total_routes,
        AVG(r.total_distance) as avg_route_distance_km,
        AVG(r.delivered_count::float / NULLIF(r.orders_count, 0) * 100) as avg_route_completion_rate,
        
        -- Courier KPIs
        COUNT(DISTINCT r.courier_id) as active_couriers,
        AVG(r.delivered_count) as avg_deliveries_per_courier,
        
        -- Financial KPIs
        SUM(o.order_value) as total_revenue,
        AVG(o.order_value) as avg_order_value,
        SUM(o.order_value) / NULLIF(COUNT(DISTINCT r.courier_id), 0) as revenue_per_courier
        
      FROM orders o
      LEFT JOIN route_orders ro ON ro.order_id = o.id
      LEFT JOIN routes r ON r.id = ro.route_id
      ${dateFilter}
    `, params);

    const kpis = kpiResult.rows[0];

    // Calculate SLA compliance
    const slaResult = await query(`
      SELECT 
        COUNT(*) FILTER (
          WHERE EXTRACT(EPOCH FROM (updated_at - created_at))/3600 <= 24
        ) * 100.0 / NULLIF(COUNT(*), 0) as sla_24h_compliance,
        COUNT(*) FILTER (
          WHERE EXTRACT(EPOCH FROM (updated_at - created_at))/3600 <= 48
        ) * 100.0 / NULLIF(COUNT(*), 0) as sla_48h_compliance
      FROM orders
      ${dateFilter}
      AND status = 'delivered'
    `, params);

    res.json({
      period: {
        start: start_date || 'last_30_days',
        end: end_date || 'today'
      },
      delivery_kpis: {
        total_deliveries: parseInt(kpis.total_deliveries),
        successful_deliveries: parseInt(kpis.successful_deliveries),
        success_rate: ((parseInt(kpis.successful_deliveries) / parseInt(kpis.total_deliveries)) * 100).toFixed(2),
        avg_delivery_time_hours: parseFloat(kpis.avg_delivery_time_hours).toFixed(2),
        delivery_time_95th_percentile: parseFloat(kpis.delivery_time_95th_percentile).toFixed(2)
      },
      route_kpis: {
        total_routes: parseInt(kpis.total_routes),
        avg_route_distance_km: parseFloat(kpis.avg_route_distance_km).toFixed(2),
        avg_route_completion_rate: parseFloat(kpis.avg_route_completion_rate).toFixed(2)
      },
      courier_kpis: {
        active_couriers: parseInt(kpis.active_couriers),
        avg_deliveries_per_courier: parseFloat(kpis.avg_deliveries_per_courier).toFixed(2)
      },
      financial_kpis: {
        total_revenue: parseFloat(kpis.total_revenue).toFixed(2),
        avg_order_value: parseFloat(kpis.avg_order_value).toFixed(2),
        revenue_per_courier: parseFloat(kpis.revenue_per_courier).toFixed(2)
      },
      sla_compliance: {
        within_24h: parseFloat(slaResult.rows[0]?.sla_24h_compliance || 0).toFixed(2),
        within_48h: parseFloat(slaResult.rows[0]?.sla_48h_compliance || 0).toFixed(2)
      }
    });
  } catch (error) {
    logger.error('Error fetching KPI metrics:', error);
    res.status(500).json({ error: 'Failed to fetch KPI metrics' });
  }
};

// Get hourly distribution
export const getHourlyDistribution = async (req: Request, res: Response) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;

    const hourlyData = await query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as orders_created,
        COUNT(*) FILTER (WHERE status = 'delivered') as orders_delivered
      FROM orders
      WHERE DATE(created_at) = $1
      GROUP BY hour
      ORDER BY hour
    `, [date]);

    res.json({
      date,
      hourly_distribution: hourlyData.rows
    });
  } catch (error) {
    logger.error('Error fetching hourly distribution:', error);
    res.status(500).json({ error: 'Failed to fetch hourly distribution' });
  }
};