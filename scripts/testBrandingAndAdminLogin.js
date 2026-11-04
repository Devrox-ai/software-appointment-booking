const http = require('http');
const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');
const { connectDB, getDB } = require('../config/database');
const { getSettings } = require('../config/settings');
const adminRoutes = require('../routes/admin');
const bookingRoutes = require('../routes/booking');
const publicRoutes = require('../routes/public');

async function testBrandingAndAdmin() {
  console.log('================================================================');
  console.log('   VERIFYING BRANDING, FAVICON & ADMIN LOGIN CARD DESIGN        ');
  console.log('================================================================\n');

  await connectDB();
  const db = getDB();

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(session({
    secret: 'test-branding-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 }
  }));

  app.use((req, res, next) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = 'test-token-12345';
    }
    next();
  });

  app.use(async (req, res, next) => {
    try {
      const settings = await getSettings(db);
      res.locals.settings = settings;
      res.locals.currentPath = req.path;
      res.locals.admin = req.session.admin || null;
      res.locals.csrfToken = req.session.csrfToken;
    } catch (err) {
      res.locals.settings = { companyName: 'TechNova Solutions' };
      res.locals.currentPath = req.path;
      res.locals.admin = null;
      res.locals.csrfToken = '';
    }
    next();
  });

  app.use('/', publicRoutes);
  app.use('/', bookingRoutes);
  app.use('/admin', adminRoutes);

  const server = http.createServer(app);
  await new Promise(r => server.listen(3099, r));
  console.log('  ✔ Test server running on port 3099\n');

  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✔ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ✖ FAIL: ${msg}`);
      failed++;
    }
  }

  function fetchUrl(urlPath, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(`http://localhost:3099${urlPath}`, options, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  try {
    // 1. Verify Favicon ICO
    const icoRes = await fetchUrl('/favicon.ico');
    assert(icoRes.status === 200, 'GET /favicon.ico returns HTTP 200');
    assert(icoRes.headers['content-type']?.includes('image/x-icon') || icoRes.headers['content-type']?.includes('vnd.microsoft.icon'), 'GET /favicon.ico Content-Type is image/x-icon');

    // 2. Verify Favicon SVG
    const svgRes = await fetchUrl('/favicon.svg');
    assert(svgRes.status === 200, 'GET /favicon.svg returns HTTP 200');
    assert(svgRes.headers['content-type']?.includes('image/svg+xml'), 'GET /favicon.svg Content-Type is image/svg+xml');
    assert(svgRes.body.includes('linearGradient') && svgRes.body.includes('0f172a'), 'Favicon SVG contains deep navy and royal blue tech gradient');

    // 3. Verify Logo Icon SVG & Full Logo SVG
    const logoIconRes = await fetchUrl('/images/logo-icon.svg');
    assert(logoIconRes.status === 200, 'GET /images/logo-icon.svg returns HTTP 200');
    assert(logoIconRes.body.includes('<svg'), 'logo-icon.svg is a valid SVG document');

    const fullLogoRes = await fetchUrl('/images/logo.svg');
    assert(fullLogoRes.status === 200, 'GET /images/logo.svg returns HTTP 200');
    assert(fullLogoRes.body.includes('Tech') && fullLogoRes.body.includes('Nova'), 'logo.svg contains TechNova typography');

    // 4. Verify Home page branding & removal of trophy
    const homeRes = await fetchUrl('/');
    assert(homeRes.status === 200, 'GET / returns HTTP 200');
    assert(!homeRes.body.includes('127942'), 'No sports/gaming trophy (&#127942;) found on home page');
    assert(homeRes.body.includes('/favicon.svg?v=2'), 'Home page links to SVG favicon');
    assert(homeRes.body.includes('nav-brand-logo'), 'Home page displays TechNova Solutions logo in header navbar');
    assert(homeRes.body.includes('footer-brand-logo'), 'Home page displays TechNova Solutions logo in footer');

    // 5. Verify Admin Login page
    const loginRes = await fetchUrl('/admin/login');
    assert(loginRes.status === 200, 'GET /admin/login returns HTTP 200');
    assert(loginRes.body.includes('admin-login-wrapper'), 'Admin login page has centered wrapper (.admin-login-wrapper)');
    assert(loginRes.body.includes('admin-login-card'), 'Admin login page uses card component (.admin-login-card)');
    assert(loginRes.body.includes('login-brand-icon'), 'Admin login page includes TechNova brand logo icon');
    assert(loginRes.body.includes('Admin Login'), 'Admin login page has "Admin Login" title');
    assert(loginRes.body.includes('id="togglePasswordBtn"'), 'Admin login page has password show/hide toggle button');
    assert(loginRes.body.includes('/favicon.svg?v=2'), 'Admin login page links to professional favicon');

    // 6. Verify Admin Dashboard page structure & branding
    const dashRes = await fetchUrl('/admin/dashboard');
    assert(dashRes.status === 302, 'GET /admin/dashboard redirects unauthenticated users (HTTP 302)');

    // 7. Verify CSS rules
    const adminCssRes = await fetchUrl('/css/admin.css');
    assert(adminCssRes.body.includes('.admin-login-card'), 'admin.css contains .admin-login-card styles');
    assert(adminCssRes.body.includes('max-width: 440px'), 'admin.css constrains login card max-width (440px centered, not full-width)');
    assert(adminCssRes.body.includes('.password-toggle-btn'), 'admin.css contains .password-toggle-btn styles');
    assert(adminCssRes.body.includes('.sidebar-brand-icon'), 'admin.css contains .sidebar-brand-icon styles');

    console.log(`\n================================================================`);
    console.log(`   BRANDING & ADMIN LOGIN TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
    console.log(`================================================================\n`);

  } finally {
    server.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

testBrandingAndAdmin().catch(err => {
  console.error(err);
  process.exit(1);
});
