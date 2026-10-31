import { z } from 'zod';

// ─── Quotation Template Line ──────────────────────────────────────────────────

export const quotationTemplateLineSchema = z.object({
  productId: z.number().int().positive('Product ID must be a positive integer.'),
  variantId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1.').default(1),
});

// ─── Quotation Template ───────────────────────────────────────────────────────

export const createQuotationTemplateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.').max(255),
  planId: z.number().int().positive('Plan ID must be a positive integer.'),
  validityDays: z.number().int().min(1, 'Validity days must be at least 1.').default(30),
  lines: z.array(quotationTemplateLineSchema).min(1, 'At least one line item is required.'),
});

export const updateQuotationTemplateSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  planId: z.number().int().positive().optional(),
  validityDays: z.number().int().min(1).optional(),
  lines: z.array(quotationTemplateLineSchema).min(1).optional(),
});

export type CreateQuotationTemplateInput = z.infer<typeof createQuotationTemplateSchema>;
export type UpdateQuotationTemplateInput = z.infer<typeof updateQuotationTemplateSchema>;

// ─── Subscription Line Item ───────────────────────────────────────────────────

export const createSubscriptionLineSchema = z.object({
  productId: z.number().int().positive('Product ID must be a positive integer.'),
  variantId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1.').default(1),
  unitPrice: z.number().min(0, 'Unit price must be non-negative.').optional(),
  taxId: z.number().int().positive().optional(),
});

// ─── Create Subscription Manual ───────────────────────────────────────────────

export const createSubscriptionSchema = z
  .object({
    customerId: z.number().int().positive('Customer ID must be a positive integer.'),
    planId: z.number().int().positive('Plan ID must be a positive integer.'),
    paymentTermId: z.number().int().positive('Payment term ID must be a positive integer.'),
    startDate: z.string().datetime({ message: 'startDate must be a valid ISO 8601 date.' }),
    expiryDate: z.string().datetime({ message: 'expiryDate must be a valid ISO 8601 date.' }),
    lines: z.array(createSubscriptionLineSchema).min(1, 'At least one line item is required.'),
  })
  .refine(
    (data) => new Date(data.expiryDate) > new Date(data.startDate),
    { message: 'expiryDate must be after startDate.', path: ['expiryDate'] }
  );

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

// ─── Create Subscription From Template ────────────────────────────────────────

export const createFromTemplateSchema = z.object({
  templateId: z.number().int().positive('Template ID must be a positive integer.'),
  customerId: z.number().int().positive('Customer ID must be a positive integer.'),
  paymentTermId: z.number().int().positive('Payment term ID must be a positive integer.'),
  startDate: z.string().datetime().optional(),
});

export type CreateFromTemplateInput = z.infer<typeof createFromTemplateSchema>;

// ─── Status Transition ────────────────────────────────────────────────────────

export const changeSubscriptionStatusSchema = z.object({
  status: z.enum(['draft', 'quotation', 'confirmed', 'active', 'closed'], {
    errorMap: () => ({
      message: "Status must be 'draft', 'quotation', 'confirmed', 'active', or 'closed'.",
    }),
  }),
  reason: z.string().max(255).optional(),
});

export type ChangeSubscriptionStatusInput = z.infer<typeof changeSubscriptionStatusSchema>;
