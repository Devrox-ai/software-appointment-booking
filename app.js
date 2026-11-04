/**
 * Software Appointment Booking System — Main Application Entry Point
 * 
 * Express server with EJS templating, MongoDB native driver,
 * session-based admin auth, and Nodemailer email service.
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const { connectDB, getDB } = require('./config/database');
const { getSettings } = require('./config/settings');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── View engine ────────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Simple CSRF-like token (per-session nonce)
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = require('crypto').randomBytes(24).toString('hex');
  }
  next();
});

// ─── Locals available in every EJS template ─────────────────────────────────────
app.use(async (req, res, next) => {
  try {
    const db = getDB();
    const settings = await getSettings(db);
    res.locals.settings = settings;
    res.locals.currentPath = req.path;
    res.locals.admin = req.session.admin || null;
    res.locals.csrfToken = req.session.csrfToken;
  } catch (err) {
    // If DB is not ready yet, provide defaults
    res.locals.settings = {
      companyName: 'TechNova Solutions',
      companyEmail: 'info@technova.com',
      companyPhone: '+91 98765 43210',
      companyAddress: 'Pune, Maharashtra, India'
    };
    res.locals.currentPath = req.path;
    res.locals.admin = null;
    res.locals.csrfToken = req.session ? req.session.csrfToken : '';
  }
  next();
});

// ─── Routes ─────────────────────────────────────────────────────────────────────
const publicRoutes = require('./routes/public');
const bookingRoutes = require('./routes/booking');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

app.use('/', publicRoutes);
app.use('/', bookingRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// ─── 404 handler ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'Page Not Found',
    statusCode: 404
  });
});

// ─── Global error handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).render('error', {
    title: 'Error',
    message: err.message || 'Something went wrong',
    statusCode: err.status || 500
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log(`\n  ✔ Server running at http://localhost:${PORT}\n`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n================================================================`);
        console.error(`  ✘ [Port Conflict] Port ${PORT} is already in use by another process.`);
        console.error(`    To free port ${PORT}, close any existing terminal running the server, or run:`);
        console.error(`    npx kill-port ${PORT}`);
        console.error(`    Alternatively, set PORT=3001 in your .env file.`);
        console.error(`================================================================\n`);
        process.exit(1);
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;
