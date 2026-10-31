import { Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { createStaffSchema } from '../schemas/auth.schema.js';
import { ConflictError } from '../errors/AppError.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

export async function createStaff(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createStaffSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ConflictError('This email is already registered.', {
        email: 'This email is already registered.',
      });
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const adminId = req.user!.id;

    const staffUser = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: UserRole.staff,
        isActive: true,
        createdBy: adminId,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({
      user: staffUser,
      message: 'Staff account created successfully.',
    });
  } catch (err) {
    next(err);
  }
}

