-- TMS (Transport Management System) Database Schema for Supabase
-- Version: 1.0.0
-- Description: Complete database schema for logistics TMS system with OMS integration

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search optimization

-- Create custom types
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'dispatcher', 'viewer');
CREATE TYPE order_status AS ENUM ('pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled');
CREATE TYPE delivery_status AS ENUM ('awaiting_pickup', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned');
CREATE TYPE courier_status AS ENUM ('available', 'busy', 'offline', 'on_break');
CREATE TYPE vehicle_status AS ENUM ('available', 'in_use', 'maintenance', 'offline');
CREATE TYPE vehicle_type AS ENUM ('bike', 'scooter', 'car', 'van', 'truck');
CREATE TYPE shift_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled');
CREATE TYPE route_status AS ENUM ('planned', 'active', 'completed', 'cancelled');

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Users table (for TMS managers and dispatchers)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'viewer',
    phone VARCHAR(20),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stores/Warehouses table
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    working_hours JSONB, -- {"mon": {"open": "09:00", "close": "18:00"}, ...}
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Couriers table
CREATE TABLE IF NOT EXISTS couriers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    avatar_url TEXT,
    status courier_status DEFAULT 'offline',
    current_location GEOGRAPHY(POINT, 4326),
    last_location_update TIMESTAMP WITH TIME ZONE,
    rating DECIMAL(3,2) DEFAULT 5.00,
    total_deliveries INTEGER DEFAULT 0,
    driving_license_types TEXT[], -- ['B', 'C', etc.]
    vehicle_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_number VARCHAR(50) UNIQUE NOT NULL,
    type vehicle_type NOT NULL,
    brand VARCHAR(100),
    model VARCHAR(100),
    year INTEGER,
    color VARCHAR(50),
    status vehicle_status DEFAULT 'available',
    max_weight_kg DECIMAL(10,2),
    max_volume_m3 DECIMAL(10,2),
    fuel_type VARCHAR(50),
    current_location GEOGRAPHY(POINT, 4326),
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    insurance_expiry DATE,
    has_refrigeration BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table (synced from OMS)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oms_order_id VARCHAR(100) UNIQUE NOT NULL, -- External OMS order ID
    order_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_email VARCHAR(255),
    delivery_address TEXT NOT NULL,
    delivery_location GEOGRAPHY(POINT, 4326),
    delivery_notes TEXT,
    preferred_delivery_date DATE,
    preferred_delivery_time_start TIME,
    preferred_delivery_time_end TIME,
    order_value DECIMAL(12,2),
    payment_method VARCHAR(50),
    payment_status VARCHAR(50),
    items_count INTEGER,
    total_weight_kg DECIMAL(10,2),
    total_volume_m3 DECIMAL(10,2),
    requires_refrigeration BOOLEAN DEFAULT false,
    is_fragile BOOLEAN DEFAULT false,
    is_priority BOOLEAN DEFAULT false,
    store_id UUID REFERENCES stores(id),
    status order_status DEFAULT 'pending',
    delivery_status delivery_status DEFAULT 'awaiting_pickup',
    oms_sync_status VARCHAR(50) DEFAULT 'synced',
    last_oms_sync TIMESTAMP WITH TIME ZONE,
    metadata JSONB, -- Additional data from OMS
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Routes table
CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_number VARCHAR(50) UNIQUE NOT NULL,
    courier_id UUID REFERENCES couriers(id),
    vehicle_id UUID REFERENCES vehicles(id),
    status route_status DEFAULT 'planned',
    planned_start_time TIMESTAMP WITH TIME ZONE,
    actual_start_time TIMESTAMP WITH TIME ZONE,
    planned_end_time TIMESTAMP WITH TIME ZONE,
    actual_end_time TIMESTAMP WITH TIME ZONE,
    total_distance_km DECIMAL(10,2),
    total_duration_minutes INTEGER,
    orders_count INTEGER DEFAULT 0,
    completed_orders_count INTEGER DEFAULT 0,
    optimization_score DECIMAL(5,2),
    route_polyline TEXT, -- Encoded polyline for the route
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Route orders (orders assigned to routes)
CREATE TABLE IF NOT EXISTS route_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id),
    sequence_number INTEGER NOT NULL,
    planned_arrival_time TIMESTAMP WITH TIME ZONE,
    actual_arrival_time TIMESTAMP WITH TIME ZONE,
    planned_departure_time TIMESTAMP WITH TIME ZONE,
    actual_departure_time TIMESTAMP WITH TIME ZONE,
    distance_from_previous_km DECIMAL(10,2),
    duration_from_previous_minutes INTEGER,
    delivery_status delivery_status DEFAULT 'awaiting_pickup',
    delivery_attempts INTEGER DEFAULT 0,
    delivery_notes TEXT,
    customer_signature_url TEXT,
    photo_proof_url TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(route_id, sequence_number)
);

