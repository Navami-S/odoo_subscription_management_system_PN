import { RequestHandler } from 'express';
import { prisma } from '../utils/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import {
  createQuotationTemplateSchema,
  updateQuotationTemplateSchema,
} from '../schemas/subscription.schema.js';

export const listQuotationTemplates: RequestHandler = async (_req, res, next) => {
  try {
    const templates = await prisma.quotationTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        plan: true,
        lines: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
    });
    res.json(templates);
  } catch (err) {
    next(err);
  }
};

export const getQuotationTemplate: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Quotation template not found.');

    const template = await prisma.quotationTemplate.findUnique({
      where: { id },
      include: {
        plan: true,
        lines: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
    });

    if (!template) throw new NotFoundError('Quotation template not found.');
    res.json(template);
  } catch (err) {
    next(err);
  }
};

export const createQuotationTemplate: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createQuotationTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const { name, planId, validityDays, lines } = parsed.data;

    // Verify plan exists
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new ValidationError('Invalid plan.', { planId: 'Plan does not exist.' });

    const template = await prisma.quotationTemplate.create({
      data: {
        name,
        planId,
        validityDays,
        lines: {
          create: lines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId ?? null,
            quantity: line.quantity,
          })),
        },
      },
      include: {
        plan: true,
        lines: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
    });

    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
};

export const updateQuotationTemplate: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Quotation template not found.');

    const existing = await prisma.quotationTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Quotation template not found.');

    const parsed = updateQuotationTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const { name, planId, validityDays, lines } = parsed.data;

    if (planId) {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) throw new ValidationError('Invalid plan.', { planId: 'Plan does not exist.' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (lines !== undefined) {
        await tx.quotationTemplateLine.deleteMany({ where: { templateId: id } });
        await tx.quotationTemplateLine.createMany({
          data: lines.map((line) => ({
            templateId: id,
            productId: line.productId,
            variantId: line.variantId ?? null,
            quantity: line.quantity,
          })),
        });
      }

      return tx.quotationTemplate.update({
        where: { id },
        data: {
          name,
          planId,
          validityDays,
        },
        include: {
          plan: true,
          lines: {
            include: {
              product: true,
              variant: true,
            },
          },
        },
      });
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const deleteQuotationTemplate: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Quotation template not found.');

    const existing = await prisma.quotationTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Quotation template not found.');

    await prisma.quotationTemplate.delete({ where: { id } });
    res.json({ message: 'Quotation template deleted successfully.' });
  } catch (err) {
    next(err);
  }
};
