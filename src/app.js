import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env.js';
import userRoutes from './routes/user.route.js';
import categoryRoutes from './routes/category.route.js';
import productRoutes from './routes/product.route.js';
import orderRoutes from './routes/order.route.js';
import { globalLimiter } from './middlewares/rateLimiter.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';

const app = express();
if (env.trustProxy) app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' })); 

app.use('/api', globalLimiter);                                  // before the routes
app.use('/api', userRoutes);
app.use('/api', categoryRoutes);
app.use('/api', productRoutes);
app.use('/api', orderRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;