import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Category from '../src/models/Category.js';

let adminToken;
const auth = () => ({ Authorization: `Bearer ${adminToken}` });

const create = (body) => request(app).post('/api/categories').set(auth()).send(body);
const mk = async (name, parent = null) => (await create({ name, parent })).body.data.category;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Category.init(); // make sure unique index exists
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Category.deleteMany({})]);
  await User.create({ name: 'Admin', email: 'admin@example.com', password: 'password123', role: 'admin' });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'password123' });
  adminToken = res.body.data.token;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Category CRUD & authorization', () => {
  it('forbids customers (403) and anonymous users (401)', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Cust', email: 'c@example.com', password: 'password123' });
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${reg.body.data.token}`)
      .send({ name: 'Electronics' });
    expect(res.status).toBe(403);

    expect((await request(app).post('/api/categories').send({ name: 'X1' })).status).toBe(401);
  });

  it('creates nested categories with ancestors', async () => {
    const e = await mk('Electronics');
    const m = await mk('Mobiles', e._id);
    const a = await mk('Android Phones', m._id);
    expect(a.ancestors).toEqual([e._id, m._id]);
  });

  it('rejects duplicate sibling names (409) but allows same name elsewhere', async () => {
    const e = await mk('Electronics');
    const c = await mk('Computers');
    await mk('Accessories', e._id);
    expect((await create({ name: 'accessories', parent: e._id })).status).toBe(409);
    expect((await create({ name: 'Accessories', parent: c._id })).status).toBe(201);
  });

  it('returns 404 for an unknown parent', async () => {
    const res = await create({ name: 'Orphan', parent: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(404);
  });
});

describe('Hierarchy rules', () => {
  it('rejects a category as its own parent', async () => {
    const e = await mk('Electronics');
    const res = await request(app).patch(`/api/categories/${e._id}`).set(auth()).send({ parent: e._id });
    expect(res.status).toBe(400);
  });

  it('rejects moving a category under its own descendant (circular)', async () => {
    const e = await mk('Electronics');
    const m = await mk('Mobiles', e._id);
    const a = await mk('Android', m._id);
    const res = await request(app).patch(`/api/categories/${e._id}`).set(auth()).send({ parent: a._id });
    expect(res.status).toBe(400);
  });

  it('moves a subtree and rewrites descendants ancestors', async () => {
    const e = await mk('Electronics');
    const c = await mk('Computers');
    const m = await mk('Mobiles', e._id);
    const a = await mk('Android', m._id);

    const res = await request(app).patch(`/api/categories/${m._id}`).set(auth()).send({ parent: c._id });
    expect(res.status).toBe(200);

    const moved = await Category.findById(a._id).lean();
    expect(moved.ancestors.map(String)).toEqual([c._id, m._id]);
  });

  it('moves a category to root with parent: null', async () => {
    const e = await mk('Electronics');
    const m = await mk('Mobiles', e._id);
    const a = await mk('Android', m._id);
    await request(app).patch(`/api/categories/${m._id}`).set(auth()).send({ parent: null });
    const child = await Category.findById(a._id).lean();
    expect(child.ancestors.map(String)).toEqual([m._id]);
  });

  it('deactivating a parent deactivates its subtree', async () => {
    const e = await mk('Electronics');
    const m = await mk('Mobiles', e._id);
    await request(app).patch(`/api/categories/${e._id}`).set(auth()).send({ isActive: false });
    expect((await Category.findById(m._id)).isActive).toBe(false);
  });
});

describe('Delete', () => {
  it('blocks deleting a category that has children (409)', async () => {
    const e = await mk('Electronics');
    await mk('Mobiles', e._id);
    const res = await request(app).delete(`/api/categories/${e._id}`).set(auth());
    expect(res.status).toBe(409);
  });

  it('deletes a leaf category', async () => {
    const e = await mk('Electronics');
    const res = await request(app).delete(`/api/categories/${e._id}`).set(auth());
    expect(res.status).toBe(200);
  });
});

describe('GET /api/categories/tree', () => {
  it('returns the full nested tree publicly (active only)', async () => {
    const e = await mk('Electronics');
    const m = await mk('Mobiles', e._id);
    await mk('Android Phones', m._id);
    const hidden = await mk('Hidden', e._id);
    await request(app).patch(`/api/categories/${hidden._id}`).set(auth()).send({ isActive: false });

    const res = await request(app).get('/api/categories/tree');
    expect(res.status).toBe(200);
    const root = res.body.data[0];
    expect(root.name).toBe('Electronics');
    expect(root.children).toHaveLength(1);
    expect(root.children[0].children[0].name).toBe('Android Phones');
  });
});