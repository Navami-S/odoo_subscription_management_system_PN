import { RequestHandler } from 'express';
import { prisma } from '../utils/prisma.js';
import { BusinessRuleError, NotFoundError, ValidationError } from '../errors/AppError.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  createSubscriptionSchema,
  createFromTemplateSchema,
  changeSubscriptionStatusSchema,
} from '../schemas/subscription.schema.js';
import { SubscriptionStatus } from '@prisma/client';

// ─── Allowed Transitions State Machine ────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  draft: [SubscriptionStatus.quotation, SubscriptionStatus.closed],
  quotation: [SubscriptionStatus.confirmed, SubscriptionStatus.closed],
  confirmed: [SubscriptionStatus.active, SubscriptionStatus.closed],
  active: [SubscriptionStatus.closed],
  closed: [],
};

// ─── Unique Subscription Number Generator ─────────────────────────────────────

async function generateSubscriptionNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.subscription.count();
  let candidate = `SUB-${year}-${String(count + 1).padStart(6, '0')}`;
  const exists = await prisma.subscription.findUnique({ where: { number: candidate } });
  if (exists) {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    candidate = `SUB-${year}-${randomSuffix}`;
  }
  return candidate;
}

// ─── List Subscriptions ───────────────────────────────────────────────────────

export const listSubscriptions: RequestHandler = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    const status = req.query.status as SubscriptionStatus | undefined;
    const customerId = req.query.customerId ? parseInt(req.query.customerId as string, 10) : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;
    if (customerId && !isNaN(customerId)) where['customerId'] = customerId;
    if (search) {
      where['OR'] = [
        { number: { contains: search } },
        { customer: { name: { contains: search } } },
      ];
    }

    const [total, subscriptions] = await Promise.all([
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: true,
          plan: true,
          paymentTerm: true,
          lines: {
            include: {
              product: true,
              variant: true,
              tax: true,
            },
          },
        },
      }),
    ]);

    res.json({
      data: subscriptions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get Single Subscription ──────────────────────────────────────────────────

export const getSubscription: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Subscription not found.');

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        customer: true,
        plan: true,
        paymentTerm: true,
        lines: {
          include: {
            product: true,
            variant: true,
            tax: true,
          },
        },
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!subscription) throw new NotFoundError('Subscription not found.');
    res.json(subscription);
  } catch (err) {
    next(err);
  }
};

// ─── Create Subscription (Manual) ─────────────────────────────────────────────

export const createSubscription: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const { customerId, planId, paymentTermId, startDate, expiryDate, lines } = parsed.data;

    // Verify foreign keys exist
    const [customer, plan, paymentTerm] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId } }),
      prisma.plan.findUnique({ where: { id: planId } }),
      prisma.paymentTerm.findUnique({ where: { id: paymentTermId } }),
    ]);

    if (!customer) throw new ValidationError('Invalid customer.', { customerId: 'Customer not found.' });
    if (!plan) throw new ValidationError('Invalid plan.', { planId: 'Plan not found.' });
    if (!paymentTerm) throw new ValidationError('Invalid payment term.', { paymentTermId: 'Payment term not found.' });

    // Build line items with price snapshots
    const preparedLines: {
      productId: number;
      variantId: number | null;
      quantity: number;
      unitPrice: number;
      taxId: number | null;
      amount: number;
    }[] = [];
    for (const line of lines) {
      const product = await prisma.product.findUnique({
        where: { id: line.productId },
        include: { variants: true },
      });
      if (!product) {
        throw new ValidationError('Product not found.', { [`lines.${line.productId}`]: 'Product does not exist.' });
      }

      let unitPrice = line.unitPrice;
      if (unitPrice === undefined) {
        let price = Number(product.salesPrice);
        if (line.variantId) {
          const variant = product.variants.find((v) => v.id === line.variantId);
          if (variant) price += Number(variant.extraPrice);
        }
        unitPrice = price;
      }

      const amount = Number((line.quantity * unitPrice).toFixed(2));

      preparedLines.push({
        productId: line.productId,
        variantId: line.variantId ?? null,
        quantity: line.quantity,
        unitPrice,
        taxId: line.taxId ?? null,
        amount,
      });
    }

    const number = await generateSubscriptionNumber();
    const userId = (req as AuthenticatedRequest).user?.id;

    const subscription = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          number,
          customerId,
          planId,
          paymentTermId,
          startDate: new Date(startDate),
          expiryDate: new Date(expiryDate),
          status: SubscriptionStatus.draft,
          createdBy: userId,
          lines: {
            create: preparedLines,
          },
        },
        include: {
          customer: true,
          plan: true,
          paymentTerm: true,
          lines: {
            include: {
              product: true,
              variant: true,
              tax: true,
            },
          },
        },
      });

      // Log initial status
      await tx.subscriptionStatusHistory.create({
        data: {
          subscriptionId: sub.id,
          fromStatus: SubscriptionStatus.draft,
          toStatus: SubscriptionStatus.draft,
          changedBy: userId,
        },
      });

      return sub;
    });

    res.status(201).json(subscription);
  } catch (err) {
    next(err);
  }
};

