/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Main Server Entry Point
   File: backend/server.js
   Version: 2.0 — Fixed
   Run: npm run dev
═══════════════════════════════════════════════════════════ */

/* ── Load environment variables FIRST ────────────────────── */
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');

/* ── Connect to MongoDB ───────────────────────────────────── */
connectDB();

/* ── Create Express App ───────────────────────────────────── */
const app = express();

/* ══════════════════════════════════════════════════════════
   MIDDLEWARE STACK
   Every request passes through these in order
══════════════════════════════════════════════════════════ */

/* 1. Security headers */
app.use(helmet());

/* 2. CORS — allow frontend to talk to this backend */
app.use(cors({
  origin : [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://YOUR-FRONTEND-NAME.vercel.app',  // ← replace after deploying to Vercel
  ],
  credentials    : true,
  methods        : ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders : ['Content-Type','Authorization'],
}));

/* 3. Rate limiting — prevent abuse (100 requests per 15 min) */
const limiter = rateLimit({
  windowMs        : 15 * 60 * 1000,
  max             : 100,
  standardHeaders : true,
  legacyHeaders   : false,
  message         : {
    success : false,
    message : 'Too many requests. Please try again in 15 minutes.',
  },
});

app.use('/api/', limiter);

/* Stricter limit for login — 5 attempts per 15 min */
const loginLimiter = rateLimit({
  windowMs        : 15 * 60 * 1000,
  max             : 5,
  standardHeaders : true,
  legacyHeaders   : false,
  message         : {
    success   : false,
    message   : 'Too many login attempts. Try again in 15 minutes.',
    errorCode : 'TOO_MANY_ATTEMPTS',
  },
});

/* 4. Parse JSON request bodies */
app.use(express.json({ limit: '10mb' }));

/* 5. Parse URL-encoded bodies */
app.use(express.urlencoded({ extended: true }));

/* ══════════════════════════════════════════════════════════
   REQUEST LOGGER (development only)
══════════════════════════════════════════════════════════ */
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    const time = new Date().toLocaleTimeString('en-KE');
    console.log(`[${time}]  ${req.method.padEnd(7)} ${req.url}`);
    next();
  });
}

/* ══════════════════════════════════════════════════════════
   ROUTES
══════════════════════════════════════════════════════════ */

/* ── Health check ─────────────────────────────────────────── */
app.get('/', (req, res) => {
  res.json({
    success : true,
    message : '🎓 Scholar Analytics API is running',
    version : '1.0.0',
    system  : 'CBC Kenya — KJSEA Grading',
    support : process.env.SUPPORT_EMAIL || 'dankibe1998@gmail.com',
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success   : true,
    status    : 'healthy',
    timestamp : new Date().toISOString(),
    uptime    : `${Math.floor(process.uptime())} seconds`,
    database  : 'connected',
  });
});

/* ── Auth routes ──────────────────────────────────────────── */
app.use('/api/auth', loginLimiter, require('./routes/authRoutes'));

/* ── Student routes ───────────────────────────────────────── */
app.use('/api/students', require('./routes/studentRoutes'));

/* ── Class routes ─────────────────────────────────────────── */
app.use('/api/classes', require('./routes/classRoutes'));

/* ── Subject routes ───────────────────────────────────────── */
app.use('/api/subjects', require('./routes/subjectRoutes'));

/* ── Exam routes ──────────────────────────────────────────── */
app.use('/api/exams', require('./routes/examRoutes'));

/* ── Marks routes ─────────────────────────────────────────── */
// app.use('/api/marks', require('./routes/marksRoutes'));

/* ── Results routes ───────────────────────────────────────── */
app.use('/api/results', require('./routes/resultsRoutes'));

/* ── Reports routes ───────────────────────────────────────── */
// app.use('/api/reports', require('./routes/reportRoutes'));

/* ── Settings routes ──────────────────────────────────────── */
// app.use('/api/settings', require('./routes/settingsRoutes'));

app.use('/api/superadmin', require('./routes/superAdminRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));

/* ══════════════════════════════════════════════════════════
   404 HANDLER — catches any unknown route
   NOTE: No wildcard '*' — fixed for Express v5+
══════════════════════════════════════════════════════════ */
app.use((req, res) => {
  res.status(404).json({
    success : false,
    message : `Route ${req.originalUrl} not found on Scholar Analytics API`,
  });
});

/* ══════════════════════════════════════════════════════════
   GLOBAL ERROR HANDLER
   Catches ALL errors thrown anywhere in the app
══════════════════════════════════════════════════════════ */
app.use((err, req, res, next) => {

  console.error('─── Error ───────────────────────────────');
  console.error('Message:', err.message);
  console.error('─────────────────────────────────────────');

  /* Mongoose validation error */
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors)
      .map(e => e.message);
    return res.status(400).json({
      success : false,
      message : messages[0],
      errors  : messages,
    });
  }

  /* Mongoose duplicate key error (e.g. duplicate UPI) */
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success : false,
      message : `${field} already exists. Please use a different value.`,
    });
  }

  /* JWT invalid token */
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success : false,
      message : 'Invalid token. Please log in again.',
    });
  }

  /* JWT expired token */
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success   : false,
      message   : 'Session expired. Please log in again.',
      errorCode : 'TOKEN_EXPIRED',
    });
  }

  /* Mongoose bad ObjectId */
  if (err.name === 'CastError') {
    return res.status(400).json({
      success : false,
      message : `Invalid ID format: ${err.value}`,
    });
  }

  /* School locked error */
  if (err.code === 'SCHOOL_LOCKED') {
    return res.status(403).json({
      success    : false,
      message    : err.message,
      errorCode  : 'SCHOOL_LOCKED',
      lockReason : err.lockReason || 'Account suspended',
    });
  }

  /* School subscription expired */
  if (err.code === 'SUBSCRIPTION_EXPIRED') {
    return res.status(403).json({
      success   : false,
      message   : err.message,
      errorCode : 'SUBSCRIPTION_EXPIRED',
    });
  }

  /* Default — internal server error */
  res.status(err.statusCode || 500).json({
    success   : false,
    message   : err.message || 'Internal server error',
    errorCode : err.code    || null,
  });

});

/* ══════════════════════════════════════════════════════════
   START SERVER
══════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║         SCHOLAR ANALYTICS API                ║
╠══════════════════════════════════════════════╣
║  Status  : Running ✅                        ║
║  Port    : ${PORT}                              ║
║  Mode    : ${(process.env.NODE_ENV || 'development').padEnd(32)}║
║  URL     : http://localhost:${PORT}              ║
║  Support : dankibe1998@gmail.com             ║
╚══════════════════════════════════════════════╝
  `);
});

/* Handle unhandled promise rejections */
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

/* Handle uncaught exceptions */
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});