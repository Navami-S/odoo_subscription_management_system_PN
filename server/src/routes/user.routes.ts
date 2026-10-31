import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { createStaff } from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

export const userRouter = Router();

userRouter.post('/staff', requireAuth, requireRole(UserRole.admin), createStaff);

