import { logger } from './logger';

interface ServiceInfo {
  url: string;
  health?: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck?: Date;
}

export class ServiceRegistry {
  private services: Map<string, ServiceInfo> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHealthChecks();
  }

  register(name: string, url: string): void {
    this.services.set(name, {
      url,
      health: 'unknown',
      lastCheck: new Date()
    });
    logger.info(`Service registered: ${name} at ${url}`);
  }

  getUrl(name: string): string {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found in registry`);
    }
    return service.url;
  }

  getAll(): Record<string, ServiceInfo> {
    return Object.fromEntries(this.services);
  }

  getHealthStatus(): Record<string, string> {
    const status: Record<string, string> = {};
    this.services.forEach((info, name) => {
      status[name] = info.health || 'unknown';
    });
    return status;
  }

  private async checkHealth(name: string, url: string): Promise<void> {
    try {
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      const service = this.services.get(name);
      if (service) {
        service.health = response.ok ? 'healthy' : 'unhealthy';
        service.lastCheck = new Date();
      }
    } catch (error) {
      const service = this.services.get(name);
      if (service) {
        service.health = 'unhealthy';
        service.lastCheck = new Date();
      }
      logger.warn(`Health check failed for ${name}: ${error}`);
    }
  }

  private startHealthChecks(): void {
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.services.forEach((info, name) => {
        this.checkHealth(name, info.url);
      });
    }, 30000);

    // Initial health check
    this.services.forEach((info, name) => {
      this.checkHealth(name, info.url);
    });
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}