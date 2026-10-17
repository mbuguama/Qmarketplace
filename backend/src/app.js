const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const contactRoutes = require('./routes/contact');
const publicRoutes = require('./routes/public');
const userRoutes = require('./routes/users');
const checkoutRoutes = require('./routes/checkout');
const adminRoutes = require('./routes/admin');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { getPublicSiteOrigins } = require('./utils/siteUrl');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'https:', 'data:'],
      connectSrc: ["'self'", 'https:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", 'https://www.sandbox.paypal.com', 'https://www.paypal.com'],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const allowedOrigins = new Set([
  ...getPublicSiteOrigins(),
  'http://localhost:4000',
  'http://127.0.0.1:4000'
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('This origin is not allowed to access the API.'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: 'QMarketplace API',
    timestamp: new Date().toISOString()
  });
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many authentication requests. Please try again later.' }
});
app.use('/api/auth', authLimiter);
app.use('/api/checkout', rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many checkout requests. Please wait and try again.' }
}));
app.use('/api/contact', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many contact submissions. Please try again later.' }
}));

app.use('/api/auth', authRoutes);
app.use('/api/contact', contactRoutes);
app.get(['/robots.txt', '/api/robots.txt'], publicRoutes.getRobotsTxtHandler);
app.get(['/sitemap.xml', '/api/sitemap.xml'], publicRoutes.getSitemapXmlHandler);
app.use('/api', publicRoutes);
app.use('/api/users', userRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/admin', adminRoutes);

const frontendPath = path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(frontendPath, 'home.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(frontendPath, 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(frontendPath, 'register.html'));
});

app.get('/materials', (req, res) => {
  res.sendFile(path.join(frontendPath, 'materials.html'));
});

app.get('/universities', (req, res) => {
  res.sendFile(path.join(frontendPath, 'universities.html'));
});

app.get('/checkout', (req, res) => {
  res.sendFile(path.join(frontendPath, 'checkout.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(frontendPath, 'profile.html'));
});

app.get('/orders', (req, res) => {
  res.sendFile(path.join(frontendPath, 'orders.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin', 'dashboard.html'));
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