// ─── Create Subscription From Template ────────────────────────────────────────

export const createFromTemplate: RequestHandler = async (req, res, next) => {
  try {
    const parsed = createFromTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const { templateId, customerId, paymentTermId, startDate: inputStart } = parsed.data;

    const [template, customer, paymentTerm] = await Promise.all([
      prisma.quotationTemplate.findUnique({
        where: { id: templateId },
        include: {
          lines: {
            include: {
              product: true,
              variant: true,
            },
          },
        },
      }),
      prisma.customer.findUnique({ where: { id: customerId } }),
      prisma.paymentTerm.findUnique({ where: { id: paymentTermId } }),
    ]);

    if (!template) throw new ValidationError('Template not found.', { templateId: 'Template does not exist.' });
    if (!customer) throw new ValidationError('Customer not found.', { customerId: 'Customer does not exist.' });
    if (!paymentTerm) throw new ValidationError('Payment term not found.', { paymentTermId: 'Payment term does not exist.' });

    const startDate = inputStart ? new Date(inputStart) : new Date();
    const expiryDate = new Date(startDate.getTime() + template.validityDays * 24 * 60 * 60 * 1000);

    const preparedLines = template.lines.map((l) => {
      let price = Number(l.product.salesPrice);
      if (l.variant) {
        price += Number(l.variant.extraPrice);
      }
      const amount = Number((l.quantity * price).toFixed(2));
      return {
        productId: l.productId,
        variantId: l.variantId ?? null,
        quantity: l.quantity,
        unitPrice: price,
        taxId: null,
        amount,
      };
    });

    const number = await generateSubscriptionNumber();
    const userId = (req as AuthenticatedRequest).user?.id;

    const subscription = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          number,
          customerId,
          planId: template.planId,
          paymentTermId,
          startDate,
          expiryDate,
          status: SubscriptionStatus.draft,
          createdBy: userId,
          lines: {
            create: preparedLines,
          },
        },
        include: {
          customer: true,
          plan: true,
          paymentTerm: true,
          lines: {
            include: {
              product: true,
              variant: true,
              tax: true,
            },
          },
        },
      });

      await tx.subscriptionStatusHistory.create({
        data: {
          subscriptionId: sub.id,
          fromStatus: SubscriptionStatus.draft,
          toStatus: SubscriptionStatus.draft,
          changedBy: userId,
        },
      });

      return sub;
    });

    res.status(201).json(subscription);
  } catch (err) {
    next(err);
  }
};

// ─── Change Subscription Status (State Machine) ───────────────────────────────

export const changeSubscriptionStatus: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Subscription not found.');

    const parsed = changeSubscriptionStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || 'general'] = issue.message;
      }
      throw new ValidationError('Please fix the highlighted fields.', fields);
    }

    const { status: targetStatus } = parsed.data;

    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription) throw new NotFoundError('Subscription not found.');

    const currentStatus = subscription.status;

    // Check state transition validity
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new BusinessRuleError(
        `Cannot transition subscription from '${currentStatus}' to '${targetStatus}'. Allowed transitions: ${
          allowed.length ? allowed.join(', ') : 'none (terminal state)'
        }.`
      );
    }

    const userId = (req as AuthenticatedRequest).user?.id;

    const updateData: Record<string, unknown> = {
      status: targetStatus,
    };

    // If activating subscription and nextBillingDate is not set, set to startDate
    if (targetStatus === SubscriptionStatus.active && !subscription.nextBillingDate) {
      updateData['nextBillingDate'] = subscription.startDate;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id },
        data: updateData,
        include: {
          customer: true,
          plan: true,
          paymentTerm: true,
          lines: {
            include: {
              product: true,
              variant: true,
              tax: true,
            },
          },
        },
      });

      await tx.subscriptionStatusHistory.create({
        data: {
          subscriptionId: id,
          fromStatus: currentStatus,
          toStatus: targetStatus,
          changedBy: userId,
        },
      });

      return sub;
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// ─── Get Subscription History ─────────────────────────────────────────────────

export const getSubscriptionHistory: RequestHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new NotFoundError('Subscription not found.');

    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription) throw new NotFoundError('Subscription not found.');

    const history = await prisma.subscriptionStatusHistory.findMany({
      where: { subscriptionId: id },
      orderBy: { changedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    res.json(history);
  } catch (err) {
    next(err);
  }
};
