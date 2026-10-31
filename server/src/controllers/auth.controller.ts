import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { UserRole } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { signToken } from '../utils/jwt.js';
import { sendResetPasswordEmail } from '../utils/mailer.js';
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/auth.schema.js';
import {
  ValidationError,
  UnauthorizedError,
  ConflictError,
} from '../errors/AppError.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = signupSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ConflictError('This email is already registered.', {
        email: 'This email is already registered.',
      });
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    // Transactionally create User and Customer (public signup always creates role 'customer')
    const { user, customer } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: UserRole.customer,
          isActive: true,
        },
      });

      const newCustomer = await tx.customer.create({
        data: {
          userId: newUser.id,
          name: input.name,
          company: input.company || null,
          phone: input.phone || null,
          street: input.street || null,
          city: input.city || null,
          state: input.state || null,
          postalCode: input.postalCode || null,
          country: input.country || null,
        },
      });

      return { user: newUser, customer: newCustomer };
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    setAuthCookie(res, token);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        customer,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { customer: true },
    });

    // Enforce generic message for invalid email vs wrong password
    if (!user) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is inactive. Please contact support.');
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    setAuthCookie(res, token);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        customer: user.customer || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  clearAuthCookie(res);
  res.json({
    message: 'Logged out successfully.',
  });
}

export async function me(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      customer: user.customer || null,
    },
  });
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = forgotPasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (user && user.isActive) {
      // Generate secure 32-byte random token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes expiry

      // Save hashed token
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const resetLink = `${appUrl}/reset-password?token=${rawToken}`;

      // Dispatch email to Mailpit SMTP
      await sendResetPasswordEmail(user.email, resetLink);
    }

    // Always respond with the same generic message whether email exists or not
    res.json({
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = resetPasswordSchema.parse(req.body);

    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
      include: { user: true },
    });

    if (!resetToken || !resetToken.user.isActive) {
      throw new ValidationError('Invalid or expired password reset link.', {
        token: 'Invalid or expired password reset link.',
      });
    }

    const newPasswordHash = await bcrypt.hash(input.newPassword, 10);

    // Atomically update user password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newPasswordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    res.json({
      message: 'Password has been reset successfully. You may now log in.',
    });
  } catch (err) {
    next(err);
  }
}

