import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@tms/config';
import { getSupabaseClient } from '@tms/database';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authorization header provided'
      });
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided'
      });
    }

    // Verify token with Supabase
    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Fallback to JWT verification if Supabase auth fails
      try {
        const decoded = jwt.verify(token, config.jwt.secret) as any;
        req.user = {
          id: decoded.id || decoded.sub,
          email: decoded.email,
          role: decoded.role || 'viewer'
        };
      } catch (jwtError) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        });
      }
    } else {
      // Get user role from metadata or database
      const userMetadata = user.user_metadata || {};
      req.user = {
        id: user.id,
        email: user.email || '',
        role: userMetadata.role || 'viewer'
      };
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
};

// Role-based access control middleware
export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }

    next();
  };
};

// Optional auth - doesn't fail if no token, but adds user if token is valid
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next();
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      return next();
    }

    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser(token);

    if (user) {
      const userMetadata = user.user_metadata || {};
      req.user = {
        id: user.id,
        email: user.email || '',
        role: userMetadata.role || 'viewer'
      };
    }

    next();
  } catch (error) {
    // Continue without user on error
    next();
  }
};