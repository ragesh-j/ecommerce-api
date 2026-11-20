import * as categoryService from '../services/category.service.js';

export const create = async (req, res) => {
  const category = await categoryService.createCategory(req.validated.body);
  res.status(201).json({ success: true, message: 'Category created', data: { category } });
};

export const update = async (req, res) => {
  const category = await categoryService.updateCategory(
    req.validated.params.id,
    req.validated.body
  );
  res.status(200).json({ success: true, message: 'Category updated', data: { category } });
};

export const remove = async (req, res) => {
  await categoryService.deleteCategory(req.validated.params.id);
  res.status(200).json({ success: true, message: 'Category deleted' });
};

export const list = async (req, res) => {
  const result = await categoryService.listCategories(req.validated.query);
  res.status(200).json({ success: true, data: result.categories, pagination: result.pagination });
};

export const getOne = async (req, res) => {
  const { category, children } = await categoryService.getCategoryById(req.validated.params.id);
  res.status(200).json({ success: true, data: { category, children } });
};

export const tree = async (req, res) => {
  // includeInactive is admin-only, so it is ignored for public callers
  const data = await categoryService.getCategoryTree({ includeInactive: false });
  res.status(200).json({ success: true, data });
};