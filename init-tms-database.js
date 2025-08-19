// Initialize TMS Database in Supabase
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.kvxcxindciifqhxqhenf:admin123@aws-1-eu-central-1.pooler.supabase.com:6543/postgres';

async function initializeDatabase() {
    const client = new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('🔄 Connecting to Supabase...');
        await client.connect();
        console.log('✅ Connected successfully!\n');

        // Step 1: Enable extensions
        console.log('📦 Enabling PostgreSQL extensions...');
        try {
            await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
            console.log('  ✅ uuid-ossp enabled');
        } catch (err) {
            console.log('  ⚠️  uuid-ossp: ' + err.message);
        }

        try {
            await client.query(`CREATE EXTENSION IF NOT EXISTS "postgis";`);
            console.log('  ✅ postgis enabled');
        } catch (err) {
            console.log('  ⚠️  postgis might not be available in this Supabase plan');
            console.log('     Note: PostGIS requires a paid Supabase plan');
        }

        try {
            await client.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm";`);
            console.log('  ✅ pg_trgm enabled');
        } catch (err) {
            console.log('  ⚠️  pg_trgm: ' + err.message);
        }

        console.log('');

        // Step 2: Create custom types
        console.log('🎯 Creating custom types...');
        const types = [
            { name: 'user_role', values: "'admin', 'manager', 'dispatcher', 'viewer'" },
            { name: 'order_status', values: "'pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'" },
            { name: 'delivery_status', values: "'awaiting_pickup', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned'" },
            { name: 'courier_status', values: "'available', 'busy', 'offline', 'on_break'" },
            { name: 'vehicle_status', values: "'available', 'in_use', 'maintenance', 'offline'" },
            { name: 'vehicle_type', values: "'bike', 'scooter', 'car', 'van', 'truck'" },
            { name: 'shift_status', values: "'scheduled', 'active', 'completed', 'cancelled'" },
            { name: 'route_status', values: "'planned', 'active', 'completed', 'cancelled'" }
        ];

        for (const type of types) {
            try {
                await client.query(`DROP TYPE IF EXISTS ${type.name} CASCADE;`);
                await client.query(`CREATE TYPE ${type.name} AS ENUM (${type.values});`);
                console.log(`  ✅ ${type.name} created`);
            } catch (err) {
                console.log(`  ⚠️  ${type.name}: ${err.message}`);
            }
        }

        console.log('');

        // Step 3: Create tables
        console.log('📋 Creating TMS tables...');
        
        // Create tables in order of dependencies
        const tables = [
            {
                name: 'users',
                sql: `CREATE TABLE IF NOT EXISTS users (
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
                )`
            },
            {
                name: 'stores',
                sql: `CREATE TABLE IF NOT EXISTS stores (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    store_code VARCHAR(50) UNIQUE NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    address TEXT NOT NULL,
                    location_lat DECIMAL(10, 8),
                    location_lng DECIMAL(11, 8),
                    phone VARCHAR(20),
                    email VARCHAR(255),
                    working_hours JSONB,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )`
            },
            {
                name: 'vehicles',
                sql: `CREATE TABLE IF NOT EXISTS vehicles (
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
                    current_lat DECIMAL(10, 8),
                    current_lng DECIMAL(11, 8),
                    last_maintenance_date DATE,
                    next_maintenance_date DATE,
                    insurance_expiry DATE,
                    has_refrigeration BOOLEAN DEFAULT false,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )`
            },
            {
                name: 'couriers',
                sql: `CREATE TABLE IF NOT EXISTS couriers (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    employee_id VARCHAR(50) UNIQUE NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    phone VARCHAR(20) NOT NULL,
                    avatar_url TEXT,
                    status courier_status DEFAULT 'offline',
                    current_lat DECIMAL(10, 8),
                    current_lng DECIMAL(11, 8),
                    last_location_update TIMESTAMP WITH TIME ZONE,
                    rating DECIMAL(3,2) DEFAULT 5.00,
                    total_deliveries INTEGER DEFAULT 0,
                    driving_license_types TEXT[],
                    vehicle_id UUID REFERENCES vehicles(id),
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )`
            },
            {
                name: 'orders',
                sql: `CREATE TABLE IF NOT EXISTS orders (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    oms_order_id VARCHAR(100) UNIQUE NOT NULL,
                    order_number VARCHAR(50) NOT NULL,
                    customer_name VARCHAR(255) NOT NULL,
                    customer_phone VARCHAR(20) NOT NULL,
                    customer_email VARCHAR(255),
                    delivery_address TEXT NOT NULL,
                    delivery_lat DECIMAL(10, 8),
                    delivery_lng DECIMAL(11, 8),
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
                    metadata JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )`
            },
            {
                name: 'routes',
                sql: `CREATE TABLE IF NOT EXISTS routes (
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
                    route_polyline TEXT,
                    created_by UUID REFERENCES users(id),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )`
            },
            {
                name: 'route_orders',
                sql: `CREATE TABLE IF NOT EXISTS route_orders (
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
                )`
            },
            {
                name: 'courier_shifts',
                sql: `CREATE TABLE IF NOT EXISTS courier_shifts (
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
                )`
            },
            {
                name: 'location_history',
                sql: `CREATE TABLE IF NOT EXISTS location_history (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    courier_id UUID REFERENCES couriers(id),
                    location_lat DECIMAL(10, 8),
                    location_lng DECIMAL(11, 8),
                    speed_kmh DECIMAL(5,2),
                    heading DECIMAL(5,2),
                    accuracy_meters DECIMAL(5,2),
                    battery_level INTEGER,
                    is_moving BOOLEAN DEFAULT false,
                    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )`
            },
            {
                name: 'notifications',
                sql: `CREATE TABLE IF NOT EXISTS notifications (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID REFERENCES users(id),
                    type VARCHAR(50) NOT NULL,
                    severity VARCHAR(20) DEFAULT 'info',
                    title VARCHAR(255) NOT NULL,
                    message TEXT,
                    data JSONB,
                    is_read BOOLEAN DEFAULT false,
                    read_at TIMESTAMP WITH TIME ZONE,
                    action_url TEXT,
                    expires_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )`
            }
        ];

        for (const table of tables) {
            try {
                await client.query(table.sql);
                console.log(`  ✅ ${table.name} table created`);
            } catch (err) {
                console.log(`  ⚠️  ${table.name}: ${err.message}`);
            }
        }

        console.log('');

        // Step 4: Create indexes
        console.log('🔍 Creating indexes...');
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_orders_oms_order_id ON orders(oms_order_id)',
            'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
            'CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status)',
            'CREATE INDEX IF NOT EXISTS idx_routes_courier_id ON routes(courier_id)',
            'CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status)',
            'CREATE INDEX IF NOT EXISTS idx_route_orders_route_id ON route_orders(route_id)',
            'CREATE INDEX IF NOT EXISTS idx_route_orders_order_id ON route_orders(order_id)',
            'CREATE INDEX IF NOT EXISTS idx_location_history_courier_id ON location_history(courier_id)'
        ];

        for (const index of indexes) {
            try {
                await client.query(index);
                console.log(`  ✅ Index created`);
            } catch (err) {
                console.log(`  ⚠️  Index: ${err.message}`);
            }
        }

        console.log('');

        // Step 5: Create update trigger function
        console.log('⚙️  Creating trigger functions...');
        try {
            await client.query(`
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = NOW();
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
            `);
            console.log('  ✅ update_updated_at_column function created');
        } catch (err) {
            console.log('  ⚠️  Trigger function: ' + err.message);
        }

        // Apply triggers to tables
        const triggerTables = ['users', 'stores', 'couriers', 'vehicles', 'orders', 'routes', 'route_orders', 'courier_shifts'];
        for (const tableName of triggerTables) {
            try {
                await client.query(`
                    DROP TRIGGER IF EXISTS update_${tableName}_updated_at ON ${tableName};
                    CREATE TRIGGER update_${tableName}_updated_at 
                    BEFORE UPDATE ON ${tableName}
                    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
                `);
            } catch (err) {
                // Ignore trigger errors
            }
        }

        console.log('');

        // Step 6: Insert sample data
        console.log('📝 Inserting sample data...');
        
        // Insert sample stores
        try {
            await client.query(`
                INSERT INTO stores (store_code, name, address, location_lat, location_lng, phone, working_hours) 
                VALUES 
                    ('WH001', 'Центральный склад', 'ул. Складская, 1', 55.7558, 37.6173, '+7-495-123-4567', 
                     '{"mon": {"open": "08:00", "close": "20:00"}, "tue": {"open": "08:00", "close": "20:00"}}'),
                    ('WH002', 'Северный склад', 'ул. Северная, 15', 55.8290, 37.5894, '+7-495-234-5678',
                     '{"mon": {"open": "08:00", "close": "20:00"}, "tue": {"open": "08:00", "close": "20:00"}}')
                ON CONFLICT (store_code) DO NOTHING;
            `);
            console.log('  ✅ Sample stores inserted');
        } catch (err) {
            console.log('  ⚠️  Stores: ' + err.message);
        }

        // Insert sample vehicles
        try {
            await client.query(`
                INSERT INTO vehicles (registration_number, type, brand, model, year, status, max_weight_kg, max_volume_m3) 
                VALUES
                    ('А111АА77', 'car', 'Ford', 'Transit', 2022, 'available', 1000, 8),
                    ('В222ВВ77', 'van', 'Mercedes', 'Sprinter', 2021, 'available', 1500, 12),
                    ('С333СС77', 'bike', 'Yamaha', 'MT-07', 2023, 'available', 50, 0.5)
                ON CONFLICT (registration_number) DO NOTHING;
            `);
            console.log('  ✅ Sample vehicles inserted');
        } catch (err) {
            console.log('  ⚠️  Vehicles: ' + err.message);
        }

        // Insert sample couriers
        try {
            await client.query(`
                INSERT INTO couriers (employee_id, full_name, email, phone, status, driving_license_types) 
                VALUES
                    ('EMP001', 'Иван Петров', 'ivan@tms.com', '+7-916-123-4567', 'available', ARRAY['B', 'C']),
                    ('EMP002', 'Сергей Сидоров', 'sergey@tms.com', '+7-916-234-5678', 'available', ARRAY['B']),
                    ('EMP003', 'Алексей Козлов', 'alexey@tms.com', '+7-916-345-6789', 'offline', ARRAY['A', 'B'])
                ON CONFLICT (employee_id) DO NOTHING;
            `);
            console.log('  ✅ Sample couriers inserted');
        } catch (err) {
            console.log('  ⚠️  Couriers: ' + err.message);
        }

        console.log('\n✨ TMS Database initialization completed!');
        
        // Final check
        const tableCount = await client.query(`
            SELECT COUNT(*) 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        `);
        console.log(`\n📊 Total tables created: ${tableCount.rows[0].count}`);

    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error('Details:', err);
    } finally {
        await client.end();
        console.log('\n🔚 Connection closed.');
    }
}

// Run initialization
initializeDatabase();