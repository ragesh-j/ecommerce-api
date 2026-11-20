import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const register = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

export const login = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email')),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfile = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    email: z.string().trim().toLowerCase().pipe(z.email('Invalid email')).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'At least one field is required');

export const listUsersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  role: z.enum(['admin', 'customer']).optional(),
  // z.coerce.boolean() turns the string "false" into true, so use this instead
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  search: z.string().trim().max(100).optional(),
});

export const userIdParam = z.object({
  id: objectId,
})

export const updateStatus = z.object({
  isActive: z.boolean(),
}).strict();
