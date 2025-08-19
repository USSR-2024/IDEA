import { RedisClientType } from 'redis';
import { query } from '@tms/database';
import { logger } from '../utils/logger';

export class LocationTracker {
  constructor(private redisClient: RedisClientType) {}

  async checkGeofences(courierId: string, lat: number, lng: number): Promise<void> {
    try {
      // Check if courier entered/exited any geofenced areas
      const geofences = await query(`
        SELECT 
          id, 
          name, 
          center_lat, 
          center_lng, 
          radius_meters,
          type
        FROM geofences
        WHERE is_active = true
      `);

      for (const fence of geofences.rows) {
        const distance = this.calculateDistance(
          lat, lng, 
          fence.center_lat, 
          fence.center_lng
        );

        const isInside = distance <= fence.radius_meters;
        const previousState = await this.redisClient.get(`geofence:${fence.id}:${courierId}`);
        
        if (isInside && !previousState) {
          // Entered geofence
          await this.handleGeofenceEnter(courierId, fence);
          await this.redisClient.setEx(`geofence:${fence.id}:${courierId}`, 3600, 'inside');
        } else if (!isInside && previousState === 'inside') {
          // Exited geofence
          await this.handleGeofenceExit(courierId, fence);
          await this.redisClient.del(`geofence:${fence.id}:${courierId}`);
        }
      }
    } catch (error) {
      logger.error('Error checking geofences:', error);
    }
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  private async handleGeofenceEnter(courierId: string, fence: any): Promise<void> {
    logger.info(`Courier ${courierId} entered geofence ${fence.name}`);
    
    await query(`
      INSERT INTO geofence_events (
        geofence_id, 
        courier_id, 
        event_type, 
        occurred_at
      ) VALUES ($1, $2, 'enter', NOW())
    `, [fence.id, courierId]);

    // Send notification
    await query(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        data
      ) SELECT 
        id,
        'geofence_alert',
        'Courier Entered Zone',
        $1,
        $2
      FROM users 
      WHERE role IN ('manager', 'dispatcher')
    `, [
      `Courier entered ${fence.name}`,
      JSON.stringify({ courier_id: courierId, geofence_id: fence.id })
    ]);
  }

  private async handleGeofenceExit(courierId: string, fence: any): Promise<void> {
    logger.info(`Courier ${courierId} exited geofence ${fence.name}`);
    
    await query(`
      INSERT INTO geofence_events (
        geofence_id, 
        courier_id, 
        event_type, 
        occurred_at
      ) VALUES ($1, $2, 'exit', NOW())
    `, [fence.id, courierId]);
  }
}