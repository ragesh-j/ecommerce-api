import { Router } from 'express';
import * as ctrl from '../controllers/product.controller.js';
import * as v from '../validators/product.validator.js';
import validate from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { ROLES } from '../models/User.js';

const router = Router();
const adminOnly = [authenticate, authorize(ROLES.ADMIN)];

// Public (customer browsing)
router.get('/products', validate(v.customerListQuery, 'query'), ctrl.list);
router.get('/products/:id', validate(v.productIdParam, 'params'), ctrl.getOne);

// Admin
router.get('/admin/products', ...adminOnly, validate(v.adminListQuery, 'query'), ctrl.adminList);
router.get('/admin/products/:id', ...adminOnly, validate(v.productIdParam, 'params'), ctrl.adminGetOne);
router.post('/products', ...adminOnly, validate(v.createProduct), ctrl.create);
router.patch(
  '/products/:id',
  ...adminOnly,
  validate(v.productIdParam, 'params'),
  validate(v.updateProduct),
  ctrl.update
);
router.delete('/products/:id', ...adminOnly, validate(v.productIdParam, 'params'), ctrl.remove);

export default router;