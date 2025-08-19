import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pool, PoolClient } from 'pg';
import { config } from '@tms/config';

// Supabase Client for Auth and Realtime
let supabaseClient: SupabaseClient;

export const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseClient) {
    supabaseClient = createClient(
      config.supabase.url,
      config.supabase.serviceKey || config.supabase.anonKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: false
        }
      }
    );
  }
  return supabaseClient;
};

// PostgreSQL Pool for direct database access
let pgPool: Pool;

export const getPgPool = (): Pool => {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: config.supabase.database.connectionString,
      min: config.supabase.database.poolMin,
      max: config.supabase.database.poolMax,
      ssl: {
        rejectUnauthorized: false
      }
    });

    pgPool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return pgPool;
};

// Database query helper
export const query = async (text: string, params?: any[]): Promise<any> => {
  const pool = getPgPool();
  const result = await pool.query(text, params);
  return result;
};

// Transaction helper
export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const pool = getPgPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Database Types
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'dispatcher' | 'viewer';
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Courier {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url?: string;
  status: 'available' | 'busy' | 'offline' | 'on_break';
  current_lat?: number;
  current_lng?: number;
  last_location_update?: Date;
  rating: number;
  total_deliveries: number;
  driving_license_types: string[];
  vehicle_id?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Vehicle {
  id: string;
  registration_number: string;
  type: 'bike' | 'scooter' | 'car' | 'van' | 'truck';
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  status: 'available' | 'in_use' | 'maintenance' | 'offline';
  max_weight_kg?: number;
  max_volume_m3?: number;
  fuel_type?: string;
  current_lat?: number;
  current_lng?: number;
  last_maintenance_date?: Date;
  next_maintenance_date?: Date;
  insurance_expiry?: Date;
  has_refrigeration: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Order {
  id: string;
  oms_order_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address: string;
  delivery_lat?: number;
  delivery_lng?: number;
  delivery_notes?: string;
  preferred_delivery_date?: Date;
  preferred_delivery_time_start?: string;
  preferred_delivery_time_end?: string;
  order_value?: number;
  payment_method?: string;
  payment_status?: string;
  items_count?: number;
  total_weight_kg?: number;
  total_volume_m3?: number;
  requires_refrigeration: boolean;
  is_fragile: boolean;
  is_priority: boolean;
  store_id?: string;
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'cancelled';
  delivery_status: 'awaiting_pickup' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'returned';
  oms_sync_status?: string;
  last_oms_sync?: Date;
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

export interface Route {
  id: string;
  route_number: string;
  courier_id?: string;
  vehicle_id?: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  planned_start_time?: Date;
  actual_start_time?: Date;
  planned_end_time?: Date;
  actual_end_time?: Date;
  total_distance_km?: number;
  total_duration_minutes?: number;
  orders_count: number;
  completed_orders_count: number;
  optimization_score?: number;
  route_polyline?: string;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface RouteOrder {
  id: string;
  route_id: string;
  order_id: string;
  sequence_number: number;
  planned_arrival_time?: Date;
  actual_arrival_time?: Date;
  planned_departure_time?: Date;
  actual_departure_time?: Date;
  distance_from_previous_km?: number;
  duration_from_previous_minutes?: number;
  delivery_status: 'awaiting_pickup' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'returned';
  delivery_attempts: number;
  delivery_notes?: string;
  customer_signature_url?: string;
  photo_proof_url?: string;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Store {
  id: string;
  store_code: string;
  name: string;
  address: string;
  location_lat?: number;
  location_lng?: number;
  phone?: string;
  email?: string;
  working_hours?: any;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CourierShift {
  id: string;
  courier_id: string;
  shift_date: Date;
  start_time: string;
  end_time: string;
  actual_start_time?: Date;
  actual_end_time?: Date;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  break_duration_minutes: number;
  vehicle_id?: string;
  total_deliveries: number;
  total_distance_km?: number;
  notes?: string;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface LocationHistory {
  id: string;
  courier_id: string;
  location_lat?: number;
  location_lng?: number;
  speed_kmh?: number;
  heading?: number;
  accuracy_meters?: number;
  battery_level?: number;
  is_moving: boolean;
  recorded_at: Date;
  created_at: Date;
}

export interface Notification {
  id: string;
  user_id?: string;
  type: string;
  severity: string;
  title: string;
  message?: string;
  data?: any;
  is_read: boolean;
  read_at?: Date;
  action_url?: string;
  expires_at?: Date;
  created_at: Date;
}

// Close database connections
export const closeConnections = async () => {
  if (pgPool) {
    await pgPool.end();
  }
};

export default {
  getSupabaseClient,
  getPgPool,
  query,
  withTransaction,
  closeConnections
};