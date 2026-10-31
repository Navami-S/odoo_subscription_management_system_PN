import nodemailer from 'nodemailer';
import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { EmailStatus } from '@prisma/client';

const SMTP_HOST = process.env.SMTP_HOST || 'localhost';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '1025', 10);

export const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  ignoreTLS: true,
});

export async function sendResetPasswordEmail(toEmail: string, resetLink: string): Promise<void> {
  const subject = 'Reset Your Brightloop Password';
  const body = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0A0820; color: #FFFFFF; border-radius: 12px;">
      <h2 style="color: #C6F432; margin-top: 0;">Password Reset Request</h2>
      <p style="color: #E2E8F0; font-size: 16px;">We received a request to reset your password for your Brightloop account.</p>
      <p style="margin: 24px 0;">
        <a href="${resetLink}" style="background-color: #C6F432; color: #0A0820; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
      </p>
      <p style="color: #8E8AB0; font-size: 14px;">This link will expire in 60 minutes and can only be used once.</p>
      <p style="color: #8E8AB0; font-size: 12px; margin-top: 32px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">If you did not request a password reset, please ignore this email.</p>
    </div>
  `;

  // 1. Record entry in email_outbox table
  const outboxEntry = await prisma.emailOutbox.create({
    data: {
      toEmail,
      subject,
      body,
      kind: 'password_reset',
      status: EmailStatus.pending,
    },
  });

  // 2. Deliver email via Mailpit SMTP
  try {
    await mailer.sendMail({
      from: '"Brightloop Security" <no-reply@brightloop.io>',
      to: toEmail,
      subject,
      html: body,
    });

    await prisma.emailOutbox.update({
      where: { id: outboxEntry.id },
      data: {
        status: EmailStatus.sent,
        sentAt: new Date(),
      },
    });

    logger.info({ toEmail, kind: 'password_reset' }, 'Password reset email delivered to Mailpit');
  } catch (error) {
    logger.error({ error, toEmail }, 'Failed to send password reset email');
    await prisma.emailOutbox.update({
      where: { id: outboxEntry.id },
      data: {
        status: EmailStatus.failed,
      },
    });
  }
}

