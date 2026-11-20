import { Router } from 'express';
import * as ctrl from '../controllers/user.controller.js';
import * as v from '../validators/user.validator.js';
import validate from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { loginLimiter, registerLimiter } from '../middlewares/rateLimiter.js'; 
import { ROLES } from '../models/User.js';

const router = Router();

// Public
router.post('/auth/register', registerLimiter, validate(v.register), ctrl.register);
router.post('/auth/login', loginLimiter, validate(v.login), ctrl.login);

// Authenticated (any role)
router.get('/users/me', authenticate, ctrl.getMe);
router.patch('/users/me', authenticate, validate(v.updateProfile), ctrl.updateMe);

// Admin only
router.get(
  '/users',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(v.listUsersQuery, 'query'),
  ctrl.listUsers
);
router.get(
  '/users/:id',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(v.userIdParam, 'params'),
  ctrl.getUser
);
router.patch(
  '/users/:id/status',
  authenticate,
  authorize(ROLES.ADMIN),
  validate(v.userIdParam, 'params'),
  validate(v.updateStatus),
  ctrl.setStatus
);

export default router;