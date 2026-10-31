import { RequestHandler } from 'express';
import { prisma } from '../utils/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { createPlanSchema, updatePlanSchema } from '../schemas/catalog.schema.js';

export const listPlans: RequestHandler = async (_req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(plans);
  } catch (err) {
    next(err);
  }
};

export const getPlan: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Plan not found.');
    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundError('Plan not found.');
    res.json(plan);
  } catch (err) {
    next(err);
  }
};

export const createPlan: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const { availableFrom, availableTo, ...rest } = parsed.data;
    const plan = await prisma.plan.create({
      data: {
        ...rest,
        availableFrom: new Date(availableFrom),
        availableTo: availableTo ? new Date(availableTo) : undefined,
      },
    });
    res.status(201).json(plan);
  } catch (err) {
    next(err);
  }
};

export const updatePlan: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Plan not found.');

    const existing = await prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Plan not found.');

    const parsed = updatePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const { availableFrom, availableTo, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (availableFrom !== undefined) updateData['availableFrom'] = new Date(availableFrom);
    if (availableTo !== undefined) updateData['availableTo'] = new Date(availableTo);

    const updated = await prisma.plan.update({ where: { id }, data: updateData });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

