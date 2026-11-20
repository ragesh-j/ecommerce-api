import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(100);
const description = z.string().trim().max(500);

export const createCategory = z
  .object({
    name,
    description: description.optional(),
    parent: objectId.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateCategory = z
  .object({
    name: name.optional(),
    description: description.optional(),
    parent: objectId.nullable().optional(), // null = move to root level
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'At least one field is required');

export const listCategoriesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  // objectId = children of that category, "null" = root categories only
  parent: z.union([objectId, z.literal('null')]).optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  search: z.string().trim().max(100).optional(),
});

export const treeQuery = z.object({
  includeInactive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const categoryIdParam = z.object({ id: objectId });