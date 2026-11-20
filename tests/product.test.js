import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Category from '../src/models/Category.js';
import Product from '../src/models/Product.js';

let adminToken;
let electronics, mobiles, android, fashion;
const auth = () => ({ Authorization: `Bearer ${adminToken}` });

const base = (overrides = {}) => ({
  name: 'Product',
  sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
  price: 100,
  stock: 10,
  category: android._id,
  ...overrides,
});

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([Product.init(), Category.init()]);
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Category.deleteMany({}), Product.deleteMany({})]);

  await User.create({ name: 'Admin', email: 'admin@example.com', password: 'password123', role: 'admin' });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'password123' });
  adminToken = res.body.data.token;

  electronics = await Category.create({ name: 'Electronics' });
  mobiles = await Category.create({ name: 'Mobiles', parent: electronics._id, ancestors: [electronics._id] });
  android = await Category.create({
    name: 'Android',
    parent: mobiles._id,
    ancestors: [electronics._id, mobiles._id],
  });
  fashion = await Category.create({ name: 'Fashion' });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Admin product management', () => {
  it('forbids customers (403) and anonymous users (401)', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Cust', email: 'c@example.com', password: 'password123' });
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${reg.body.data.token}`)
      .send(base());
    expect(res.status).toBe(403);
    expect((await request(app).post('/api/products').send(base())).status).toBe(401);
  });

  it('creates a product, uppercases the SKU and sets finalPrice', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(auth())
      .send(base({ sku: 'abc-1', price: 1000, salePrice: 800 }));
    expect(res.status).toBe(201);
    expect(res.body.data.product.sku).toBe('ABC-1');
    expect(res.body.data.product.finalPrice).toBe(800);
  });

  it('rejects salePrice greater than price (400)', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(auth())
      .send(base({ price: 100, salePrice: 150 }));
    expect(res.status).toBe(400);
  });

  it('rejects lowering price below the existing salePrice (400)', async () => {
    const created = await request(app)
      .post('/api/products')
      .set(auth())
      .send(base({ price: 100, salePrice: 90 }));
    const res = await request(app)
      .patch(`/api/products/${created.body.data.product._id}`)
      .set(auth())
      .send({ price: 50 });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate SKU (409)', async () => {
    await request(app).post('/api/products').set(auth()).send(base({ sku: 'DUP-1' }));
    const res = await request(app).post('/api/products').set(auth()).send(base({ sku: 'dup-1' }));
    expect(res.status).toBe(409);
  });

  it('returns 404 for an unknown category', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(auth())
      .send(base({ category: new mongoose.Types.ObjectId().toString() }));
    expect(res.status).toBe(404);
  });

  it('syncs status with stock', async () => {
    const created = await request(app).post('/api/products').set(auth()).send(base({ stock: 0 }));
    expect(created.body.data.product.status).toBe('out_of_stock');

    const id = created.body.data.product._id;
    const res = await request(app).patch(`/api/products/${id}`).set(auth()).send({ stock: 5 });
    expect(res.body.data.product.status).toBe('active');
  });

  it('removes salePrice with null', async () => {
    const created = await request(app)
      .post('/api/products')
      .set(auth())
      .send(base({ price: 100, salePrice: 80 }));
    const res = await request(app)
      .patch(`/api/products/${created.body.data.product._id}`)
      .set(auth())
      .send({ salePrice: null });
    expect(res.body.data.product.finalPrice).toBe(100);
  });

  it('deletes a product', async () => {
    const created = await request(app).post('/api/products').set(auth()).send(base());
    const res = await request(app)
      .delete(`/api/products/${created.body.data.product._id}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(await Product.countDocuments()).toBe(0);
  });

  it('blocks deleting a category that has products (409)', async () => {
    await Product.create(base());
    const res = await request(app).delete(`/api/categories/${android._id}`).set(auth());
    expect(res.status).toBe(409);
  });
});

describe('GET /api/products (customer listing)', () => {
  beforeEach(async () => {
    await Product.create([
      base({ name: 'Galaxy S', sku: 'A1', price: 1000, salePrice: 800, category: android._id }),
      base({ name: 'Basic Phone', sku: 'B1', price: 500, category: mobiles._id }),
      base({ name: 'Laptop X', sku: 'C1', price: 2000, category: electronics._id }),
      base({ name: 'T-Shirt', sku: 'D1', price: 20, category: fashion._id }),
    ]);
  });

  it('is public and paginates', async () => {
    const res = await request(app).get('/api/products?page=1&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(4);
  });

  it('filtering by a parent category includes all descendants', async () => {
    const res = await request(app).get(`/api/products?category=${electronics._id}`);
    const names = res.body.data.map((p) => p.name).sort();
    expect(names).toEqual(['Basic Phone', 'Galaxy S', 'Laptop X']);
  });

  it('filtering by a leaf category returns only its products', async () => {
    const res = await request(app).get(`/api/products?category=${android._id}`);
    expect(res.body.data.map((p) => p.name)).toEqual(['Galaxy S']);
  });

  it('filters by price using the sale price', async () => {
    const res = await request(app).get('/api/products?minPrice=600&maxPrice=900');
    expect(res.body.data.map((p) => p.name)).toEqual(['Galaxy S']);
  });

  it('rejects minPrice > maxPrice (400)', async () => {
    const res = await request(app).get('/api/products?minPrice=500&maxPrice=100');
    expect(res.status).toBe(400);
  });

  it('sorts by effective price', async () => {
    const res = await request(app).get('/api/products?sort=price_asc');
    expect(res.body.data.map((p) => p.sku)).toEqual(['D1', 'B1', 'A1', 'C1']);
  });

  it('searches by name or SKU', async () => {
    expect((await request(app).get('/api/products?search=laptop')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/products?search=d1')).body.data).toHaveLength(1);
  });

  it('hides inactive products from customers but not from admins', async () => {
    await Product.updateOne({ sku: 'D1' }, { status: 'inactive' });

    const customer = await request(app).get('/api/products');
    expect(customer.body.pagination.total).toBe(3);

    const admin = await request(app).get('/api/admin/products').set(auth());
    expect(admin.body.pagination.total).toBe(4);

    const hidden = await Product.findOne({ sku: 'D1' });
    expect((await request(app).get(`/api/products/${hidden._id}`)).status).toBe(404);
  });

  it('returns 404 when filtering by an inactive category', async () => {
    await Category.updateOne({ _id: fashion._id }, { isActive: false });
    const res = await request(app).get(`/api/products?category=${fashion._id}`);
    expect(res.status).toBe(404);
  });
});