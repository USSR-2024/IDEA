// Test Supabase Connection for TMS Database
const { Client } = require('pg');

// Transaction Pooler connection string
const connectionString = 'postgresql://postgres.kvxcxindciifqhxqhenf:admin123@aws-1-eu-central-1.pooler.supabase.com:6543/postgres';

async function testConnection() {
    const client = new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('🔄 Connecting to Supabase TMS Database...');
        await client.connect();
        console.log('✅ Successfully connected to Supabase!\n');

        // Test 1: Check PostgreSQL version
        const versionResult = await client.query('SELECT version()');
        console.log('📊 PostgreSQL Version:');
        console.log(versionResult.rows[0].version);
        console.log('');

        // Test 2: Check if PostGIS is enabled
        try {
            const postgisResult = await client.query('SELECT PostGIS_Version()');
            console.log('🗺️  PostGIS Version:');
            console.log(postgisResult.rows[0].postgis_version);
            console.log('');
        } catch (err) {
            console.log('⚠️  PostGIS not installed or not accessible');
            console.log('');
        }

        // Test 3: List all tables in public schema
        const tablesQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `;
        
        const tablesResult = await client.query(tablesQuery);
        console.log('📋 Tables in TMS Database:');
        if (tablesResult.rows.length > 0) {
            tablesResult.rows.forEach(row => {
                console.log(`  - ${row.table_name}`);
            });
        } else {
            console.log('  No tables found. Database might need initialization.');
        }
        console.log('');

        // Test 4: Check for TMS specific tables
        const tmsTablesCheck = [
            'users',
            'stores', 
            'couriers',
            'vehicles',
            'orders',
            'routes',
            'route_orders'
        ];

        console.log('🔍 Checking TMS Core Tables:');
        for (const tableName of tmsTablesCheck) {
            const checkResult = await client.query(
                `SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                )`,
                [tableName]
            );
            const exists = checkResult.rows[0].exists;
            console.log(`  ${exists ? '✅' : '❌'} ${tableName}`);
        }
        console.log('');

        // Test 5: Check custom types
        const typesQuery = `
            SELECT typname 
            FROM pg_type 
            WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
            AND typtype = 'e'
            ORDER BY typname;
        `;
        
        const typesResult = await client.query(typesQuery);
        if (typesResult.rows.length > 0) {
            console.log('🎯 Custom Types (ENUM):');
            typesResult.rows.forEach(row => {
                console.log(`  - ${row.typname}`);
            });
            console.log('');
        }

        // Test 6: Count records in main tables (if they exist)
        console.log('📈 Record Counts:');
        const countTables = ['stores', 'couriers', 'vehicles', 'orders'];
        for (const table of countTables) {
            try {
                const countResult = await client.query(`SELECT COUNT(*) FROM ${table}`);
                console.log(`  - ${table}: ${countResult.rows[0].count} records`);
            } catch (err) {
                // Table doesn't exist
            }
        }
        console.log('');

        console.log('🎉 Database connection test completed successfully!');
        
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        console.error('Error details:', err);
    } finally {
        await client.end();
        console.log('\n🔚 Connection closed.');
    }
}

// Run the test
testConnection();