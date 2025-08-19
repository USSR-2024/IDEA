import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getSupabaseClient, query, User } from '@tms/database';
import { config } from '@tms/config';

// Login
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    // Try Supabase auth first
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      // Fallback to manual verification
      const result = await query(
        'SELECT * FROM users WHERE email = $1 AND is_active = true',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'Invalid credentials'
        });
      }

      const user = result.rows[0];
      
      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      const refreshToken = jwt.sign(
        { id: user.id },
        config.jwt.secret,
        { expiresIn: config.jwt.refreshExpiresIn }
      );

      // Update last login
      await query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
      );

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
        },
        token,
        refreshToken
      });
    }

    // Supabase auth successful
    const user = authData.user;
    const session = authData.session;

    // Get user details from database
    const userResult = await query(
      'SELECT * FROM users WHERE email = $1',
      [user.email]
    );

    const userData = userResult.rows[0] || {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || '',
      role: user.user_metadata?.role || 'viewer'
    };

    res.json({
      user: {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role
      },
      token: session?.access_token,
      refreshToken: session?.refresh_token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed'
    });
  }
};

// Register
export const register = async (req: Request, res: Response) => {
  const { email, password, full_name, phone, role = 'viewer' } = req.body;

  try {
    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'User already exists'
      });
    }

    // Create user in Supabase Auth
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          role
        }
      }
    });

    if (authError) {
      throw authError;
    }

    // Create user in database
    const result = await query(
      `INSERT INTO users (id, email, full_name, phone, role) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, email, full_name, role`,
      [authData.user?.id, email, full_name, phone, role]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed'
    });
  }
};

// Refresh token
export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, config.jwt.secret) as any;
    
    // Get user from database
    const result = await query(
      'SELECT id, email, role FROM users WHERE id = $1 AND is_active = true',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid refresh token'
      });
    }

    const user = result.rows[0];

    // Generate new tokens
    const newToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const newRefreshToken = jwt.sign(
      { id: user.id },
      config.jwt.secret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    res.json({
      token: newToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      error: 'Invalid refresh token'
    });
  }
};

// Logout
export const logout = async (req: Request, res: Response) => {
  // In a real implementation, you might want to blacklist the token
  // or remove it from a token store
  res.json({
    message: 'Logged out successfully'
  });
};

// Get current user
export const getCurrentUser = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      error: 'No authorization header'
    });
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  try {
    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    // Get user from database
    const result = await query(
      'SELECT id, email, full_name, role, phone, avatar_url FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const user = result.rows[0];
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        phone: user.phone,
        avatar_url: user.avatar_url
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(401).json({
      error: 'Invalid token'
    });
  }
};

// Forgot password
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL}/reset-password`
    });

    if (error) {
      throw error;
    }

    res.json({
      message: 'Password reset email sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      error: 'Failed to send reset email'
    });
  }
};

// Reset password
export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body;

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.updateUser({
      password
    });

    if (error) {
      throw error;
    }

    res.json({
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      error: 'Failed to reset password'
    });
  }
};