import { Router } from 'express';
import * as ctrl from '../controllers/order.controller.js';
import * as v from '../validators/order.validator.js';
import validate from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { ROLES } from '../models/User.js';

const router = Router();
const customerOnly = [authenticate, authorize(ROLES.CUSTOMER)];
const adminOnly = [authenticate, authorize(ROLES.ADMIN)];

// Customer
router.post('/orders', ...customerOnly, validate(v.createOrder), ctrl.create);
router.get('/orders/my', ...customerOnly, validate(v.myOrdersQuery, 'query'), ctrl.myList); // before /:id
router.patch('/orders/:id/cancel', ...customerOnly, validate(v.orderIdParam, 'params'), ctrl.cancel);

// Customer (own order only) or Admin (any order)
router.get('/orders/:id', authenticate, validate(v.orderIdParam, 'params'), ctrl.getOne);

// Admin
router.get('/admin/orders', ...adminOnly, validate(v.adminListQuery, 'query'), ctrl.adminList);
router.patch(
  '/admin/orders/:id/status',
  ...adminOnly,
  validate(v.orderIdParam, 'params'),
  validate(v.updateStatus),
  ctrl.updateStatus
);

export default router;