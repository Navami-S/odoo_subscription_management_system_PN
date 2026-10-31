import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

// Products
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  createVariant,
  updateVariant,
} from '../controllers/products.controller.js';

// Taxes
import {
  listTaxes,
  getTax,
  createTax,
  updateTax,
} from '../controllers/taxes.controller.js';

// Payment Terms
import {
  listPaymentTerms,
  getPaymentTerm,
  createPaymentTerm,
  updatePaymentTerm,
} from '../controllers/paymentTerms.controller.js';

// Plans
import {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
} from '../controllers/plans.controller.js';

// Discounts
import {
  listDiscounts,
  getDiscount,
  createDiscount,
  updateDiscount,
} from '../controllers/discounts.controller.js';

export const catalogRouter = Router();

// ─── Products ─────────────────────────────────────────────────────────────────
catalogRouter.get('/products', requireAuth, requireRole('admin', 'staff'), listProducts);
catalogRouter.get('/products/:id', requireAuth, requireRole('admin', 'staff'), getProduct);
catalogRouter.post('/products', requireAuth, requireRole('admin'), createProduct);
catalogRouter.put('/products/:id', requireAuth, requireRole('admin'), updateProduct);
catalogRouter.delete('/products/:id', requireAuth, requireRole('admin'), deleteProduct);
catalogRouter.post('/products/:id/variants', requireAuth, requireRole('admin'), createVariant);
catalogRouter.put('/products/:id/variants/:vid', requireAuth, requireRole('admin'), updateVariant);

// ─── Taxes ───────────────────────────────────────────────────────────────────
catalogRouter.get('/taxes', requireAuth, requireRole('admin', 'staff'), listTaxes);
catalogRouter.get('/taxes/:id', requireAuth, requireRole('admin', 'staff'), getTax);
catalogRouter.post('/taxes', requireAuth, requireRole('admin'), createTax);
catalogRouter.put('/taxes/:id', requireAuth, requireRole('admin'), updateTax);

// ─── Payment Terms ────────────────────────────────────────────────────────────
catalogRouter.get('/payment-terms', requireAuth, requireRole('admin', 'staff'), listPaymentTerms);
catalogRouter.get('/payment-terms/:id', requireAuth, requireRole('admin', 'staff'), getPaymentTerm);
catalogRouter.post('/payment-terms', requireAuth, requireRole('admin'), createPaymentTerm);
catalogRouter.put('/payment-terms/:id', requireAuth, requireRole('admin'), updatePaymentTerm);

// ─── Plans ───────────────────────────────────────────────────────────────────
catalogRouter.get('/plans', requireAuth, requireRole('admin', 'staff'), listPlans);
catalogRouter.get('/plans/:id', requireAuth, requireRole('admin', 'staff'), getPlan);
catalogRouter.post('/plans', requireAuth, requireRole('admin'), createPlan);
catalogRouter.put('/plans/:id', requireAuth, requireRole('admin'), updatePlan);

// ─── Discounts ────────────────────────────────────────────────────────────────
catalogRouter.get('/discounts', requireAuth, requireRole('admin', 'staff'), listDiscounts);
catalogRouter.get('/discounts/:id', requireAuth, requireRole('admin', 'staff'), getDiscount);
catalogRouter.post('/discounts', requireAuth, requireRole('admin'), createDiscount);
catalogRouter.put('/discounts/:id', requireAuth, requireRole('admin'), updateDiscount);

