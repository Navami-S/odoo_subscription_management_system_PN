import { RequestHandler } from 'express';
import { prisma } from '../utils/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js';
import {
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateVariantSchema,
} from '../schemas/catalog.schema.js';

// ─── List all products ────────────────────────────────────────────────────────

export const listProducts: RequestHandler = async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: { variants: true },
    });
    res.json(products);
  } catch (err) {
    next(err);
  }
};

// ─── Get single product ───────────────────────────────────────────────────────

export const getProduct: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Product not found.');

    const product = await prisma.product.findUnique({
      where: { id },
      include: { variants: true },
    });
    if (!product) throw new NotFoundError('Product not found.');

    res.json(product);
  } catch (err) {
    next(err);
  }
};

// ─── Create product ───────────────────────────────────────────────────────────

export const createProduct: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'general';
        fields[key] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const { name, type, salesPrice, costPrice, notes, isActive } = parsed.data;

    const product = await prisma.product.create({
      data: {
        name,
        type,
        salesPrice,
        costPrice,
        notes,
        isActive,
      },
      include: { variants: true },
    });

    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
};

// ─── Update product ───────────────────────────────────────────────────────────

export const updateProduct: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Product not found.');

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Product not found.');

    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'general';
        fields[key] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const updated = await prisma.product.update({
      where: { id },
      data: parsed.data,
      include: { variants: true },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// ─── Soft delete product ──────────────────────────────────────────────────────

export const deleteProduct: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Product not found.');

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Product not found.');

    await prisma.product.update({ where: { id }, data: { isActive: false } });
    res.json({ message: 'Product deactivated successfully.' });
  } catch (err) {
    next(err);
  }
};

// ─── Add variant ──────────────────────────────────────────────────────────────

export const createVariant: RequestHandler = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) throw new NotFoundError('Product not found.');

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundError('Product not found.');

    const parsed = createVariantSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'general';
        fields[key] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const { attribute, value, extraPrice } = parsed.data;

    // Check unique (productId, attribute, value)
    const existing = await prisma.productVariant.findUnique({
      where: { productId_attribute_value: { productId, attribute, value } },
    });
    if (existing) throw new ConflictError('A variant with this attribute/value already exists for this product.');

    const variant = await prisma.productVariant.create({
      data: { productId, attribute, value, extraPrice },
    });

    res.status(201).json(variant);
  } catch (err) {
    next(err);
  }
};

// ─── Update variant ───────────────────────────────────────────────────────────

export const updateVariant: RequestHandler = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const variantId = parseInt(req.params.vid, 10);
    if (isNaN(productId) || isNaN(variantId)) throw new NotFoundError('Variant not found.');

    const existing = await prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!existing) throw new NotFoundError('Variant not found.');

    const parsed = updateVariantSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'general';
        fields[key] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const updated = await prisma.productVariant.update({
      where: { id: variantId },
      data: parsed.data,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

