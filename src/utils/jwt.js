import jwt from 'jsonwebtoken';
import env from '../config/env.js';

const { jwtSecret, jwtExpiresIn } = env;

export const signToken = (user) =>
  jwt.sign({ id: user._id.toString(), role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });

export const verifyToken = (token) => jwt.verify(token, jwtSecret);