-- Courier shifts
CREATE TABLE IF NOT EXISTS courier_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_id UUID REFERENCES couriers(id),
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    actual_start_time TIMESTAMP WITH TIME ZONE,
    actual_end_time TIMESTAMP WITH TIME ZONE,
    status shift_status DEFAULT 'scheduled',
    break_duration_minutes INTEGER DEFAULT 60,
    vehicle_id UUID REFERENCES vehicles(id),
    total_deliveries INTEGER DEFAULT 0,
    total_distance_km DECIMAL(10,2),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Location tracking history
CREATE TABLE IF NOT EXISTS location_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_id UUID REFERENCES couriers(id),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    speed_kmh DECIMAL(5,2),
    heading DECIMAL(5,2),
    accuracy_meters DECIMAL(5,2),
    battery_level INTEGER,
    is_moving BOOLEAN DEFAULT false,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Delivery attempts log
CREATE TABLE IF NOT EXISTS delivery_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    route_order_id UUID REFERENCES route_orders(id),
    courier_id UUID REFERENCES couriers(id),
    attempt_number INTEGER NOT NULL,
    attempt_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) NOT NULL,
    reason_code VARCHAR(50),
    reason_description TEXT,
    customer_available BOOLEAN,
    location GEOGRAPHY(POINT, 4326),
    photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications and alerts
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info', -- info, warning, error, critical
    title VARCHAR(255) NOT NULL,
    message TEXT,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    action_url TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance metrics (for analytics)
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_date DATE NOT NULL,
    metric_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50), -- 'courier', 'route', 'store', etc.
    entity_id UUID,
    metric_value DECIMAL(12,4),
    metric_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OMS Integration Log
CREATE TABLE IF NOT EXISTS oms_sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type VARCHAR(50) NOT NULL, -- 'order_import', 'status_update', etc.
    sync_status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'partial'
    records_processed INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_details JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Spatial indexes for location-based queries
CREATE INDEX idx_stores_location ON stores USING GIST(location);
CREATE INDEX idx_couriers_current_location ON couriers USING GIST(current_location);
CREATE INDEX idx_vehicles_current_location ON vehicles USING GIST(current_location);
CREATE INDEX idx_orders_delivery_location ON orders USING GIST(delivery_location);
CREATE INDEX idx_location_history_location ON location_history USING GIST(location);
CREATE INDEX idx_delivery_attempts_location ON delivery_attempts USING GIST(location);

