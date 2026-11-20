import * as productService from '../services/product.service.js';

// ---------- Admin ----------

export const create = async (req, res) => {
  const product = await productService.createProduct(req.validated.body);
  res.status(201).json({ success: true, message: 'Product created', data: { product } });
};

export const update = async (req, res) => {
  const product = await productService.updateProduct(req.validated.params.id, req.validated.body);
  res.status(200).json({ success: true, message: 'Product updated', data: { product } });
};

export const remove = async (req, res) => {
  await productService.deleteProduct(req.validated.params.id);
  res.status(200).json({ success: true, message: 'Product deleted' });
};

export const adminList = async (req, res) => {
  const result = await productService.listProducts(req.validated.query, { admin: true });
  res.status(200).json({ success: true, data: result.products, pagination: result.pagination });
};

export const adminGetOne = async (req, res) => {
  const product = await productService.getProductById(req.validated.params.id, { admin: true });
  res.status(200).json({ success: true, data: { product } });
};

// ---------- Public / Customer ----------

export const list = async (req, res) => {
  const result = await productService.listProducts(req.validated.query);
  res.status(200).json({ success: true, data: result.products, pagination: result.pagination });
};

export const getOne = async (req, res) => {
  const product = await productService.getProductById(req.validated.params.id);
  res.status(200).json({ success: true, data: { product } });
};