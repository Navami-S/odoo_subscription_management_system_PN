import { Request, Response, NextFunction } from 'express';
import { UserRole, User, Customer } from '@prisma/client';
import { verifyToken } from '../utils/jwt.js';
import { prisma } from '../utils/prisma.js';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError.js';

export interface AuthenticatedUser extends User {
  customer?: Customer | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined = req.cookies?.token;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new UnauthorizedError('Authentication required. Please log in.');
    }

    const payload = verifyToken(token);
    if (!payload) {
      throw new UnauthorizedError('Invalid or expired authentication session. Please log in again.');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { customer: true },
    });

    if (!user) {
      throw new UnauthorizedError('User account not found.');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('User account is currently disabled. Please contact administrator.');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required.'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError('You do not have sufficient permissions to access this resource.')
      );
    }

    next();
  };
}

