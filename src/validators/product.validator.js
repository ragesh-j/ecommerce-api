import { z } from 'zod';
import { PRODUCT_STATUS } from '../models/Product.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const status = z.enum(Object.values(PRODUCT_STATUS));

const sku = z
  .string()
  .trim()
  .min(2, 'SKU must be at least 2 characters')
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, 'SKU can only contain letters, numbers, "-" and "_"')
  .toUpperCase();

const salePriceOk = (d) => d.salePrice == null || d.price == null || d.salePrice <= d.price;
const salePriceError = { message: 'Sale price cannot exceed price', path: ['salePrice'] };

export const createProduct = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
    sku,
    description: z.string().trim().max(2000).optional(),
    price: z.number().min(0),
    salePrice: z.number().min(0).nullable().optional(),
    stock: z.number().int().min(0).default(0),
    category: objectId,
    status: status.optional(),
  })
  .strict()
  .refine(salePriceOk, salePriceError);

export const updateProduct = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    sku: sku.optional(),
    description: z.string().trim().max(2000).optional(),
    price: z.number().min(0).optional(),
    salePrice: z.number().min(0).nullable().optional(), // null removes the sale price
    stock: z.number().int().min(0).optional(),
    category: objectId.optional(),
    status: status.optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'At least one field is required')
  .refine(salePriceOk, salePriceError);

const listShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
  category: objectId.optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z
    .enum(['newest', 'oldest', 'price_asc', 'price_desc', 'name_asc', 'name_desc'])
    .default('newest'),
};

const priceRangeOk = (d) => d.minPrice == null || d.maxPrice == null || d.minPrice <= d.maxPrice;
const priceRangeError = { message: 'minPrice cannot be greater than maxPrice', path: ['minPrice'] };

export const customerListQuery = z.object(listShape).refine(priceRangeOk, priceRangeError);

export const adminListQuery = z
  .object({ ...listShape, status: status.optional() })
  .refine(priceRangeOk, priceRangeError);

export const productIdParam = z.object({ id: objectId });