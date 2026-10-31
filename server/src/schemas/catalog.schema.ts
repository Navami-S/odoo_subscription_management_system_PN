import { z } from 'zod';

// ─── Product ──────────────────────────────────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.').max(255),
  type: z
    .enum(['storable', 'consumable', 'service'], {
      errorMap: () => ({ message: "Type must be 'storable', 'consumable', or 'service'." }),
    })
    .default('service'),
  salesPrice: z
    .number({ invalid_type_error: 'Sales price must be a number.' })
    .min(0, 'Sales price must be non-negative.'),
  costPrice: z
    .number({ invalid_type_error: 'Cost price must be a number.' })
    .min(0, 'Cost price must be non-negative.')
    .default(0),
  notes: z.string().max(10000).optional(),
  isActive: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema.partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ─── Product Variant ──────────────────────────────────────────────────────────

export const createVariantSchema = z.object({
  attribute: z.string().min(1, 'Attribute is required.').max(100),
  value: z.string().min(1, 'Value is required.').max(100),
  extraPrice: z
    .number({ invalid_type_error: 'Extra price must be a number.' })
    .min(0, 'Extra price must be non-negative.')
    .default(0),
});

export const updateVariantSchema = createVariantSchema.partial();

export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

// ─── Tax ──────────────────────────────────────────────────────────────────────

export const createTaxSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.').max(100),
  ratePercent: z
    .number({ invalid_type_error: 'Rate percent must be a number.' })
    .min(0, 'Rate percent must be non-negative.')
    .max(100, 'Rate percent cannot exceed 100.'),
  isActive: z.boolean().default(true),
});

export const updateTaxSchema = createTaxSchema.partial();

export type CreateTaxInput = z.infer<typeof createTaxSchema>;
export type UpdateTaxInput = z.infer<typeof updateTaxSchema>;

// ─── Payment Term ─────────────────────────────────────────────────────────────

export const createPaymentTermSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.').max(100),
  dueDays: z
    .number({ invalid_type_error: 'Due days must be a number.' })
    .int('Due days must be an integer.')
    .min(0, 'Due days must be non-negative.'),
});

export const updatePaymentTermSchema = createPaymentTermSchema.partial();

export type CreatePaymentTermInput = z.infer<typeof createPaymentTermSchema>;
export type UpdatePaymentTermInput = z.infer<typeof updatePaymentTermSchema>;

// ─── Plan ─────────────────────────────────────────────────────────────────────

export const createPlanSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters.').max(255),
    price: z
      .number({ invalid_type_error: 'Price must be a number.' })
      .min(0, 'Price must be non-negative.'),
    billingPeriod: z.enum(['daily', 'weekly', 'monthly', 'yearly'], {
      errorMap: () => ({
        message: "Billing period must be 'daily', 'weekly', 'monthly', or 'yearly'.",
      }),
    }),
    minQuantity: z
      .number()
      .int()
      .min(1, 'Minimum quantity must be at least 1.')
      .default(1),
    availableFrom: z.string().datetime({ message: 'availableFrom must be a valid ISO 8601 date.' }),
    availableTo: z
      .string()
      .datetime({ message: 'availableTo must be a valid ISO 8601 date.' })
      .optional(),
    autoCloseOnEnd: z.boolean().default(true),
    closable: z.boolean().default(true),
    pausable: z.boolean().default(true),
    renewable: z.boolean().default(true),
    status: z.enum(['active', 'paused', 'closed']).default('active'),
  })
  .refine(
    (data) => {
      if (data.availableTo && data.availableFrom) {
        return new Date(data.availableTo) >= new Date(data.availableFrom);
      }
      return true;
    },
    { message: 'availableTo must be on or after availableFrom.', path: ['availableTo'] }
  );

export const updatePlanSchema = createPlanSchema.innerType().partial().refine(
  (data) => {
    if (data.availableTo && data.availableFrom) {
      return new Date(data.availableTo) >= new Date(data.availableFrom);
    }
    return true;
  },
  { message: 'availableTo must be on or after availableFrom.', path: ['availableTo'] }
);

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

// ─── Discount ─────────────────────────────────────────────────────────────────

export const createDiscountSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters.').max(255),
    type: z.enum(['fixed', 'percent'], {
      errorMap: () => ({ message: "Type must be 'fixed' or 'percent'." }),
    }),
    value: z
      .number({ invalid_type_error: 'Value must be a number.' })
      .min(0, 'Discount value must be non-negative.'),
    minPurchase: z.number().min(0).default(0).optional(),
    minQuantity: z.number().int().min(0).default(0).optional(),
    startDate: z
      .string()
      .datetime({ message: 'startDate must be a valid ISO 8601 date.' })
      .optional(),
    endDate: z
      .string()
      .datetime({ message: 'endDate must be a valid ISO 8601 date.' })
      .optional(),
    usageLimit: z.number().int().min(0).optional(),
    appliesTo: z.enum(['product', 'subscription'], {
      errorMap: () => ({ message: "appliesTo must be 'product' or 'subscription'." }),
    }),
    isActive: z.boolean().default(true),
    productIds: z.array(z.number().int().positive()).optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.endDate) >= new Date(data.startDate);
      }
      return true;
    },
    { message: 'endDate must be on or after startDate.', path: ['endDate'] }
  )
  .refine(
    (data) => {
      if (data.type === 'percent' && data.value > 100) {
        return false;
      }
      return true;
    },
    { message: 'Percentage discount value cannot exceed 100.', path: ['value'] }
  );

export const updateDiscountSchema = z
  .object({
    name: z.string().min(2).max(255).optional(),
    type: z.enum(['fixed', 'percent']).optional(),
    value: z.number().min(0).optional(),
    minPurchase: z.number().min(0).optional(),
    minQuantity: z.number().int().min(0).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    usageLimit: z.number().int().min(0).optional(),
    appliesTo: z.enum(['product', 'subscription']).optional(),
    isActive: z.boolean().optional(),
    productIds: z.array(z.number().int().positive()).optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.endDate) >= new Date(data.startDate);
      }
      return true;
    },
    { message: 'endDate must be on or after startDate.', path: ['endDate'] }
  );

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;
export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>;

