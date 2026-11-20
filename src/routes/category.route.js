import { Router } from 'express';
import * as ctrl from '../controllers/category.controller.js';
import * as v from '../validators/category.validator.js';
import validate from '../middlewares/validate.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { ROLES } from '../models/User.js';

const router = Router();

// Public
router.get('/categories/tree', ctrl.tree);

// Admin only 
router.use('/categories', authenticate, authorize(ROLES.ADMIN));

router.post('/categories', validate(v.createCategory), ctrl.create);
router.get('/categories', validate(v.listCategoriesQuery, 'query'), ctrl.list);
router.get('/categories/:id', validate(v.categoryIdParam, 'params'), ctrl.getOne);
router.patch(
  '/categories/:id',
  validate(v.categoryIdParam, 'params'),
  validate(v.updateCategory),
  ctrl.update
);
router.delete('/categories/:id', validate(v.categoryIdParam, 'params'), ctrl.remove);

export default router;