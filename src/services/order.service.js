import Order, { ORDER_STATUS } from '../models/Order.js';
import Product, { PRODUCT_STATUS } from '../models/Product.js';
import { ROLES } from '../models/User.js';
import ApiError from '../utils/ApiError.js';

const S = ORDER_STATUS;

// Allowed status flow
const TRANSITIONS = {
  [S.PENDING]: [S.CONFIRMED, S.CANCELLED],
  [S.CONFIRMED]: [S.PROCESSING, S.CANCELLED],
  [S.PROCESSING]: [S.SHIPPED, S.CANCELLED],
  [S.SHIPPED]: [S.DELIVERED],
  [S.DELIVERED]: [],
  [S.CANCELLED]: [],
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------- Stock helpers ----------

// Atomic: the stock check and the decrement happen in one operation.
// Returns the updated product, or null if it is unavailable / not enough stock.
const reserveStock = async (productId, quantity) => {
  const product = await Product.findOneAndUpdate(
    { _id: productId, status: PRODUCT_STATUS.ACTIVE, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } },
    { returnDocument: 'after' }
  );
  if (product && product.stock === 0) {
    await Product.updateOne(
      { _id: product._id, stock: 0, status: PRODUCT_STATUS.ACTIVE },
      { status: PRODUCT_STATUS.OUT_OF_STOCK }
    );
  }
  return product;
};

// Puts stock back (failed order or cancellation)
const releaseStock = async (lines) => {
  await Promise.all(
    lines.map(async ({ product, quantity }) => {
      await Product.updateOne({ _id: product }, { $inc: { stock: quantity } });
      await Product.updateOne(
        { _id: product, status: PRODUCT_STATUS.OUT_OF_STOCK, stock: { $gt: 0 } },
        { status: PRODUCT_STATUS.ACTIVE }
      );
    })
  );
};

// Explains why a reservation failed
const unavailableError = async (productId, quantity) => {
  const product = await Product.findById(productId).select('name status stock').lean();

  if (!product) {
    return new ApiError(404, 'Product not found', [
      { product: String(productId), reason: 'Product does not exist' },
    ]);
  }
  const reason =
    product.status === PRODUCT_STATUS.INACTIVE
      ? 'Product is not available'
      : product.stock === 0
        ? 'Out of stock'
        : `Only ${product.stock} left in stock`;

  return new ApiError(409, `Cannot order "${product.name}"`, [
    { product: String(productId), name: product.name, requested: quantity, available: product.stock, reason },
  ]);
};

// ---------- Customer ----------

export const placeOrder = async (userId, items) => {
  // Merge duplicate lines: [{A,1},{A,2}] -> A x3
  const merged = new Map();
  for (const { product, quantity } of items) {
    merged.set(product, (merged.get(product) ?? 0) + quantity);
  }

  const reserved = []; // lines whose stock we already took, for rollback
  const lines = [];

  try {
    for (const [productId, quantity] of merged) {
      const product = await reserveStock(productId, quantity);
      if (!product) throw await unavailableError(productId, quantity);

      reserved.push({ product: product._id, quantity });
      lines.push({
        product: product._id,
        name: product.name,
        sku: product.sku,
        price: product.finalPrice, // sale price if set, taken from the same document we decremented
        quantity,
      });
    }

    const totalAmount = round2(lines.reduce((sum, l) => sum + l.price * l.quantity, 0));
    return await Order.create({ user: userId, items: lines, totalAmount });
  } catch (err) {
    // Any failure (stock or saving the order) gives the reserved stock back
    await releaseStock(reserved).catch((e) => console.error('Stock rollback failed:', e));
    throw err;
  }
};

export const listMyOrders = async (userId, { page, limit, status }) => {
  const filter = { user: userId };
  if (status) filter.status = status;
  return paginate(filter, { page, limit });
};

export const cancelMyOrder = async (userId, orderId) => {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== S.PENDING) {
    throw ApiError.conflict('Only pending orders can be cancelled');
  }
  return transition(order, S.CANCELLED);
};

// ---------- Shared ----------

// Customers can only load their own orders. Others get 404, so order ids are not leaked.
export const getOrder = async (orderId, user) => {
  const filter = { _id: orderId };
  if (user.role !== ROLES.ADMIN) filter.user = user._id;

  const order = await Order.findOne(filter).populate('user', 'name email');
  if (!order) throw ApiError.notFound('Order not found');
  return order;
};

// ---------- Admin ----------

export const listAllOrders = async ({ page, limit, status, user }) => {
  const filter = {};
  if (status) filter.status = status;
  if (user) filter.user = user;
  return paginate(filter, { page, limit, populateUser: true });
};

export const updateOrderStatus = async (orderId, nextStatus) => {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  if (!TRANSITIONS[order.status].includes(nextStatus)) {
    const allowed = TRANSITIONS[order.status].join(', ') || 'none';
    throw ApiError.badRequest(
      `Cannot change status from "${order.status}" to "${nextStatus}". Allowed: ${allowed}`
    );
  }
  return transition(order, nextStatus);
};

// ---------- Internals ----------

// Compare-and-set on the current status, so two simultaneous requests
// (e.g. double cancel) cannot both succeed and restock twice.
const transition = async (order, nextStatus) => {
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { status: nextStatus },
    { returnDocument: 'after' }
  );
  if (!updated) throw ApiError.conflict('Order status was changed by another request. Please retry');

  if (nextStatus === S.CANCELLED) await releaseStock(order.items);
  return updated;
};

const paginate = async (filter, { page, limit, populateUser = false }) => {
  let query = Order.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  if (populateUser) query = query.populate('user', 'name email');

  const [orders, total] = await Promise.all([query, Order.countDocuments(filter)]);
  return {
    orders,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};