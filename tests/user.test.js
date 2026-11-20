import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';

const customer = { name: 'Test User', email: 'test@example.com', password: 'password123' };

const registerAndLogin = async (data = customer) => {
  const res = await request(app).post('/api/auth/register').send(data);
  return res.body.data;
};

const createAdminToken = async () => {
  await User.create({
    name: 'Admin',
    email: 'admin@example.com',
    password: 'password123',
    role: 'admin',
  });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'password123' });
  return { token: res.body.data.token, id: res.body.data.user._id };
};

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
});

beforeEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('POST /api/auth/register', () => {
  it('registers a customer and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send(customer);
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('ignores role sent by the client', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...customer, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('customer');
  });

  it('rejects a duplicate email with 409', async () => {
    await registerAndLogin();
    const res = await request(app).post('/api/auth/register').send(customer);
    expect(res.status).toBe(409);
  });

  it('rejects a short password with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...customer, password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('password');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await registerAndLogin();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: customer.email, password: customer.password });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
  });

  it('returns 401 for a wrong password', async () => {
    await registerAndLogin();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: customer.email, password: 'wrongpass123' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/users/me', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });

  it('returns the profile with a valid token', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(customer.email);
  });
});

describe('Admin user management', () => {
  it('forbids a customer from listing users (403)', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('lets an admin list users with pagination', async () => {
    await registerAndLogin();
    const { token } = await createAdminToken();
    const res = await request(app)
      .get('/api/users?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
  });

  it('deactivates a user and blocks their existing token', async () => {
    const { user, token: userToken } = await registerAndLogin();
    const { token: adminToken } = await createAdminToken();

    const res = await request(app)
      .patch(`/api/users/${user._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(200);

    const blocked = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(blocked.status).toBe(403);
  });

  it('stops an admin from deactivating themselves', async () => {
    const { token, id } = await createAdminToken();
    const res = await request(app)
      .patch(`/api/users/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid id', async () => {
    const { token } = await createAdminToken();
    const res = await request(app)
      .get('/api/users/123')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});