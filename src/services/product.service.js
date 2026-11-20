import Product, { PRODUCT_STATUS } from '../models/Product.js';
import Category from '../models/Category.js';
import ApiError from '../utils/ApiError.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  price_asc: { finalPrice: 1, _id: 1 },
  price_desc: { finalPrice: -1, _id: -1 },
  name_asc: { name: 1, _id: 1 },
  name_desc: { name: -1, _id: -1 },
};

// Customers see active + out_of_stock products. Inactive ones are hidden.
const CUSTOMER_VISIBLE = [PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.OUT_OF_STOCK];

const statusFromStock = (stock) =>
  stock > 0 ? PRODUCT_STATUS.ACTIVE : PRODUCT_STATUS.OUT_OF_STOCK;

const assertCategoryUsable = async (categoryId) => {
  const category = await Category.findById(categoryId).select('isActive').lean();
  if (!category) throw ApiError.notFound('Category not found');
  if (!category.isActive) throw ApiError.badRequest('Cannot use an inactive category');
};

// ---------- Admin ----------

export const createProduct = async (data) => {
  await assertCategoryUsable(data.category);

  if (await Product.exists({ sku: data.sku })) {
    throw ApiError.conflict('SKU already exists');
  }

  return Product.create({ ...data, status: data.status ?? statusFromStock(data.stock) });
};

export const updateProduct = async (id, data) => {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');

  if (data.category && String(data.category) !== String(product.category)) {
    await assertCategoryUsable(data.category);
  }
  if (data.sku && data.sku !== product.sku) {
    if (await Product.exists({ sku: data.sku, _id: { $ne: id } })) {
      throw ApiError.conflict('SKU already exists');
    }
  }

  product.set(data);

  // Keep status in sync with stock unless the admin set a status explicitly
  // or deliberately made the product inactive.
  if (
    data.stock !== undefined &&
    data.status === undefined &&
    product.status !== PRODUCT_STATUS.INACTIVE
  ) {
    product.status = statusFromStock(product.stock);
  }

  await product.save(); // runs the pre('validate') hook (sale price check + finalPrice)
  return product;
};

export const deleteProduct = async (id) => {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  await product.deleteOne();
};

// ---------- Listing (shared by customer + admin) ----------

export const listProducts = async (query, { admin = false } = {}) => {
  const { page, limit, search, category, minPrice, maxPrice, sort, status } = query;
  const filter = {};

  if (admin) {
    if (status) filter.status = status;
  } else {
    filter.status = { $in: CUSTOMER_VISIBLE };
  }

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { sku: rx }];
  }

  // Parent category -> include every sub-category (uses the `ancestors` index)
  if (category) {
    const root = await Category.findById(category).select('isActive').lean();
    if (!root || (!admin && !root.isActive)) throw ApiError.notFound('Category not found');

    const descendants = await Category.find({ ancestors: category }).select('_id').lean();
    filter.category = { $in: [root._id, ...descendants.map((d) => d._id)] };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.finalPrice = {};
    if (minPrice !== undefined) filter.finalPrice.$gte = minPrice;
    if (maxPrice !== undefined) filter.finalPrice.$lte = maxPrice;
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name')
      .sort(SORTS[sort])
      .skip((page - 1) * limit)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  return {
    products,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getProductById = async (id, { admin = false } = {}) => {
  const product = await Product.findById(id).populate('category', 'name ancestors');
  if (!product || (!admin && !CUSTOMER_VISIBLE.includes(product.status))) {
    throw ApiError.notFound('Product not found');
  }
  return product;
};