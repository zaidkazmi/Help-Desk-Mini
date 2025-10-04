const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const idempotency = require('./middleware/idempotency');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting: 60 requests per minute per user
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Idempotency middleware
app.use(idempotency);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tickets', require('./routes/tickets'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Metadata
app.get('/api/_meta', (req, res) => {
  res.json({
    version: '1.0.0',
    description: 'HelpDesk Mini API',
    endpoints: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/tickets',
      'GET /api/tickets',
      'GET /api/tickets/:id',
      'PATCH /api/tickets/:id',
      'POST /api/tickets/:id/comments',
      'GET /api/health',
      'GET /api/_meta'
    ]
  });
});

// Hackathon manifest
app.get('/.well-known/hackathon.json', (req, res) => {
  res.json({
    name: 'HelpDesk Mini',
    description: 'Smart Ticketing System with SLA and Comment Threads',
    version: '1.0.0',
    api: {
      base_url: 'http://localhost:3000/api',
      endpoints: [
        { method: 'POST', path: '/auth/register' },
        { method: 'POST', path: '/auth/login' },
        { method: 'POST', path: '/tickets' },
        { method: 'GET', path: '/tickets' },
        { method: 'GET', path: '/tickets/:id' },
        { method: 'PATCH', path: '/tickets/:id' },
        { method: 'POST', path: '/tickets/:id/comments' }
      ]
    },
    features: [
      'JWT Authentication',
      'Role-based Access Control',
      'SLA Tracking',
      'Threaded Comments',
      'Audit Logs',
      'Pagination',
      'Idempotency',
      'Rate Limiting',
      'Optimistic Locking'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});