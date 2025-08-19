import axios from 'axios';
import crypto from 'crypto';
import { config } from '@tms/config';
import { query, withTransaction } from '@tms/database';

// OMS Order Interface (what we receive from OMS)
interface OMSOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  customer: {
    name: string;
    phone: string;
    email: string;
  };
  delivery: {
    address: string;
    city: string;
    postalCode: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
    preferredDate?: string;
    preferredTimeStart?: string;
    preferredTimeEnd?: string;
    notes?: string;
  };
  payment: {
    method: string;
    status: string;
    amount: number;
  };
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    weight?: number;
    volume?: number;
  }>;
  warehouse: {
    id: string;
    code: string;
  };
  metadata?: any;
}

// Sync orders from OMS
export async function syncOrdersFromOMS(): Promise<void> {
  try {
    // Fetch orders ready for delivery from OMS
    const response = await axios.get(`${config.oms.apiUrl}/api/orders`, {
      headers: {
        'Authorization': `Bearer ${config.oms.apiKey}`,
        'X-API-Key': config.oms.apiKey
      },
      params: {
        status: 'ready_for_delivery',
        limit: 100,
        includeDetails: true
      }
    });

    const omsOrders: OMSOrder[] = response.data.orders || [];
    console.log(`Fetched ${omsOrders.length} orders from OMS`);

    // Process each order
    for (const omsOrder of omsOrders) {
      await processOMSOrder(omsOrder);
    }

    // Log sync event
    await query(
      `INSERT INTO oms_sync_log (sync_type, sync_status, records_processed, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ['order_import', 'success', omsOrders.length, new Date(), new Date()]
    );

  } catch (error) {
    console.error('OMS sync error:', error);
    
    // Log failed sync
    await query(
      `INSERT INTO oms_sync_log (sync_type, sync_status, error_details, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ['order_import', 'failed', { error: error.message }, new Date(), new Date()]
    );
    
    throw error;
  }
}

// Process individual OMS order
async function processOMSOrder(omsOrder: OMSOrder): Promise<void> {
  try {
    // Check if order already exists
    const existing = await query(
      'SELECT id, status FROM orders WHERE oms_order_id = $1',
      [omsOrder.orderId]
    );

    if (existing.rows.length > 0) {
      // Update existing order if status changed
      const existingOrder = existing.rows[0];
      
      // Don't update if order is already being processed in TMS
      if (['in_transit', 'delivered', 'failed'].includes(existingOrder.status)) {
        console.log(`Order ${omsOrder.orderId} already being processed, skipping update`);
        return;
      }

      await updateOrderFromOMS(existingOrder.id, omsOrder);
    } else {
      // Create new order
      await createOrderFromOMS(omsOrder);
    }

  } catch (error) {
    console.error(`Error processing OMS order ${omsOrder.orderId}:`, error);
    throw error;
  }
}

// Create new order from OMS data
async function createOrderFromOMS(omsOrder: OMSOrder): Promise<void> {
  // Get store ID from warehouse code
  const storeResult = await query(
    'SELECT id FROM stores WHERE store_code = $1',
    [omsOrder.warehouse.code]
  );

  const storeId = storeResult.rows[0]?.id || null;

  // Calculate totals
  const totalWeight = omsOrder.items.reduce((sum, item) => 
    sum + (item.weight || 0) * item.quantity, 0);
  const totalVolume = omsOrder.items.reduce((sum, item) => 
    sum + (item.volume || 0) * item.quantity, 0);
  const itemsCount = omsOrder.items.reduce((sum, item) => 
    sum + item.quantity, 0);

  // Determine if special handling is needed
  const requiresRefrigeration = omsOrder.items.some(item => 
    item.name?.toLowerCase().includes('frozen') || 
    item.name?.toLowerCase().includes('refrigerated')
  );
  const isFragile = omsOrder.items.some(item => 
    item.name?.toLowerCase().includes('fragile') || 
    item.name?.toLowerCase().includes('glass')
  );

  await query(
    `INSERT INTO orders (
      oms_order_id, order_number, customer_name, customer_phone, customer_email,
      delivery_address, delivery_lat, delivery_lng, delivery_notes,
      preferred_delivery_date, preferred_delivery_time_start, preferred_delivery_time_end,
      order_value, payment_method, payment_status,
      items_count, total_weight_kg, total_volume_m3,
      requires_refrigeration, is_fragile, is_priority,
      store_id, status, delivery_status, metadata, last_oms_sync
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
    )`,
    [
      omsOrder.orderId,
      omsOrder.orderNumber,
      omsOrder.customer.name,
      omsOrder.customer.phone,
      omsOrder.customer.email,
      omsOrder.delivery.address,
      omsOrder.delivery.coordinates?.lat || null,
      omsOrder.delivery.coordinates?.lng || null,
      omsOrder.delivery.notes || null,
      omsOrder.delivery.preferredDate || null,
      omsOrder.delivery.preferredTimeStart || null,
      omsOrder.delivery.preferredTimeEnd || null,
      omsOrder.payment.amount,
      omsOrder.payment.method,
      omsOrder.payment.status,
      itemsCount,
      totalWeight,
      totalVolume,
      requiresRefrigeration,
      isFragile,
      false, // is_priority - can be set manually later
      storeId,
      'pending',
      'awaiting_pickup',
      JSON.stringify(omsOrder.metadata || {}),
      new Date()
    ]
  );

  console.log(`Created new order from OMS: ${omsOrder.orderNumber}`);
}

// Update existing order from OMS data
async function updateOrderFromOMS(orderId: string, omsOrder: OMSOrder): Promise<void> {
  await query(
    `UPDATE orders SET
      customer_phone = $1,
      customer_email = $2,
      delivery_address = $3,
      delivery_lat = $4,
      delivery_lng = $5,
      delivery_notes = $6,
      order_value = $7,
      payment_status = $8,
      metadata = $9,
      last_oms_sync = $10,
      updated_at = NOW()
    WHERE id = $11`,
    [
      omsOrder.customer.phone,
      omsOrder.customer.email,
      omsOrder.delivery.address,
      omsOrder.delivery.coordinates?.lat || null,
      omsOrder.delivery.coordinates?.lng || null,
      omsOrder.delivery.notes || null,
      omsOrder.payment.amount,
      omsOrder.payment.status,
      JSON.stringify(omsOrder.metadata || {}),
      new Date(),
      orderId
    ]
  );

  console.log(`Updated order from OMS: ${omsOrder.orderNumber}`);
}

// Send delivery status update back to OMS
export async function updateDeliveryStatusInOMS(
  orderId: string,
  status: string,
  details?: any
): Promise<void> {
  try {
    // Get OMS order ID
    const orderResult = await query(
      'SELECT oms_order_id, order_number FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = orderResult.rows[0];

    // Map TMS status to OMS status
    const omsStatus = mapTMSStatusToOMS(status);

    // Send update to OMS
    const response = await axios.put(
      `${config.oms.apiUrl}/api/orders/${order.oms_order_id}/delivery-status`,
      {
        status: omsStatus,
        timestamp: new Date().toISOString(),
        details: details || {}
      },
      {
        headers: {
          'Authorization': `Bearer ${config.oms.apiKey}`,
          'X-API-Key': config.oms.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    // Update sync status in local DB
    await query(
      'UPDATE orders SET oms_sync_status = $1, last_oms_sync = $2 WHERE id = $3',
      ['synced', new Date(), orderId]
    );

    console.log(`Updated delivery status in OMS for order ${order.order_number}: ${omsStatus}`);

  } catch (error) {
    console.error('Error updating OMS delivery status:', error);
    
    // Mark as sync failed
    await query(
      'UPDATE orders SET oms_sync_status = $1 WHERE id = $2',
      ['sync_failed', orderId]
    );
    
    throw error;
  }
}

// Map TMS status to OMS status
function mapTMSStatusToOMS(tmsStatus: string): string {
  const statusMap: Record<string, string> = {
    'pending': 'awaiting_pickup',
    'assigned': 'courier_assigned',
    'picked_up': 'picked_up',
    'in_transit': 'in_transit',
    'delivered': 'delivered',
    'failed': 'delivery_failed',
    'cancelled': 'cancelled',
    'returned': 'returned'
  };

  return statusMap[tmsStatus] || tmsStatus;
}

// Verify webhook signature from OMS
export function verifyOMSWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', config.oms.webhookSecret)
    .update(payload)
    .digest('hex');

  return signature === expectedSignature;
}

// Handle webhook from OMS
export async function handleOMSWebhook(event: any): Promise<void> {
  switch (event.type) {
    case 'order.created':
    case 'order.updated':
      await processOMSOrder(event.data);
      break;
      
    case 'order.cancelled':
      await cancelOrderFromOMS(event.data.orderId);
      break;
      
    default:
      console.log(`Unknown OMS webhook event type: ${event.type}`);
  }
}

// Cancel order from OMS
async function cancelOrderFromOMS(omsOrderId: string): Promise<void> {
  await query(
    `UPDATE orders 
     SET status = 'cancelled', 
         delivery_status = 'cancelled',
         updated_at = NOW()
     WHERE oms_order_id = $1 
     AND status NOT IN ('delivered', 'in_transit')`,
    [omsOrderId]
  );
  
  console.log(`Cancelled order from OMS: ${omsOrderId}`);
}