-- Regular indexes for frequent queries
CREATE INDEX idx_orders_oms_order_id ON orders(oms_order_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_delivery_status ON orders(delivery_status);
CREATE INDEX idx_orders_store_id ON orders(store_id);
CREATE INDEX idx_orders_preferred_delivery_date ON orders(preferred_delivery_date);

CREATE INDEX idx_routes_courier_id ON routes(courier_id);
CREATE INDEX idx_routes_vehicle_id ON routes(vehicle_id);
CREATE INDEX idx_routes_status ON routes(status);
CREATE INDEX idx_routes_planned_start_time ON routes(planned_start_time);

CREATE INDEX idx_route_orders_route_id ON route_orders(route_id);
CREATE INDEX idx_route_orders_order_id ON route_orders(order_id);

CREATE INDEX idx_courier_shifts_courier_id ON courier_shifts(courier_id);
CREATE INDEX idx_courier_shifts_shift_date ON courier_shifts(shift_date);

CREATE INDEX idx_location_history_courier_id ON location_history(courier_id);
CREATE INDEX idx_location_history_recorded_at ON location_history(recorded_at);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

-- Text search indexes
CREATE INDEX idx_orders_customer_name ON orders USING GIN(to_tsvector('english', customer_name));
CREATE INDEX idx_orders_delivery_address ON orders USING GIN(to_tsvector('english', delivery_address));

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_couriers_updated_at BEFORE UPDATE ON couriers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_route_orders_updated_at BEFORE UPDATE ON route_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courier_shifts_updated_at BEFORE UPDATE ON courier_shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate distance between two points
CREATE OR REPLACE FUNCTION calculate_distance(
    point1 GEOGRAPHY(POINT, 4326),
    point2 GEOGRAPHY(POINT, 4326)
) RETURNS DECIMAL AS $$
BEGIN
    RETURN ST_Distance(point1, point2) / 1000; -- Return distance in kilometers
END;
$$ LANGUAGE plpgsql;

-- Function to find nearest available courier
CREATE OR REPLACE FUNCTION find_nearest_available_courier(
    delivery_location GEOGRAPHY(POINT, 4326),
    max_distance_km DECIMAL DEFAULT 10
) RETURNS TABLE (
    courier_id UUID,
    courier_name VARCHAR,
    distance_km DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.full_name,
        ST_Distance(c.current_location, delivery_location) / 1000 AS distance_km
    FROM couriers c
    WHERE c.status = 'available'
        AND c.is_active = true
        AND c.current_location IS NOT NULL
        AND ST_DWithin(c.current_location, delivery_location, max_distance_km * 1000)
    ORDER BY ST_Distance(c.current_location, delivery_location)
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Function to update route statistics
CREATE OR REPLACE FUNCTION update_route_statistics()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE routes
    SET 
        orders_count = (SELECT COUNT(*) FROM route_orders WHERE route_id = NEW.route_id),
        completed_orders_count = (
            SELECT COUNT(*) 
            FROM route_orders 
            WHERE route_id = NEW.route_id 
            AND delivery_status = 'delivered'
        )
    WHERE id = NEW.route_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_route_stats_on_route_order_change
    AFTER INSERT OR UPDATE OR DELETE ON route_orders
    FOR EACH ROW EXECUTE FUNCTION update_route_statistics();

-- Function to auto-update courier location from location history
CREATE OR REPLACE FUNCTION update_courier_location()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE couriers
    SET 
        current_location = NEW.location,
        last_location_update = NEW.recorded_at
    WHERE id = NEW.courier_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_courier_location_on_history
    AFTER INSERT ON location_history
    FOR EACH ROW EXECUTE FUNCTION update_courier_location();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE oms_sync_log ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
-- Note: These are basic policies. Adjust based on your authentication setup

-- Users can read all users but only update their own profile
CREATE POLICY "Users can view all users" ON users
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- All authenticated users can read stores
CREATE POLICY "Authenticated users can view stores" ON stores
    FOR SELECT USING (true);

-- All authenticated users can read couriers
CREATE POLICY "Authenticated users can view couriers" ON couriers
    FOR SELECT USING (true);

-- All authenticated users can read vehicles
CREATE POLICY "Authenticated users can view vehicles" ON vehicles
    FOR SELECT USING (true);

-- All authenticated users can read orders
CREATE POLICY "Authenticated users can view orders" ON orders
    FOR SELECT USING (true);

-- All authenticated users can manage routes
CREATE POLICY "Authenticated users can manage routes" ON routes
    FOR ALL USING (true);

-- All authenticated users can manage route orders
CREATE POLICY "Authenticated users can manage route orders" ON route_orders
    FOR ALL USING (true);

-- All authenticated users can manage courier shifts
CREATE POLICY "Authenticated users can manage courier shifts" ON courier_shifts
    FOR ALL USING (true);

-- Location history can be inserted by couriers and read by all
CREATE POLICY "Couriers can insert location history" ON location_history
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can view location history" ON location_history
    FOR SELECT USING (true);

-- All authenticated users can manage delivery attempts
CREATE POLICY "Authenticated users can manage delivery attempts" ON delivery_attempts
    FOR ALL USING (true);

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- All authenticated users can view metrics
CREATE POLICY "Authenticated users can view metrics" ON performance_metrics
    FOR SELECT USING (true);

-- All authenticated users can view sync logs
CREATE POLICY "Authenticated users can view sync logs" ON oms_sync_log
    FOR SELECT USING (true);

-- =====================================================
-- SAMPLE DATA (Optional - Remove in production)
-- =====================================================

-- Insert sample stores
INSERT INTO stores (store_code, name, address, location, phone, working_hours) VALUES
    ('WH001', 'Центральный склад', 'ул. Складская, 1', ST_GeogFromText('POINT(37.6173 55.7558)'), '+7-495-123-4567', 
     '{"mon": {"open": "08:00", "close": "20:00"}, "tue": {"open": "08:00", "close": "20:00"}, "wed": {"open": "08:00", "close": "20:00"}, "thu": {"open": "08:00", "close": "20:00"}, "fri": {"open": "08:00", "close": "20:00"}, "sat": {"open": "09:00", "close": "18:00"}, "sun": {"open": "10:00", "close": "16:00"}}'),
    ('WH002', 'Северный склад', 'ул. Северная, 15', ST_GeogFromText('POINT(37.5894 55.8290)'), '+7-495-234-5678',
     '{"mon": {"open": "08:00", "close": "20:00"}, "tue": {"open": "08:00", "close": "20:00"}, "wed": {"open": "08:00", "close": "20:00"}, "thu": {"open": "08:00", "close": "20:00"}, "fri": {"open": "08:00", "close": "20:00"}, "sat": {"open": "09:00", "close": "18:00"}, "sun": null}');

-- Insert sample vehicle types
INSERT INTO vehicles (registration_number, type, brand, model, year, status, max_weight_kg, max_volume_m3) VALUES
    ('А111АА77', 'car', 'Ford', 'Transit', 2022, 'available', 1000, 8),
    ('В222ВВ77', 'van', 'Mercedes', 'Sprinter', 2021, 'available', 1500, 12),
    ('С333СС77', 'bike', 'Yamaha', 'MT-07', 2023, 'available', 50, 0.5),
    ('М444ММ77', 'scooter', 'Honda', 'PCX', 2023, 'available', 30, 0.3);

-- Insert sample couriers
INSERT INTO couriers (employee_id, full_name, email, phone, status, driving_license_types) VALUES
    ('EMP001', 'Иван Петров', 'ivan@example.com', '+7-916-123-4567', 'available', ARRAY['B', 'C']),
    ('EMP002', 'Сергей Сидоров', 'sergey@example.com', '+7-916-234-5678', 'available', ARRAY['B']),
    ('EMP003', 'Алексей Козлов', 'alexey@example.com', '+7-916-345-6789', 'offline', ARRAY['A', 'B']);

-- Grant permissions for service role (adjust based on your Supabase setup)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;