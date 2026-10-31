import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  listQuotationTemplates,
  getQuotationTemplate,
  createQuotationTemplate,
  updateQuotationTemplate,
  deleteQuotationTemplate,
} from '../controllers/quotationTemplates.controller.js';
import {
  listSubscriptions,
  getSubscription,
  createSubscription,
  createFromTemplate,
  changeSubscriptionStatus,
  getSubscriptionHistory,
} from '../controllers/subscriptions.controller.js';

export const subscriptionRouter = Router();

// ─── Quotation Templates ──────────────────────────────────────────────────────

subscriptionRouter.get(
  '/quotation-templates',
  requireAuth,
  requireRole('admin', 'staff'),
  listQuotationTemplates
);
subscriptionRouter.get(
  '/quotation-templates/:id',
  requireAuth,
  requireRole('admin', 'staff'),
  getQuotationTemplate
);
subscriptionRouter.post(
  '/quotation-templates',
  requireAuth,
  requireRole('admin'),
  createQuotationTemplate
);
subscriptionRouter.put(
  '/quotation-templates/:id',
  requireAuth,
  requireRole('admin'),
  updateQuotationTemplate
);
subscriptionRouter.delete(
  '/quotation-templates/:id',
  requireAuth,
  requireRole('admin'),
  deleteQuotationTemplate
);

// ─── Subscriptions ────────────────────────────────────────────────────────────

subscriptionRouter.get(
  '/subscriptions',
  requireAuth,
  requireRole('admin', 'staff'),
  listSubscriptions
);
subscriptionRouter.get(
  '/subscriptions/:id',
  requireAuth,
  requireRole('admin', 'staff'),
  getSubscription
);
subscriptionRouter.post(
  '/subscriptions',
  requireAuth,
  requireRole('admin', 'staff'),
  createSubscription
);
subscriptionRouter.post(
  '/subscriptions/from-template',
  requireAuth,
  requireRole('admin', 'staff'),
  createFromTemplate
);
subscriptionRouter.patch(
  '/subscriptions/:id/status',
  requireAuth,
  requireRole('admin', 'staff'),
  changeSubscriptionStatus
);
subscriptionRouter.get(
  '/subscriptions/:id/history',
  requireAuth,
  requireRole('admin', 'staff'),
  getSubscriptionHistory
);
