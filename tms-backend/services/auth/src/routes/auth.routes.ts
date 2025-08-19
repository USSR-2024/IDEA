import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import * as authController from '../controllers/auth.controller';
import { validateLogin, validateRegister, validateRefreshToken } from '../validators/auth.validator';

const router = Router();

// Auth routes
router.post('/login', validateLogin, asyncHandler(authController.login));
router.post('/register', validateRegister, asyncHandler(authController.register));
router.post('/refresh', validateRefreshToken, asyncHandler(authController.refreshToken));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', asyncHandler(authController.getCurrentUser));
router.post('/forgot-password', asyncHandler(authController.forgotPassword));
router.post('/reset-password', asyncHandler(authController.resetPassword));

export default router;