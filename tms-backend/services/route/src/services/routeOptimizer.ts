import { logger } from '../utils/logger';

interface Location {
  id: string;
  delivery_lat: number;
  delivery_lng: number;
  is_priority?: boolean;
}

export class RouteOptimizer {
  // Optimize route using nearest neighbor algorithm (simplified)
  async optimizeRoute(
    orders: Location[], 
    startLat: number, 
    startLng: number
  ): Promise<Location[]> {
    try {
      if (orders.length <= 1) return orders;

      const optimized: Location[] = [];
      const remaining = [...orders];
      
      // Handle priority orders first
      const priorityOrders = remaining.filter(o => o.is_priority);
      const regularOrders = remaining.filter(o => !o.is_priority);
      
      // Start with priority orders
      let currentLat = startLat;
      let currentLng = startLng;
      
      // Process priority orders first
      while (priorityOrders.length > 0) {
        const nearest = this.findNearest(currentLat, currentLng, priorityOrders);
        optimized.push(nearest);
        currentLat = nearest.delivery_lat;
        currentLng = nearest.delivery_lng;
        priorityOrders.splice(priorityOrders.indexOf(nearest), 1);
      }
      
      // Then process regular orders
      while (regularOrders.length > 0) {
        const nearest = this.findNearest(currentLat, currentLng, regularOrders);
        optimized.push(nearest);
        currentLat = nearest.delivery_lat;
        currentLng = nearest.delivery_lng;
        regularOrders.splice(regularOrders.indexOf(nearest), 1);
      }
      
      return optimized;
    } catch (error) {
      logger.error('Error optimizing route:', error);
      return orders; // Return original order if optimization fails
    }
  }

  // Find nearest location
  private findNearest(lat: number, lng: number, locations: Location[]): Location {
    let nearest = locations[0];
    let minDistance = this.calculateDistance(lat, lng, nearest.delivery_lat, nearest.delivery_lng);
    
    for (const location of locations) {
      const distance = this.calculateDistance(lat, lng, location.delivery_lat, location.delivery_lng);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = location;
      }
    }
    
    return nearest;
  }

  // Calculate total distance for a route
  async calculateTotalDistance(orders: Location[]): Promise<number> {
    if (orders.length === 0) return 0;
    
    let totalDistance = 0;
    
    for (let i = 0; i < orders.length - 1; i++) {
      const distance = this.calculateDistance(
        orders[i].delivery_lat,
        orders[i].delivery_lng,
        orders[i + 1].delivery_lat,
        orders[i + 1].delivery_lng
      );
      totalDistance += distance;
    }
    
    return totalDistance / 1000; // Convert to km
  }

  // Haversine formula for distance calculation
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

  // Estimate delivery time based on distance and traffic
  estimateDeliveryTime(distanceKm: number, trafficFactor: number = 1.0): number {
    const avgSpeedKmh = 30; // Average speed in city
    const stopTimeMinutes = 5; // Time per stop
    
    const travelTimeMinutes = (distanceKm / avgSpeedKmh) * 60 * trafficFactor;
    
    return Math.ceil(travelTimeMinutes + stopTimeMinutes);
  }
}