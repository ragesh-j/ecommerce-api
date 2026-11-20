# E-commerce REST API

A backend REST API for a basic e-commerce application built with Node.js, Express, MongoDB (Mongoose) and JWT authentication.

**Modules:** User management, multi-level categories, products, and orders with safe stock handling.

> API documentation: import the [Postman collection](docs/ecom.postman_collection.json), or see the [API reference](#api-reference) below.

## Tech stack

- Node.js 24, Express 5
- MongoDB with Mongoose 9
- JWT (`jsonwebtoken`) and `bcryptjs` for authentication and password hashing
- Zod for request validation
- `helmet`, `cors`, `express-rate-limit` for security
- Jest and Supertest for tests
- Docker and Docker Compose

## Features

- **Users:** register, login, profile, roles (`admin`, `customer`). Admins can list users, view a user, and activate or deactivate accounts.
- **Categories:** unlimited nesting, full tree endpoint, create, update (rename, move, activate or deactivate), delete. Circular parent-child relationships are rejected.
- **Products:** CRUD for admins. Customer listing with search, category filter (includes all sub-categories), price filter, sorting and pagination.
- **Orders:** customers place orders with multiple items. Prices and totals are calculated on the backend, stock is validated and reduced atomically, and customers see only their own orders. Admins see all orders and update status.

## Project structure

```
.
├── index.js                 # Entry point: connects to DB, starts server
├── docs/
│   └── ecom.postman_collection.json   # Postman collection for all endpoints
├── scripts/
│   └── seedAdmin.js         # Creates (or promotes) an admin user
├── src/
│   ├── app.js               # Express app: middleware, routes, error handling
│   ├── config/              # env.js (env loading/validation), db.js (Mongo connection)
│   ├── routes/              # URL -> middleware -> controller mapping
│   ├── validators/          # Zod schemas for body, query and params
│   ├── controllers/         # HTTP layer: reads validated input, sends responses
│   ├── services/            # Business logic and database access
│   ├── models/              # Mongoose schemas
│   ├── middlewares/         # auth, validate, rateLimiter, errorHandler
│   └── utils/               # ApiError, jwt helpers
├── tests/                   # Jest + Supertest integration tests
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

Request flow: `route -> validator -> controller -> service -> model`.

## Getting started

### Option A: Run locally (without Docker)

**Prerequisites:** Node.js 24 and a MongoDB instance running on `localhost:27017`.

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file and edit the values
cp .env.example .env          # Windows (cmd): copy .env.example .env

# 3. Start the server
npm run dev                   # development, auto-restart with nodemon
# or
npm start                     # plain node
```

The API runs at `http://localhost:5000`. Check `http://localhost:5000/health`, which should return `{"status":"ok"}`.

### Option B: Run with Docker

**Prerequisites:** Docker with Docker Compose. You do not need Node.js or MongoDB installed.

```bash
# 1. Create your environment file and set JWT_SECRET
cp .env.example .env

# 2. Build and start the API and MongoDB
docker compose up --build

# Or in the background
docker compose up -d --build
```

The API runs at `http://localhost:5000`.

Notes:

- Compose starts two services: `api` (the app) and `mongo` (MongoDB 7, data stored in the `mongo_data` volume).
- Inside Docker, the database host is `mongo`, not `localhost`. `docker-compose.yml` overrides `MONGO_URI` for you, so the value in `.env` is only used for local runs.
- MongoDB's port is not published. To inspect it with Compass, add `ports: ["27017:27017"]` to the `mongo` service.

Useful commands:

```bash
docker compose logs -f api       # follow API logs
docker compose down              # stop (data is kept)
docker compose down -v           # stop and delete the database volume
```

## Environment variables

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | `development`, `production` or `test` | `development` |
| `PORT` | Port the server listens on | `5000` |
| `MONGO_URI` | MongoDB connection string (required) | `mongodb://localhost:27017/ecommerce` |
| `JWT_SECRET` | Secret used to sign tokens (required). Use a long random string | `change_me` |
| `JWT_EXPIRES_IN` | Token lifetime | `1d` |
| `TRUST_PROXY` | Set `true` only when running behind one reverse proxy or load balancer, so rate limiting sees real client IPs | `false` |

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Creating the first admin

Registration always creates a `customer`, so the first admin is created with a seed script. If the email already exists, that user is promoted to admin.

**Locally:**

```bash
# macOS / Linux
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=Admin@12345 npm run seed:admin

# Windows PowerShell
$env:ADMIN_EMAIL="admin@example.com"; $env:ADMIN_PASSWORD="Admin@12345"; npm run seed:admin
```

**With Docker:**

```bash
docker compose exec -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD=Admin@12345 api node scripts/seedAdmin.js
```

`ADMIN_NAME` is optional (default `Admin`). The password must be at least 8 characters.

## Running tests

Tests are integration tests that use a real MongoDB database named `ecommerce_test` (see `tests/setup.js`). It is dropped after each test file.

```bash
# MongoDB must be running on 127.0.0.1:27017
npm test
```

Jest prints an `ExperimentalWarning` about VM Modules. This is expected, because the project uses ES modules and Jest needs `--experimental-vm-modules`. Rate limiting is disabled when `NODE_ENV=test`.

The tests do not run inside the Docker image, because dev dependencies and the `tests` folder are excluded from it.

## API reference

Base URL: `http://localhost:5000/api`. Protected routes need the header `Authorization: Bearer <token>`.

### Auth and users

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a customer, returns token |
| POST | `/auth/login` | Public | Login, returns token |
| GET | `/users/me` | Any user | Get own profile |
| PATCH | `/users/me` | Any user | Update own name or email |
| GET | `/users?page=&limit=&role=&isActive=&search=` | Admin | List users |
| GET | `/users/:id` | Admin | Get one user |
| PATCH | `/users/:id/status` | Admin | Activate or deactivate a user |

### Categories

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/categories/tree` | Public | Full nested category tree (active only) |
| POST | `/categories` | Admin | Create a category (optional `parent`) |
| GET | `/categories?parent=&search=&isActive=&page=&limit=` | Admin | List categories. `parent=null` returns roots |
| GET | `/categories/:id` | Admin | Category with breadcrumb and children |
| PATCH | `/categories/:id` | Admin | Rename, move (`parent`, or `null` for root), activate or deactivate |
| DELETE | `/categories/:id` | Admin | Delete a category with no children and no products |

### Products

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/products?search=&category=&minPrice=&maxPrice=&sort=&page=&limit=` | Public | Customer listing (active and out-of-stock products) |
| GET | `/products/:id` | Public | Product details |
| GET | `/admin/products` | Admin | Same filters plus `status`, includes inactive products |
| GET | `/admin/products/:id` | Admin | Product details, any status |
| POST | `/products` | Admin | Create a product |
| PATCH | `/products/:id` | Admin | Update a product |
| DELETE | `/products/:id` | Admin | Delete a product |

Sort values: `newest`, `oldest`, `price_asc`, `price_desc`, `name_asc`, `name_desc`.

### Orders

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/orders` | Customer | Place an order |
| GET | `/orders/my?status=&page=&limit=` | Customer | List own orders |
| GET | `/orders/:id` | Customer (own) or Admin | Get one order |
| PATCH | `/orders/:id/cancel` | Customer (own, pending only) | Cancel an order |
| GET | `/admin/orders?status=&user=&page=&limit=` | Admin | List all orders |
| PATCH | `/admin/orders/:id/status` | Admin | Update order status |

### Sample requests

Register:

```json
POST /api/auth/register
{ "name": "Alice", "email": "alice@example.com", "password": "password123" }
```

Create a category (nested):

```json
POST /api/categories
{ "name": "Android Phones", "parent": "<mobilesCategoryId>" }
```

Create a product:

```json
POST /api/products
{
  "name": "Galaxy S",
  "sku": "GAL-S-001",
  "description": "Flagship phone",
  "price": 1000,
  "salePrice": 800,
  "stock": 25,
  "category": "<categoryId>"
}
```

Place an order (only product and quantity are accepted, prices come from the server):

```json
POST /api/orders
{ "items": [{ "product": "<productId>", "quantity": 2 }] }
```

## Response and error format

Success:

```json
{ "success": true, "message": "Optional message", "data": { } }
```

Lists add a pagination object:

```json
{ "success": true, "data": [ ], "pagination": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 } }
```

Errors:

```json
{ "success": false, "message": "Validation error", "errors": [ { "field": "password", "message": "..." } ] }
```

| Status | Meaning |
|---|---|
| 200 / 201 | Success / created |
| 400 | Validation error or invalid operation |
| 401 | Missing, invalid or expired token, or wrong credentials |
| 403 | Insufficient role or deactivated account |
| 404 | Resource or route not found |
| 409 | Conflict (duplicate value, insufficient stock, invalid state) |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error |

## Design decisions

**Multi-level categories.** Each category stores its `parent` and an `ancestors` array (the path from the root to the direct parent). This gives:
- Circular-relationship prevention: a category cannot become its own parent or move under any of its descendants.
- Fast subtree queries: `find({ ancestors: id })` returns all descendants with one indexed query.
- Parent-category product filtering: products are matched with `category: { $in: [id, ...descendantIds] }`.
- The tree endpoint loads categories in one query and builds the tree in memory, so any depth works without recursive database calls.
- Moving a category rewrites `ancestors` for its whole subtree. Deactivating a category deactivates its subtree.

**Product pricing.** Products have a stored `finalPrice` (the sale price if set, otherwise the price). Price filtering and sorting use it, so they can use an index and reflect what the customer pays. A sale price can never exceed the price.

**Orders and stock.**
- Stock is reserved with an atomic conditional update (`findOneAndUpdate` with `stock: { $gte: qty }` and `$inc`), so two customers cannot buy the last item.
- If any line fails or the order cannot be saved, stock already reserved is released.
- Each order item stores a snapshot of name, SKU and price, so later product changes do not affect old orders.
- Status flow: `pending -> confirmed -> processing -> shipped -> delivered`. Cancelling is allowed from pending, confirmed and processing, and restocks the items. Status changes use compare-and-set, so a double cancel cannot restock twice.
- Other customers' orders return 404, so order IDs cannot be probed.
- MongoDB transactions need a replica set, so atomic updates are used to work on a standalone MongoDB. Transactions are the upgrade path.

## Security

- Passwords hashed with bcrypt (12 rounds), never returned in responses.
- JWT authentication. Deactivated users are blocked immediately, even with a valid token.
- Role-based authorization (`admin`, `customer`). The role cannot be set by the client.
- Zod validation on body, query and params. Strict schemas reject unknown fields, such as client-supplied prices.
- `helmet` security headers and a 10 KB JSON body limit.
- Rate limiting (per IP): 300 requests / 15 min on all `/api` routes, 10 failed logins / 15 min, 5 registrations / hour. `/health` is not limited.
- Secrets are loaded from environment variables. `.env` is git-ignored and excluded from the Docker image.
- The Docker image runs as a non-root user.

## Known limitations and future improvements

- Rate limit counters are in memory. For multiple instances, use a Redis store (`rate-limit-redis`).
- Stock handling can leave reserved stock behind if the server crashes mid-order. MongoDB transactions on a replica set would close this gap.
- Product search uses a case-insensitive regex. A MongoDB text index or a search service would scale better for large catalogs.
- No refresh tokens, email verification or password reset.
- Request logging is not implemented yet.

## API documentation

A Postman collection covering every endpoint is included at [`docs/ecom.postman_collection.json`](docs/ecom.postman_collection.json).

1. In Postman, choose **Import** and select the file.
2. Start the API and create an admin (see [Creating the first admin](#creating-the-first-admin)).
3. Run the requests from top to bottom (Auth, Users, Categories, Products, Orders), or use the Collection Runner. Tokens and IDs are saved automatically into collection variables, and each request checks its expected status code.

The collection variables `baseUrl`, `adminEmail` and `adminPassword` can be changed to match your setup. The default `baseUrl` is `http://localhost:5000`.
