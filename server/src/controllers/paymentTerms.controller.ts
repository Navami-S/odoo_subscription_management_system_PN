import { RequestHandler } from 'express';
import { prisma } from '../utils/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import {
  createPaymentTermSchema,
  updatePaymentTermSchema,
} from '../schemas/catalog.schema.js';

export const listPaymentTerms: RequestHandler = async (_req, res, next) => {
  try {
    const terms = await prisma.paymentTerm.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(terms);
  } catch (err) {
    next(err);
  }
};

export const getPaymentTerm: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Payment term not found.');
    const term = await prisma.paymentTerm.findUnique({ where: { id } });
    if (!term) throw new NotFoundError('Payment term not found.');
    res.json(term);
  } catch (err) {
    next(err);
  }
};

export const createPaymentTerm: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createPaymentTermSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }
    const term = await prisma.paymentTerm.create({ data: parsed.data });
    res.status(201).json(term);
  } catch (err) {
    next(err);
  }
};

export const updatePaymentTerm: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Payment term not found.');

    const existing = await prisma.paymentTerm.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Payment term not found.');

    const parsed = updatePaymentTermSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }
    const updated = await prisma.paymentTerm.update({ where: { id }, data: parsed.data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

