import env from './src/config/env.js';
import connectDB from './src/config/db.js';
import app from './src/app.js';

const { port } = env;

connectDB()
  .then(() => app.listen(port, () => console.log(`Server running on port ${port}`)))
  .catch((err) => {
    console.error('Startup failed:', err);
    process.exit(1);
  });