-- TMS Supabase Edge Functions and Advanced Features
-- Version: 1.0.0
-- Description: Edge functions, realtime subscriptions, and advanced features for TMS

-- =====================================================
-- REALTIME SUBSCRIPTIONS SETUP
-- =====================================================

-- Enable realtime for critical tables
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE routes;
ALTER PUBLICATION supabase_realtime ADD TABLE route_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE couriers;
ALTER PUBLICATION supabase_realtime ADD TABLE location_history;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- =====================================================
-- STORED PROCEDURES FOR COMPLEX OPERATIONS
-- =====================================================

-- Procedure to assign order to route
CREATE OR REPLACE FUNCTION assign_order_to_route(
    p_order_id UUID,
    p_route_id UUID,
    p_sequence_number INTEGER
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_route_order_id UUID;
BEGIN
    -- Check if order exists and is not already assigned
    IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id AND status = 'pending') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found or already assigned');
    END IF;
    
    -- Check if route exists and is active
    IF NOT EXISTS (SELECT 1 FROM routes WHERE id = p_route_id AND status IN ('planned', 'active')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Route not found or not active');
    END IF;
    
    -- Insert into route_orders
    INSERT INTO route_orders (route_id, order_id, sequence_number)
    VALUES (p_route_id, p_order_id, p_sequence_number)
    RETURNING id INTO v_route_order_id;
    
    -- Update order status
    UPDATE orders 
    SET status = 'assigned', 
        delivery_status = 'awaiting_pickup',
        updated_at = NOW()
    WHERE id = p_order_id;
    
    -- Update route statistics
    UPDATE routes
    SET orders_count = orders_count + 1,
        updated_at = NOW()
    WHERE id = p_route_id;
    
    RETURN jsonb_build_object(
        'success', true, 
        'route_order_id', v_route_order_id,
        'message', 'Order successfully assigned to route'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Procedure to optimize route order sequence
CREATE OR REPLACE FUNCTION optimize_route_sequence(
    p_route_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_courier_location GEOGRAPHY(POINT, 4326);
    v_store_location GEOGRAPHY(POINT, 4326);
    v_optimized_sequence INTEGER := 1;
    r RECORD;
BEGIN
    -- Get courier's current location
    SELECT c.current_location INTO v_courier_location
    FROM routes r
    JOIN couriers c ON c.id = r.courier_id
    WHERE r.id = p_route_id;
    
    -- Get store location (first pickup point)
    SELECT s.location INTO v_store_location
    FROM route_orders ro
    JOIN orders o ON o.id = ro.order_id
    JOIN stores s ON s.id = o.store_id
    WHERE ro.route_id = p_route_id
    LIMIT 1;
    
    -- Use nearest neighbor algorithm for simple optimization
    -- In production, you'd want to use a more sophisticated algorithm
    FOR r IN (
        SELECT ro.id, o.delivery_location
        FROM route_orders ro
        JOIN orders o ON o.id = ro.order_id
        WHERE ro.route_id = p_route_id
        ORDER BY ST_Distance(COALESCE(v_courier_location, v_store_location), o.delivery_location)
    ) LOOP
        UPDATE route_orders
        SET sequence_number = v_optimized_sequence
        WHERE id = r.id;
        
        v_optimized_sequence := v_optimized_sequence + 1;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Route sequence optimized',
        'orders_count', v_optimized_sequence - 1
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to start courier shift
CREATE OR REPLACE FUNCTION start_courier_shift(
    p_courier_id UUID,
    p_vehicle_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_shift_id UUID;
    v_current_shift_id UUID;
BEGIN
    -- Check if courier already has an active shift
    SELECT id INTO v_current_shift_id
    FROM courier_shifts
    WHERE courier_id = p_courier_id
        AND status = 'active'
        AND shift_date = CURRENT_DATE;
    
    IF v_current_shift_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Courier already has an active shift');
    END IF;
    
    -- Find scheduled shift for today
    SELECT id INTO v_shift_id
    FROM courier_shifts
    WHERE courier_id = p_courier_id
        AND shift_date = CURRENT_DATE
        AND status = 'scheduled';
    
    IF v_shift_id IS NULL THEN
        -- Create new shift if none scheduled
        INSERT INTO courier_shifts (courier_id, shift_date, start_time, end_time, vehicle_id, status, actual_start_time)
        VALUES (p_courier_id, CURRENT_DATE, LOCALTIME, LOCALTIME + INTERVAL '8 hours', p_vehicle_id, 'active', NOW())
        RETURNING id INTO v_shift_id;
    ELSE
        -- Update existing scheduled shift
        UPDATE courier_shifts
        SET status = 'active',
            actual_start_time = NOW(),
            vehicle_id = COALESCE(p_vehicle_id, vehicle_id)
        WHERE id = v_shift_id;
    END IF;
    
    -- Update courier status
    UPDATE couriers
    SET status = 'available',
        vehicle_id = p_vehicle_id
    WHERE id = p_courier_id;
    
    -- Update vehicle status if assigned
    IF p_vehicle_id IS NOT NULL THEN
        UPDATE vehicles
        SET status = 'in_use'
        WHERE id = p_vehicle_id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'shift_id', v_shift_id,
        'message', 'Shift started successfully'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete delivery
CREATE OR REPLACE FUNCTION complete_delivery(
    p_route_order_id UUID,
    p_signature_url TEXT DEFAULT NULL,
    p_photo_url TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_order_id UUID;
    v_route_id UUID;
    v_courier_id UUID;
BEGIN
    -- Get order and route info
    SELECT ro.order_id, ro.route_id, r.courier_id
    INTO v_order_id, v_route_id, v_courier_id
    FROM route_orders ro
    JOIN routes r ON r.id = ro.route_id
    WHERE ro.id = p_route_order_id;
    
    -- Update route_order
    UPDATE route_orders
    SET delivery_status = 'delivered',
        actual_arrival_time = NOW(),
        actual_departure_time = NOW(),
        customer_signature_url = p_signature_url,
        photo_proof_url = p_photo_url,
        delivery_notes = p_notes,
        completed_at = NOW()
    WHERE id = p_route_order_id;
    
    -- Update order status
    UPDATE orders
    SET status = 'delivered',
        delivery_status = 'delivered'
    WHERE id = v_order_id;
    
    -- Update courier statistics
    UPDATE couriers
    SET total_deliveries = total_deliveries + 1
    WHERE id = v_courier_id;
    
    -- Create notification for successful delivery
    INSERT INTO notifications (user_id, type, severity, title, message, data)
    SELECT 
        u.id,
        'delivery_completed',
        'info',
        'Delivery Completed',
        'Order ' || o.order_number || ' has been delivered successfully',
        jsonb_build_object('order_id', v_order_id, 'route_order_id', p_route_order_id)
    FROM orders o, users u
    WHERE o.id = v_order_id
        AND u.role IN ('admin', 'manager');
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Delivery completed successfully',
        'order_id', v_order_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync orders from OMS
CREATE OR REPLACE FUNCTION sync_orders_from_oms(
    p_orders JSONB
) RETURNS JSONB AS $$
DECLARE
    v_order JSONB;
    v_inserted_count INTEGER := 0;
    v_updated_count INTEGER := 0;
    v_sync_log_id UUID;
BEGIN
    -- Create sync log entry
    INSERT INTO oms_sync_log (sync_type, sync_status, started_at)
    VALUES ('order_import', 'in_progress', NOW())
    RETURNING id INTO v_sync_log_id;
    
    -- Process each order from OMS
    FOR v_order IN SELECT * FROM jsonb_array_elements(p_orders)
    LOOP
        -- Insert or update order
        INSERT INTO orders (
            oms_order_id,
            order_number,
            customer_name,
            customer_phone,
            customer_email,
            delivery_address,
            delivery_location,
            order_value,
            payment_method,
            payment_status,
            items_count,
            total_weight_kg,
            metadata,
            last_oms_sync
        ) VALUES (
            v_order->>'oms_order_id',
            v_order->>'order_number',
            v_order->>'customer_name',
            v_order->>'customer_phone',
            v_order->>'customer_email',
            v_order->>'delivery_address',
            ST_GeogFromText('POINT(' || (v_order->>'longitude') || ' ' || (v_order->>'latitude') || ')'),
            (v_order->>'order_value')::DECIMAL,
            v_order->>'payment_method',
            v_order->>'payment_status',
            (v_order->>'items_count')::INTEGER,
            (v_order->>'total_weight')::DECIMAL,
            v_order->'metadata',
            NOW()
        )
        ON CONFLICT (oms_order_id) DO UPDATE
        SET 
            customer_name = EXCLUDED.customer_name,
            customer_phone = EXCLUDED.customer_phone,
            delivery_address = EXCLUDED.delivery_address,
            order_value = EXCLUDED.order_value,
            metadata = EXCLUDED.metadata,
            last_oms_sync = NOW(),
            updated_at = NOW();
        
        IF FOUND THEN
            v_inserted_count := v_inserted_count + 1;
        ELSE
            v_updated_count := v_updated_count + 1;
        END IF;
    END LOOP;
    
    -- Update sync log
    UPDATE oms_sync_log
    SET sync_status = 'success',
        records_processed = v_inserted_count + v_updated_count,
        completed_at = NOW()
    WHERE id = v_sync_log_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'inserted', v_inserted_count,
        'updated', v_updated_count,
        'sync_log_id', v_sync_log_id
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Update sync log with error
        UPDATE oms_sync_log
        SET sync_status = 'failed',
            error_details = jsonb_build_object('error', SQLERRM),
            completed_at = NOW()
        WHERE id = v_sync_log_id;
        
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- ANALYTICS FUNCTIONS
-- =====================================================

-- Function to get dashboard metrics
CREATE OR REPLACE FUNCTION get_dashboard_metrics(
    p_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB AS $$
DECLARE
    v_metrics JSONB;
BEGIN
    SELECT jsonb_build_object(
        'date', p_date,
        'orders', jsonb_build_object(
            'total', COUNT(*) FILTER (WHERE DATE(created_at) = p_date),
            'pending', COUNT(*) FILTER (WHERE status = 'pending' AND DATE(created_at) = p_date),
            'in_transit', COUNT(*) FILTER (WHERE status = 'in_transit' AND DATE(created_at) = p_date),
            'delivered', COUNT(*) FILTER (WHERE status = 'delivered' AND DATE(created_at) = p_date),
            'failed', COUNT(*) FILTER (WHERE status = 'failed' AND DATE(created_at) = p_date)
        ),
        'couriers', jsonb_build_object(
            'total', (SELECT COUNT(*) FROM couriers WHERE is_active = true),
            'available', (SELECT COUNT(*) FROM couriers WHERE status = 'available'),
            'busy', (SELECT COUNT(*) FROM couriers WHERE status = 'busy'),
            'offline', (SELECT COUNT(*) FROM couriers WHERE status = 'offline')
        ),
        'routes', jsonb_build_object(
            'total', (SELECT COUNT(*) FROM routes WHERE DATE(planned_start_time) = p_date),
            'planned', (SELECT COUNT(*) FROM routes WHERE status = 'planned' AND DATE(planned_start_time) = p_date),
            'active', (SELECT COUNT(*) FROM routes WHERE status = 'active' AND DATE(planned_start_time) = p_date),
            'completed', (SELECT COUNT(*) FROM routes WHERE status = 'completed' AND DATE(planned_start_time) = p_date)
        ),
        'performance', jsonb_build_object(
            'avg_delivery_time', (
                SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60)
                FROM route_orders
                WHERE delivery_status = 'delivered'
                    AND DATE(completed_at) = p_date
            ),
            'delivery_success_rate', (
                SELECT 
                    CASE 
                        WHEN COUNT(*) > 0 THEN 
                            (COUNT(*) FILTER (WHERE delivery_status = 'delivered'))::FLOAT / COUNT(*) * 100
                        ELSE 0
                    END
                FROM route_orders
                WHERE DATE(created_at) = p_date
            )
        )
    ) INTO v_metrics
    FROM orders;
    
    RETURN v_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get courier performance metrics
CREATE OR REPLACE FUNCTION get_courier_performance(
    p_courier_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS JSONB AS $$
DECLARE
    v_metrics JSONB;
BEGIN
    SELECT jsonb_build_object(
        'courier_id', p_courier_id,
        'period', jsonb_build_object('start', p_start_date, 'end', p_end_date),
        'deliveries', jsonb_build_object(
            'total', COUNT(*),
            'successful', COUNT(*) FILTER (WHERE ro.delivery_status = 'delivered'),
            'failed', COUNT(*) FILTER (WHERE ro.delivery_status = 'failed')
        ),
        'performance', jsonb_build_object(
            'avg_delivery_time_minutes', AVG(
                EXTRACT(EPOCH FROM (ro.completed_at - ro.created_at))/60
            ) FILTER (WHERE ro.delivery_status = 'delivered'),
            'total_distance_km', SUM(ro.distance_from_previous_km),
            'success_rate', 
                CASE 
                    WHEN COUNT(*) > 0 THEN 
                        (COUNT(*) FILTER (WHERE ro.delivery_status = 'delivered'))::FLOAT / COUNT(*) * 100
                    ELSE 0
                END
        ),
        'shifts', jsonb_build_object(
            'total_shifts', (
                SELECT COUNT(*) 
                FROM courier_shifts 
                WHERE courier_id = p_courier_id 
                    AND shift_date BETWEEN p_start_date AND p_end_date
            ),
            'total_hours', (
                SELECT SUM(
                    EXTRACT(EPOCH FROM (
                        COALESCE(actual_end_time, NOW()) - actual_start_time
                    ))/3600
                )
                FROM courier_shifts
                WHERE courier_id = p_courier_id
                    AND shift_date BETWEEN p_start_date AND p_end_date
                    AND actual_start_time IS NOT NULL
            )
        ),
        'rating', (SELECT rating FROM couriers WHERE id = p_courier_id)
    ) INTO v_metrics
    FROM route_orders ro
    JOIN routes r ON r.id = ro.route_id
    WHERE r.courier_id = p_courier_id
        AND DATE(ro.created_at) BETWEEN p_start_date AND p_end_date;
    
    RETURN v_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- View for active deliveries with full details
CREATE OR REPLACE VIEW v_active_deliveries AS
SELECT 
    o.id AS order_id,
    o.order_number,
    o.customer_name,
    o.customer_phone,
    o.delivery_address,
    ST_Y(o.delivery_location::geometry) AS latitude,
    ST_X(o.delivery_location::geometry) AS longitude,
    o.status AS order_status,
    o.delivery_status,
    r.id AS route_id,
    r.route_number,
    c.id AS courier_id,
    c.full_name AS courier_name,
    c.phone AS courier_phone,
    ST_Y(c.current_location::geometry) AS courier_latitude,
    ST_X(c.current_location::geometry) AS courier_longitude,
    v.registration_number AS vehicle_number,
    v.type AS vehicle_type,
    ro.sequence_number,
    ro.planned_arrival_time,
    ro.actual_arrival_time
FROM orders o
LEFT JOIN route_orders ro ON ro.order_id = o.id
LEFT JOIN routes r ON r.id = ro.route_id
LEFT JOIN couriers c ON c.id = r.courier_id
LEFT JOIN vehicles v ON v.id = r.vehicle_id
WHERE o.status NOT IN ('delivered', 'cancelled')
    AND r.status IN ('planned', 'active');

-- View for courier locations with status
CREATE OR REPLACE VIEW v_courier_locations AS
SELECT 
    c.id,
    c.full_name,
    c.phone,
    c.status,
    c.rating,
    ST_Y(c.current_location::geometry) AS latitude,
    ST_X(c.current_location::geometry) AS longitude,
    c.last_location_update,
    v.registration_number AS vehicle_number,
    v.type AS vehicle_type,
    cs.shift_date,
    cs.start_time,
    cs.end_time,
    (
        SELECT COUNT(*) 
        FROM route_orders ro 
        JOIN routes r ON r.id = ro.route_id 
        WHERE r.courier_id = c.id 
            AND ro.delivery_status NOT IN ('delivered', 'cancelled')
    ) AS pending_deliveries
FROM couriers c
LEFT JOIN vehicles v ON v.id = c.vehicle_id
LEFT JOIN courier_shifts cs ON cs.courier_id = c.id 
    AND cs.shift_date = CURRENT_DATE 
    AND cs.status = 'active'
WHERE c.is_active = true;

-- =====================================================
-- INDEXES FOR VIEWS
-- =====================================================

CREATE INDEX idx_orders_status_delivery ON orders(status, delivery_status);
CREATE INDEX idx_routes_status_dates ON routes(status, planned_start_time);
CREATE INDEX idx_courier_shifts_date_status ON courier_shifts(shift_date, status);