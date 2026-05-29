require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const errorHandler = require('./middleware/errorHandler');

// ── Route imports ───────────────────────────────────────────
const authRoutes           = require('./routes/auth');
const userRoutes           = require('./routes/user');
const addressRoutes        = require('./routes/address');
const paymentMethodRoutes  = require('./routes/paymentMethods');
const cartRoutes           = require('./routes/cart');
const wishlistRoutes       = require('./routes/wishlist');
const productRoutes        = require('./routes/products');
const orderRoutes          = require('./routes/orders');
const paymentRoutes        = require('./routes/payments');

// Admin routes
const adminAuthRoutes      = require('./routes/admin/auth');
const adminUserRoutes      = require('./routes/admin/users');
const adminProductRoutes   = require('./routes/admin/products');
const adminPromoRoutes     = require('./routes/admin/promocodes');
const adminOrderRoutes     = require('./routes/admin/orders');
const adminAnalyticsRoutes = require('./routes/admin/analytics');
const adminSettingsRoutes  = require('./routes/admin/settings');
const settingsRoutes       = require('./routes/settings');

const app = express();

// ── Security headers ────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// ── CORS ────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '*')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow if same-origin or no origin (e.g. server-to-server, postman)
    if (!origin) return cb(null, true);
    
    // Check if matching configured origins
    if (allowedOrigins.includes(origin)) return cb(null, true);
    
    // Infallible fallback for production domains to prevent Hostinger env-loading issues
    const url = new URL(origin);
    if (url.hostname === 'kalyraa.com' || url.hostname === 'www.kalyraa.com' || url.hostname.endsWith('.kalyraa.com')) {
      return cb(null, true);
    }
    
    // Local dev fallbacks
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return cb(null, true);
    }

    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── Request parsing ─────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logging ─────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));
}

// ── Static uploads ──────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Health check ────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  const db = require('./db/init').getDb();
  let dbStatus = 'ok';
  try {
    db.prepare('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }
  res.json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    db: dbStatus,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ── Customer API Routes ───────────────────────────────────
const v1 = '/api/v1';
app.use(`${v1}/auth`,            authRoutes);
app.use(`${v1}/user`,            userRoutes);
app.use(`${v1}/user/addresses`,  addressRoutes);
app.use(`${v1}/user/payment-methods`, paymentMethodRoutes);
app.use(`${v1}/cart`,            cartRoutes);
app.use(`${v1}/wishlist`,        wishlistRoutes);
app.use(`${v1}/products`,        productRoutes);
app.use(`${v1}/orders`,          orderRoutes);
app.use(`${v1}/payments`,        paymentRoutes);

// ── Admin API Routes ─────────────────────────────────────
const adm = '/api/v1/admin';
app.use(`${adm}/auth`,           adminAuthRoutes);
app.use(`${adm}/users`,          adminUserRoutes);
app.use(`${adm}/products`,       adminProductRoutes);
app.use(`${adm}/promocodes`,     adminPromoRoutes);
app.use(`${adm}/orders`,         adminOrderRoutes);
app.use(`${adm}/analytics`,      adminAnalyticsRoutes);
app.use(`${adm}/settings`,       adminSettingsRoutes);
app.use(`${v1}/settings`,        settingsRoutes);

// ── 404 handler ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ─────────────────────────────────
app.use(errorHandler);

module.exports = app;
