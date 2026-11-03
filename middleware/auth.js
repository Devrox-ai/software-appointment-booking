/**
 * CSRF validation middleware.
 * Compares the _csrf field in the request body against the session token.
 */
function verifyCsrf(req, res, next) {
  const token = req.body._csrf;
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).render('error', {
      title: 'Forbidden',
      message: 'Invalid or missing security token. Please try again.',
      statusCode: 403
    });
  }
  next();
}

/**
 * Admin authentication guard.
 * Redirects to admin login if no active admin session.
 */
function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  next();
}

module.exports = { verifyCsrf, requireAdmin };
