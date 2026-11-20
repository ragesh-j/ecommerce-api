import mongoose from 'mongoose';
import env from '../src/config/env.js';
import User, { ROLES } from '../src/models/User.js';

const { ADMIN_NAME = 'Admin', ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (optionally ADMIN_NAME) and run again.');
  process.exit(1);
}

await mongoose.connect(env.mongoUri);

const email = ADMIN_EMAIL.trim().toLowerCase();
const existing = await User.findOne({ email });

if (existing) {
  existing.role = ROLES.ADMIN;
  await existing.save();
  console.log(`Existing user ${email} promoted to admin`);
} else {
  await User.create({ name: ADMIN_NAME, email, password: ADMIN_PASSWORD, role: ROLES.ADMIN });
  console.log(`Admin ${email} created`);
}

await mongoose.disconnect();