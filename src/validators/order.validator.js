import { z } from 'zod';
import { ORDER_STATUS } from '../models/Order.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const status = z.enum(Object.values(ORDER_STATUS));

// Only product + quantity are accepted. Prices and totals are never taken from the client.
export const createOrder = z
  .object({
    items: z
      .array(
        z
          .object({
            product: objectId,
            quantity: z.number().int().min(1).max(1000),
          })
          .strict()
      )
      .min(1, 'At least one item is required')
      .max(50, 'Too many items in one order'),
  })
  .strict();

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: status.optional(),
};

export const myOrdersQuery = z.object(pagination);
export const adminListQuery = z.object({ ...pagination, user: objectId.optional() });

export const updateStatus = z.object({ status }).strict();

export const orderIdParam = z.object({ id: objectId });