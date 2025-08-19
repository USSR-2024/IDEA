import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL || 'https://kvxcxindciifqhxqhenf.supabase.co',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
    database: {
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres.kvxcxindciifqhxqhenf:admin123@aws-1-eu-central-1.pooler.supabase.com:6543/postgres',
      poolMin: parseInt(process.env.DB_POOL_MIN || '2'),
      poolMax: parseInt(process.env.DB_POOL_MAX || '10'),
    }
  },

  // Service Ports
  services: {
    apiGateway: {
      port: parseInt(process.env.API_GATEWAY_PORT || '3000'),
      host: process.env.API_GATEWAY_HOST || 'localhost'
    },
    auth: {
      port: parseInt(process.env.AUTH_SERVICE_PORT || '3001'),
      host: process.env.AUTH_SERVICE_HOST || 'localhost'
    },
    order: {
      port: parseInt(process.env.ORDER_SERVICE_PORT || '3002'),
      host: process.env.ORDER_SERVICE_HOST || 'localhost'
    },
    courier: {
      port: parseInt(process.env.COURIER_SERVICE_PORT || '3003'),
      host: process.env.COURIER_SERVICE_HOST || 'localhost'
    },
    vehicle: {
      port: parseInt(process.env.VEHICLE_SERVICE_PORT || '3004'),
      host: process.env.VEHICLE_SERVICE_HOST || 'localhost'
    },
    route: {
      port: parseInt(process.env.ROUTE_SERVICE_PORT || '3005'),
      host: process.env.ROUTE_SERVICE_HOST || 'localhost'
    },
    location: {
      port: parseInt(process.env.LOCATION_SERVICE_PORT || '3006'),
      host: process.env.LOCATION_SERVICE_HOST || 'localhost'
    },
    analytics: {
      port: parseInt(process.env.ANALYTICS_SERVICE_PORT || '3007'),
      host: process.env.ANALYTICS_SERVICE_HOST || 'localhost'
    },
    notification: {
      port: parseInt(process.env.NOTIFICATION_SERVICE_PORT || '3008'),
      host: process.env.NOTIFICATION_SERVICE_HOST || 'localhost'
    }
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },

  // Redis Configuration (for caching and pub/sub)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0')
  },

  // RabbitMQ Configuration (for message queue)
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    exchanges: {
      orders: 'orders',
      notifications: 'notifications',
      locations: 'locations'
    }
  },

  // External APIs
  maps: {
    provider: process.env.MAPS_PROVIDER || 'google', // google, mapbox, osm
    apiKey: process.env.MAPS_API_KEY || '',
    geocodingApiKey: process.env.GEOCODING_API_KEY || ''
  },

  // OMS Integration
  oms: {
    apiUrl: process.env.OMS_API_URL || 'https://api.oms-example.com',
    apiKey: process.env.OMS_API_KEY || '',
    webhookSecret: process.env.OMS_WEBHOOK_SECRET || ''
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json'
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100')
  }
};

// Service URLs helper
export const getServiceUrl = (service: keyof typeof config.services): string => {
  const serviceConfig = config.services[service];
  const protocol = config.isProduction ? 'https' : 'http';
  return `${protocol}://${serviceConfig.host}:${serviceConfig.port}`;
};

// Validate required environment variables
export const validateConfig = () => {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'DATABASE_URL'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0 && config.isProduction) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

export default config;