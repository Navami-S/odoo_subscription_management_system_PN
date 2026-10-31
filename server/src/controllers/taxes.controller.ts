import { RequestHandler } from 'express';
import { prisma } from '../utils/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { createTaxSchema, updateTaxSchema } from '../schemas/catalog.schema.js';

export const listTaxes: RequestHandler = async (_req, res, next) => {
  try {
    const taxes = await prisma.tax.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(taxes);
  } catch (err) {
    next(err);
  }
};

export const getTax: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Tax not found.');
    const tax = await prisma.tax.findUnique({ where: { id } });
    if (!tax) throw new NotFoundError('Tax not found.');
    res.json(tax);
  } catch (err) {
    next(err);
  }
};

export const createTax: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createTaxSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }
    const tax = await prisma.tax.create({ data: parsed.data });
    res.status(201).json(tax);
  } catch (err) {
    next(err);
  }
};

export const updateTax: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Tax not found.');

    const existing = await prisma.tax.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Tax not found.');

    const parsed = updateTaxSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }
    const updated = await prisma.tax.update({ where: { id }, data: parsed.data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

