// Add Manager and Couriers to TMS Database
const { Client } = require('pg');

const connectionString = 'postgresql://postgres.kvxcxindciifqhxqhenf:admin123@aws-1-eu-central-1.pooler.supabase.com:6543/postgres';

async function addUsersAndCouriers() {
    const client = new Client({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('🔄 Connecting to Supabase TMS Database...');
        await client.connect();
        console.log('✅ Connected successfully!\n');

        // Step 1: Add Manager to users table
        console.log('👔 Adding Manager...');
        try {
            await client.query(`
                INSERT INTO users (email, full_name, role, phone, is_active) 
                VALUES 
                    ('manager@tms-logistics.ru', 'Михаил Логистов', 'manager', '+7-495-555-0001', true)
                ON CONFLICT (email) DO UPDATE
                SET full_name = EXCLUDED.full_name,
                    role = EXCLUDED.role,
                    phone = EXCLUDED.phone;
            `);
            console.log('  ✅ Manager added: Михаил Логистов (manager@tms-logistics.ru)');
        } catch (err) {
            console.log('  ⚠️  Manager: ' + err.message);
        }

        console.log('');

        // Step 2: Clear existing couriers (except the first 3 samples)
        console.log('🧹 Preparing courier list...');
        
        // Step 3: Add 15 diverse couriers
        console.log('🚚 Adding 15 Couriers...');
        
        const couriers = [
            // Опытные курьеры на автомобилях
            {
                employee_id: 'CUR001',
                full_name: 'Александр Быстров',
                email: 'a.bystrov@tms.ru',
                phone: '+7-916-111-0001',
                status: 'available',
                rating: 4.9,
                total_deliveries: 1250,
                licenses: ['B', 'C'],
                lat: 55.7558,
                lng: 37.6173
            },
            {
                employee_id: 'CUR002',
                full_name: 'Дмитрий Северов',
                email: 'd.severov@tms.ru',
                phone: '+7-916-111-0002',
                status: 'busy',
                rating: 4.8,
                total_deliveries: 980,
                licenses: ['B'],
                lat: 55.7658,
                lng: 37.6273
            },
            {
                employee_id: 'CUR003',
                full_name: 'Сергей Надежный',
                email: 's.nadezhny@tms.ru',
                phone: '+7-916-111-0003',
                status: 'available',
                rating: 5.0,
                total_deliveries: 2100,
                licenses: ['B', 'C', 'D'],
                lat: 55.7458,
                lng: 37.6073
            },
            
            // Курьеры на фургонах
            {
                employee_id: 'CUR004',
                full_name: 'Михаил Грузов',
                email: 'm.gruzov@tms.ru',
                phone: '+7-916-111-0004',
                status: 'available',
                rating: 4.7,
                total_deliveries: 650,
                licenses: ['B', 'C'],
                lat: 55.7758,
                lng: 37.6373
            },
            {
                employee_id: 'CUR005',
                full_name: 'Андрей Доставкин',
                email: 'a.dostavkin@tms.ru',
                phone: '+7-916-111-0005',
                status: 'on_break',
                rating: 4.6,
                total_deliveries: 430,
                licenses: ['B', 'C'],
                lat: 55.7358,
                lng: 37.5973
            },
            
            // Курьеры на мотоциклах/скутерах
            {
                employee_id: 'CUR006',
                full_name: 'Владимир Скоростной',
                email: 'v.skorostnoy@tms.ru',
                phone: '+7-916-111-0006',
                status: 'available',
                rating: 4.9,
                total_deliveries: 3200,
                licenses: ['A', 'B'],
                lat: 55.7858,
                lng: 37.6473
            },
            {
                employee_id: 'CUR007',
                full_name: 'Павел Мобильный',
                email: 'p.mobilny@tms.ru',
                phone: '+7-916-111-0007',
                status: 'busy',
                rating: 4.8,
                total_deliveries: 2800,
                licenses: ['A'],
                lat: 55.7958,
                lng: 37.6573
            },
            {
                employee_id: 'CUR008',
                full_name: 'Егор Быстрых',
                email: 'e.bystrykh@tms.ru',
                phone: '+7-916-111-0008',
                status: 'available',
                rating: 4.7,
                total_deliveries: 1900,
                licenses: ['A', 'A1'],
                lat: 55.8058,
                lng: 37.6673
            },
            
            // Новые курьеры
            {
                employee_id: 'CUR009',
                full_name: 'Николай Новичков',
                email: 'n.novichkov@tms.ru',
                phone: '+7-916-111-0009',
                status: 'offline',
                rating: 4.5,
                total_deliveries: 120,
                licenses: ['B'],
                lat: null,
                lng: null
            },
            {
                employee_id: 'CUR010',
                full_name: 'Олег Стажёров',
                email: 'o.stazherov@tms.ru',
                phone: '+7-916-111-0010',
                status: 'available',
                rating: 4.3,
                total_deliveries: 85,
                licenses: ['B'],
                lat: 55.7258,
                lng: 37.5873
            },
            
            // Ночные курьеры
            {
                employee_id: 'CUR011',
                full_name: 'Антон Ночной',
                email: 'a.nochnoy@tms.ru',
                phone: '+7-916-111-0011',
                status: 'offline',
                rating: 4.9,
                total_deliveries: 890,
                licenses: ['B', 'C'],
                lat: null,
                lng: null
            },
            {
                employee_id: 'CUR012',
                full_name: 'Роман Полуночников',
                email: 'r.polunochnikov@tms.ru',
                phone: '+7-916-111-0012',
                status: 'offline',
                rating: 4.8,
                total_deliveries: 760,
                licenses: ['B'],
                lat: null,
                lng: null
            },
            
            // Курьеры премиум-сегмента
            {
                employee_id: 'CUR013',
                full_name: 'Виктор Премиум',
                email: 'v.premium@tms.ru',
                phone: '+7-916-111-0013',
                status: 'available',
                rating: 5.0,
                total_deliveries: 520,
                licenses: ['B'],
                lat: 55.7158,
                lng: 37.5773
            },
            {
                employee_id: 'CUR014',
                full_name: 'Константин Деликатный',
                email: 'k.delikatny@tms.ru',
                phone: '+7-916-111-0014',
                status: 'busy',
                rating: 4.95,
                total_deliveries: 410,
                licenses: ['B'],
                lat: 55.7058,
                lng: 37.5673
            },
            
            // Универсальный курьер
            {
                employee_id: 'CUR015',
                full_name: 'Максим Универсал',
                email: 'm.universal@tms.ru',
                phone: '+7-916-111-0015',
                status: 'available',
                rating: 4.85,
                total_deliveries: 1650,
                licenses: ['A', 'B', 'C'],
                lat: 55.6958,
                lng: 37.5573
            }
        ];

        let addedCount = 0;
        let updatedCount = 0;

        for (const courier of couriers) {
            try {
                const result = await client.query(`
                    INSERT INTO couriers (
                        employee_id, 
                        full_name, 
                        email, 
                        phone, 
                        status, 
                        rating,
                        total_deliveries,
                        driving_license_types,
                        current_lat,
                        current_lng,
                        last_location_update,
                        is_active
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (employee_id) DO UPDATE
                    SET full_name = EXCLUDED.full_name,
                        status = EXCLUDED.status,
                        rating = EXCLUDED.rating,
                        total_deliveries = EXCLUDED.total_deliveries,
                        current_lat = EXCLUDED.current_lat,
                        current_lng = EXCLUDED.current_lng,
                        last_location_update = EXCLUDED.last_location_update
                    RETURNING (xmax = 0) AS inserted;
                `, [
                    courier.employee_id,
                    courier.full_name,
                    courier.email,
                    courier.phone,
                    courier.status,
                    courier.rating,
                    courier.total_deliveries,
                    courier.licenses,
                    courier.lat,
                    courier.lng,
                    courier.lat ? new Date() : null,
                    true
                ]);
                
                if (result.rows[0].inserted) {
                    addedCount++;
                    console.log(`  ✅ Added: ${courier.full_name} (${courier.employee_id}) - ${courier.status}`);
                } else {
                    updatedCount++;
                    console.log(`  🔄 Updated: ${courier.full_name} (${courier.employee_id})`);
                }
            } catch (err) {
                console.log(`  ❌ Error with ${courier.full_name}: ${err.message}`);
            }
        }

        console.log('');
        console.log(`📊 Summary:`);
        console.log(`  • New couriers added: ${addedCount}`);
        console.log(`  • Existing couriers updated: ${updatedCount}`);
        console.log('');

        // Step 4: Show statistics
        const stats = await client.query(`
            SELECT 
                COUNT(*) as total_couriers,
                COUNT(*) FILTER (WHERE status = 'available') as available,
                COUNT(*) FILTER (WHERE status = 'busy') as busy,
                COUNT(*) FILTER (WHERE status = 'on_break') as on_break,
                COUNT(*) FILTER (WHERE status = 'offline') as offline,
                AVG(rating) as avg_rating,
                SUM(total_deliveries) as total_deliveries_all
            FROM couriers
            WHERE is_active = true;
        `);

        const stat = stats.rows[0];
        console.log('📈 Courier Fleet Statistics:');
        console.log(`  • Total active couriers: ${stat.total_couriers}`);
        console.log(`  • Available: ${stat.available}`);
        console.log(`  • Busy: ${stat.busy}`);
        console.log(`  • On break: ${stat.on_break}`);
        console.log(`  • Offline: ${stat.offline}`);
        console.log(`  • Average rating: ${parseFloat(stat.avg_rating).toFixed(2)}`);
        console.log(`  • Total deliveries completed: ${stat.total_deliveries_all}`);

        console.log('\n✨ Users and Couriers successfully added to TMS!');

    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error('Details:', err);
    } finally {
        await client.end();
        console.log('\n🔚 Connection closed.');
    }
}

// Run the script
addUsersAndCouriers();