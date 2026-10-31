import { RequestHandler } from 'express';
import { prisma } from '../utils/prisma.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { createDiscountSchema, updateDiscountSchema } from '../schemas/catalog.schema.js';

export const listDiscounts: RequestHandler = async (_req, res, next) => {
  try {
    const discounts = await prisma.discount.findMany({
      orderBy: { createdAt: 'desc' },
      include: { discountProducts: { include: { product: true } } },
    });
    res.json(discounts);
  } catch (err) {
    next(err);
  }
};

export const getDiscount: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Discount not found.');
    const discount = await prisma.discount.findUnique({
      where: { id },
      include: { discountProducts: { include: { product: true } } },
    });
    if (!discount) throw new NotFoundError('Discount not found.');
    res.json(discount);
  } catch (err) {
    next(err);
  }
};

export const createDiscount: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createDiscountSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const { productIds, startDate, endDate, ...rest } = parsed.data;

    const discount = await prisma.discount.create({
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        discountProducts: productIds
          ? {
              create: productIds.map((productId) => ({ productId })),
            }
          : undefined,
      },
      include: { discountProducts: { include: { product: true } } },
    });

    res.status(201).json(discount);
  } catch (err) {
    next(err);
  }
};

export const updateDiscount: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Discount not found.');

    const existing = await prisma.discount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Discount not found.');

    const parsed = updateDiscountSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const { productIds, startDate, endDate, ...rest } = parsed.data;

    // If productIds provided, replace the join-table rows
    const discount = await prisma.$transaction(async (tx) => {
      if (productIds !== undefined) {
        await tx.discountProduct.deleteMany({ where: { discountId: id } });
        await tx.discountProduct.createMany({
          data: productIds.map((productId) => ({ discountId: id, productId })),
        });
      }

      return tx.discount.update({
        where: { id },
        data: {
          ...rest,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        },
        include: { discountProducts: { include: { product: true } } },
      });
    });

    res.json(discount);
  } catch (err) {
    next(err);
  }
};

