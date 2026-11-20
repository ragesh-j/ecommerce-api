import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Category from '../src/models/Category.js';
import Product from '../src/models/Product.js';
import Order from '../src/models/Order.js';

let adminToken, aliceToken, bobToken, category;
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

const register = async (name, email) => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: 'password123' });
  return res.body.data.token;
};

const mkProduct = (overrides = {}) =>
  Product.create({
    name: 'Item',
    sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
    price: 100,
    stock: 10,
    category: category._id,
    ...overrides,
  });

const place = (token, items) => request(app).post('/api/orders').set(bearer(token)).send({ items });
const line = (p, quantity = 1) => ({ product: String(p._id), quantity });

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([Product.init(), Category.init(), Order.init()]);
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
  ]);

  await User.create({ name: 'Admin', email: 'admin@example.com', password: 'password123', role: 'admin' });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'password123' });
  adminToken = res.body.data.token;

  aliceToken = await register('Alice', 'alice@example.com');
  bobToken = await register('Bob', 'bob@example.com');
  category = await Category.create({ name: 'Electronics' });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('POST /api/orders', () => {
  it('requires a customer token (401 anonymous, 403 admin)', async () => {
    const p = await mkProduct();
    expect((await request(app).post('/api/orders').send({ items: [line(p)] })).status).toBe(401);
    expect((await place(adminToken, [line(p)])).status).toBe(403);
  });

  it('calculates totals on the backend using the sale price and reduces stock', async () => {
    const a = await mkProduct({ price: 1000, salePrice: 800, stock: 5 });
    const b = await mkProduct({ price: 50, stock: 3 });

    const res = await place(aliceToken, [line(a, 2), line(b, 1)]);
    expect(res.status).toBe(201);
    expect(res.body.data.order.totalAmount).toBe(1650); // 800*2 + 50
    expect(res.body.data.order.status).toBe('pending');
    expect(res.body.data.order.items[0].price).toBe(800);

    expect((await Product.findById(a._id)).stock).toBe(3);
    expect((await Product.findById(b._id)).stock).toBe(2);
  });

  it('rejects client-supplied prices or totals (400)', async () => {
    const p = await mkProduct();
    const res = await request(app)
      .post('/api/orders')
      .set(bearer(aliceToken))
      .send({ items: [{ product: String(p._id), quantity: 1, price: 1 }], totalAmount: 1 });
    expect(res.status).toBe(400);
  });

  it('merges duplicate lines of the same product', async () => {
    const p = await mkProduct({ stock: 5 });
    const res = await place(aliceToken, [line(p, 1), line(p, 2)]);
    expect(res.status).toBe(201);
    expect(res.body.data.order.items).toHaveLength(1);
    expect(res.body.data.order.items[0].quantity).toBe(3);
    expect((await Product.findById(p._id)).stock).toBe(2);
  });

  it('rejects insufficient stock (409) and rolls back earlier lines', async () => {
    const a = await mkProduct({ stock: 5 });
    const b = await mkProduct({ stock: 1 });

    const res = await place(aliceToken, [line(a, 2), line(b, 3)]);
    expect(res.status).toBe(409);
    expect(res.body.errors[0].available).toBe(1);

    expect((await Product.findById(a._id)).stock).toBe(5); // restored
    expect(await Order.countDocuments()).toBe(0);
  });

  it('rejects inactive products and unknown products', async () => {
    const inactive = await mkProduct({ status: 'inactive' });
    expect((await place(aliceToken, [line(inactive)])).status).toBe(409);

    const ghost = { product: new mongoose.Types.ObjectId().toString(), quantity: 1 };
    expect((await place(aliceToken, [ghost])).status).toBe(404);
  });

  it('marks the product out_of_stock when the last unit is bought', async () => {
    const p = await mkProduct({ stock: 2 });
    await place(aliceToken, [line(p, 2)]);
    const fresh = await Product.findById(p._id);
    expect(fresh.stock).toBe(0);
    expect(fresh.status).toBe('out_of_stock');
  });

  it('lets only one of two simultaneous buyers get the last item', async () => {
    const p = await mkProduct({ stock: 1 });
    const [a, b] = await Promise.all([
      place(aliceToken, [line(p)]),
      place(bobToken, [line(p)]),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((await Product.findById(p._id)).stock).toBe(0);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('validates the body (400)', async () => {
    expect((await place(aliceToken, [])).status).toBe(400);
    const p = await mkProduct();
    expect((await place(aliceToken, [line(p, 0)])).status).toBe(400);
  });
});

describe('Viewing orders', () => {
  let aliceOrder;

  beforeEach(async () => {
    const p = await mkProduct({ stock: 50 });
    aliceOrder = (await place(aliceToken, [line(p)])).body.data.order;
    await place(bobToken, [line(p)]);
  });

  it('customers list only their own orders', async () => {
    const res = await request(app).get('/api/orders/my').set(bearer(aliceToken));
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data[0]._id).toBe(aliceOrder._id);
  });

  it("a customer cannot read another customer's order (404)", async () => {
    const res = await request(app).get(`/api/orders/${aliceOrder._id}`).set(bearer(bobToken));
    expect(res.status).toBe(404);
  });

  it('a customer can read their own order', async () => {
    const res = await request(app).get(`/api/orders/${aliceOrder._id}`).set(bearer(aliceToken));
    expect(res.status).toBe(200);
  });

  it('admin can read any order and list all orders', async () => {
    const one = await request(app).get(`/api/orders/${aliceOrder._id}`).set(bearer(adminToken));
    expect(one.status).toBe(200);

    const all = await request(app).get('/api/admin/orders').set(bearer(adminToken));
    expect(all.body.pagination.total).toBe(2);

    const filtered = await request(app)
      .get('/api/admin/orders?status=shipped')
      .set(bearer(adminToken));
    expect(filtered.body.pagination.total).toBe(0);
  });

  it('customers cannot use admin order routes (403)', async () => {
    expect((await request(app).get('/api/admin/orders').set(bearer(aliceToken))).status).toBe(403);
  });
});

describe('Order status', () => {
  const setStatus = (id, status) =>
    request(app).patch(`/api/admin/orders/${id}/status`).set(bearer(adminToken)).send({ status });

  let order, product;

  beforeEach(async () => {
    product = await mkProduct({ stock: 5 });
    order = (await place(aliceToken, [line(product, 2)])).body.data.order;
  });

  it('follows the allowed flow', async () => {
    expect((await setStatus(order._id, 'confirmed')).status).toBe(200);
    expect((await setStatus(order._id, 'processing')).status).toBe(200);
    expect((await setStatus(order._id, 'shipped')).status).toBe(200);
    const done = await setStatus(order._id, 'delivered');
    expect(done.body.data.order.status).toBe('delivered');
  });

  it('rejects skipping steps (400)', async () => {
    expect((await setStatus(order._id, 'shipped')).status).toBe(400);
  });

  it('cancelling restocks the product and cannot be done twice', async () => {
    expect((await Product.findById(product._id)).stock).toBe(3);

    const res = await setStatus(order._id, 'cancelled');
    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(5);

    expect((await setStatus(order._id, 'cancelled')).status).toBe(400);
    expect((await Product.findById(product._id)).stock).toBe(5);
  });

  it('cancelling restores out_of_stock products to active', async () => {
    const last = await mkProduct({ stock: 1 });
    const o = (await place(aliceToken, [line(last)])).body.data.order;
    expect((await Product.findById(last._id)).status).toBe('out_of_stock');

    await setStatus(o._id, 'cancelled');
    const fresh = await Product.findById(last._id);
    expect(fresh.stock).toBe(1);
    expect(fresh.status).toBe('active');
  });

  it('a shipped order cannot be cancelled', async () => {
    await setStatus(order._id, 'confirmed');
    await setStatus(order._id, 'processing');
    await setStatus(order._id, 'shipped');
    expect((await setStatus(order._id, 'cancelled')).status).toBe(400);
  });

  it('a customer can cancel their own pending order only', async () => {
    const other = await request(app)
      .patch(`/api/orders/${order._id}/cancel`)
      .set(bearer(bobToken));
    expect(other.status).toBe(404);

    const own = await request(app)
      .patch(`/api/orders/${order._id}/cancel`)
      .set(bearer(aliceToken));
    expect(own.status).toBe(200);
    expect((await Product.findById(product._id)).stock).toBe(5);
  });

  it('a customer cannot cancel once the order is confirmed (409)', async () => {
    await setStatus(order._id, 'confirmed');
    const res = await request(app)
      .patch(`/api/orders/${order._id}/cancel`)
      .set(bearer(aliceToken));
    expect(res.status).toBe(409);
  });

  it('a customer cannot change status via the admin route (403)', async () => {
    const res = await request(app)
      .patch(`/api/admin/orders/${order._id}/status`)
      .set(bearer(aliceToken))
      .send({ status: 'confirmed' });
    expect(res.status).toBe(403);
  });
});