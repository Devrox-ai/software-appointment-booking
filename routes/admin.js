/**
 * Admin Routes — Login, Dashboard, Bookings CRUD, Services, Settings, Calendar
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/database');
const { getSettings, updateSetting } = require('../config/settings');
const { verifyCsrf, requireAdmin } = require('../middleware/auth');
const emailService = require('../services/emailService');

// ─── Login ──────────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin/dashboard');
  res.render('admin/login', { title: 'Admin Login', error: null });
});

router.post('/login', verifyCsrf, async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = getDB();
    const admin = await db.collection('admins').findOne({ email: email?.trim().toLowerCase() });

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.render('admin/login', {
        title: 'Admin Login',
        error: 'Invalid email or password.'
      });
    }

    req.session.admin = { id: admin._id.toString(), email: admin.email };
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    res.render('admin/login', { title: 'Admin Login', error: 'Something went wrong.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ─── Dashboard ──────────────────────────────────────────────────────────────────
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const col = db.collection('appointments');

    const [total, pending, accepted, rejected, cancelled] = await Promise.all([
      col.countDocuments(),
      col.countDocuments({ status: 'pending' }),
      col.countDocuments({ status: 'accepted' }),
      col.countDocuments({ status: 'rejected' }),
      col.countDocuments({ status: 'cancelled' })
    ]);

    const today = new Date().toISOString().split('T')[0];
    const todayBookings = await col.find({ appointmentDate: today })
      .sort({ appointmentTime: 1 }).toArray();
    const upcomingBookings = await col.find({
      appointmentDate: { $gte: today },
      status: { $in: ['pending', 'accepted'] }
    }).sort({ appointmentDate: 1, appointmentTime: 1 }).limit(8).toArray();
    const recentBookings = await col.find()
      .sort({ createdAt: -1 }).limit(10).toArray();

    // Populate services
    await populateServices(db, todayBookings);
    await populateServices(db, upcomingBookings);
    await populateServices(db, recentBookings);

    res.render('admin/dashboard', {
      title: 'Dashboard',
      stats: { total, pending, accepted, rejected, cancelled },
      todayBookings,
      upcomingBookings,
      recentBookings
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.render('admin/dashboard', {
      title: 'Dashboard',
      stats: { total: 0, pending: 0, accepted: 0, rejected: 0, cancelled: 0 },
      todayBookings: [],
      upcomingBookings: [],
      recentBookings: []
    });
  }
});

// ─── Bookings List ──────────────────────────────────────────────────────────────
router.get('/bookings', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const status = req.query.status;
    const search = (req.query.search || '').trim();
    const page = parseInt(req.query.page) || 1;
    const limit = 15;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status && ['pending', 'accepted', 'rejected', 'cancelled'].includes(status)) {
      filter.status = status;
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [
        { customerName: regex },
        { customerEmail: regex },
        { customerPhone: regex },
        { bookingId: regex }
      ];
    }

    const [bookings, totalCount] = await Promise.all([
      db.collection('appointments').find(filter)
        .sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('appointments').countDocuments(filter)
    ]);

    await populateServices(db, bookings);

    res.render('admin/bookings', {
      title: status ? `${status.charAt(0).toUpperCase() + status.slice(1)} Bookings` : 'All Bookings',
      bookings,
      currentFilter: status || 'all',
      searchQuery: search,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit) || 1,
        total: totalCount
      }
    });
  } catch (err) {
    console.error('Bookings list error:', err);
    res.render('admin/bookings', {
      title: 'Bookings',
      bookings: [],
      currentFilter: 'all',
      searchQuery: '',
      pagination: { currentPage: 1, totalPages: 1, total: 0 }
    });
  }
});

// ─── Booking Detail ─────────────────────────────────────────────────────────────
router.get('/bookings/:id', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const booking = await db.collection('appointments').findOne({ _id: new ObjectId(req.params.id) });
    if (!booking) {
      return res.status(404).render('error', {
        title: 'Not Found', message: 'Booking not found.', statusCode: 404
      });
    }
    await populateServices(db, [booking]);

    // Fetch email dispatch logs for this specific booking
    const emailLogs = await db.collection('email_logs')
      .find({ bookingId: String(booking.bookingId) })
      .sort({ sentAt: -1 })
      .toArray();

    res.render('admin/booking-detail', {
      title: `Booking SAB-${booking.bookingId}`,
      booking,
      emailLogs
    });
  } catch (err) {
    console.error('Booking detail error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Server error.', statusCode: 500 });
  }
});

// ─── Accept Booking ─────────────────────────────────────────────────────────────
router.post('/bookings/:id/accept', requireAdmin, verifyCsrf, async (req, res) => {
  try {
    const db = getDB();
    
    // Atomic status transition: only match if currently 'pending' to prevent duplicate emails
    const result = await db.collection('appointments').findOneAndUpdate(
      { _id: new ObjectId(req.params.id), status: 'pending' },
      { $set: { status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    const updatedBooking = result && (result.value || result);
    if (updatedBooking && (updatedBooking.status === 'accepted' || updatedBooking.acknowledged)) {
      const fullBooking = await db.collection('appointments').findOne({ _id: new ObjectId(req.params.id) });
      const service = await db.collection('services').findOne({ _id: fullBooking.serviceId });
      
      emailService.sendBookingAccepted(fullBooking, service?.name || 'Software Consultation')
        .then(emailRes => {
          if (emailRes && emailRes.success) {
            console.log(`✔ Acceptance email sent to ${fullBooking.customerEmail}`);
          } else {
            console.warn(`⚠ Acceptance email failed: ${emailRes?.error}`);
          }
        })
        .catch(emailErr => console.error('Acceptance email dispatch error:', emailErr));
    }

    res.redirect(`/admin/bookings/${req.params.id}`);
  } catch (err) {
    console.error('Accept error:', err);
    res.redirect('/admin/bookings');
  }
});

// ─── Reject Booking ─────────────────────────────────────────────────────────────
router.post('/bookings/:id/reject', requireAdmin, verifyCsrf, async (req, res) => {
  try {
    const db = getDB();
    const reason = (req.body.reason || 'Slot unavailable due to schedule conflicts.').trim();

    // Atomic status transition: only match if currently 'pending'
    const result = await db.collection('appointments').findOneAndUpdate(
      { _id: new ObjectId(req.params.id), status: 'pending' },
      { $set: { status: 'rejected', rejectionReason: reason, rejectedAt: new Date(), updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    const updatedBooking = result && (result.value || result);
    if (updatedBooking) {
      const fullBooking = await db.collection('appointments').findOne({ _id: new ObjectId(req.params.id) });
      const service = await db.collection('services').findOne({ _id: fullBooking.serviceId });

      emailService.sendBookingRejected(fullBooking, service?.name || 'Software Consultation', reason)
        .then(emailRes => {
          if (emailRes && emailRes.success) {
            console.log(`✔ Rejection notice sent to ${fullBooking.customerEmail}`);
          } else {
            console.warn(`⚠ Rejection email failed: ${emailRes?.error}`);
          }
        })
        .catch(emailErr => console.error('Rejection email dispatch error:', emailErr));
    }

    res.redirect(`/admin/bookings/${req.params.id}`);
  } catch (err) {
    console.error('Reject error:', err);
    res.redirect('/admin/bookings');
  }
});

// ─── Cancel Booking ─────────────────────────────────────────────────────────────
router.post('/bookings/:id/cancel', requireAdmin, verifyCsrf, async (req, res) => {
  try {
    const db = getDB();
    const reason = (req.body.reason || 'Cancelled by administration.').trim();

    // Atomic status transition: only match if currently 'accepted'
    const result = await db.collection('appointments').findOneAndUpdate(
      { _id: new ObjectId(req.params.id), status: 'accepted' },
      { $set: { status: 'cancelled', cancellationReason: reason, cancelledAt: new Date(), updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    const updatedBooking = result && (result.value || result);
    if (updatedBooking) {
      const fullBooking = await db.collection('appointments').findOne({ _id: new ObjectId(req.params.id) });
      const service = await db.collection('services').findOne({ _id: fullBooking.serviceId });

      emailService.sendBookingCancelled(fullBooking, service?.name || 'Software Consultation', reason)
        .then(emailRes => {
          if (emailRes && emailRes.success) {
            console.log(`✔ Cancellation notice sent to ${fullBooking.customerEmail}`);
          } else {
            console.warn(`⚠ Cancellation email failed: ${emailRes?.error}`);
          }
        })
        .catch(emailErr => console.error('Cancellation email dispatch error:', emailErr));
    }

    res.redirect(`/admin/bookings/${req.params.id}`);
  } catch (err) {
    console.error('Cancel error:', err);
    res.redirect('/admin/bookings');
  }
});

// ─── Calendar ───────────────────────────────────────────────────────────────────
router.get('/calendar', requireAdmin, (req, res) => {
  res.render('admin/calendar', { title: 'Calendar' });
});

// ─── Blocked Dates ──────────────────────────────────────────────────────────────
router.get('/blocked-dates', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const blockedDates = await db.collection('blocked_dates').find().sort({ date: 1 }).toArray();
    res.render('admin/blocked-dates', { title: 'Blocked Dates', blockedDates });
  } catch (err) {
    res.render('admin/blocked-dates', { title: 'Blocked Dates', blockedDates: [] });
  }
});

router.post('/block-date', requireAdmin, verifyCsrf, async (req, res) => {
  try {
    const db = getDB();
    const { date, reason } = req.body;
    if (!date) return res.redirect('/admin/blocked-dates');
    await db.collection('blocked_dates').updateOne(
      { date },
      { $set: { date, reason: reason || '', createdAt: new Date() } },
      { upsert: true }
    );
    res.redirect('/admin/blocked-dates');
  } catch (err) {
    console.error('Block date error:', err);
    res.redirect('/admin/blocked-dates');
  }
});

router.post('/unblock-date', requireAdmin, verifyCsrf, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('blocked_dates').deleteOne({ date: req.body.date });
    // Redirect back to referrer to support both blocked-dates page and calendar
    const referer = req.get('Referer') || '/admin/blocked-dates';
    res.redirect(referer);
  } catch (err) {
    console.error('Unblock error:', err);
    res.redirect('/admin/blocked-dates');
  }
});

// ─── Services ───────────────────────────────────────────────────────────────────
router.get('/services', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const services = await db.collection('services').find().sort({ order: 1 }).toArray();
    res.render('admin/services', { title: 'Services', services });
  } catch (err) {
    res.render('admin/services', { title: 'Services', services: [] });
  }
});

router.post('/services', requireAdmin, verifyCsrf, async (req, res) => {
  try {
    const db = getDB();
    const { name, description, icon } = req.body;
    if (!name || !description) return res.redirect('/admin/services');
    const count = await db.collection('services').countDocuments();
    await db.collection('services').insertOne({
      name: name.trim(),
      description: description.trim(),
      icon: icon || '💼',
      isActive: true,
      order: count + 1,
      createdAt: new Date()
    });
    res.redirect('/admin/services');
  } catch (err) {
    console.error('Add service error:', err);
    res.redirect('/admin/services');
  }
});

router.post('/services/:id', requireAdmin, verifyCsrf, async (req, res) => {
  try {
    const db = getDB();
    const { name, description, icon } = req.body;
    await db.collection('services').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { name: name.trim(), description: description.trim(), icon: icon || '💼', updatedAt: new Date() } }
    );
    res.redirect('/admin/services');
  } catch (err) {
    console.error('Update service error:', err);
    res.redirect('/admin/services');
  }
});

router.post('/services/:id/toggle', requireAdmin, verifyCsrf, async (req, res) => {
  try {
    const db = getDB();
    const service = await db.collection('services').findOne({ _id: new ObjectId(req.params.id) });
    if (service) {
      await db.collection('services').updateOne(
        { _id: service._id },
        { $set: { isActive: service.isActive === false ? true : false, updatedAt: new Date() } }
      );
    }
    res.redirect('/admin/services');
  } catch (err) {
    console.error('Toggle service error:', err);
    res.redirect('/admin/services');
  }
});

// ─── Settings ───────────────────────────────────────────────────────────────────
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const currentSettings = await getSettings(db);
    res.render('admin/settings', {
      title: 'Settings', currentSettings,
      success: req.query.success ? 'Settings saved successfully!' : null,
      error: null
    });
  } catch (err) {
    res.render('admin/settings', {
      title: 'Settings',
      currentSettings: {},
      success: null,
      error: 'Failed to load settings.'
    });
  }
});

router.post('/settings', requireAdmin, verifyCsrf, async (req, res) => {
  try {
    const db = getDB();
    const {
      workingDays, workingHoursStart, workingHoursEnd,
      appointmentDuration, gapBetweenAppointments, pendingExpiryHours,
      companyName, companyEmail, companyPhone, companyAddress
    } = req.body;

    // Convert working day names to day numbers
    const dayNameToNum = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    let dayNums = [];
    if (workingDays) {
      const days = Array.isArray(workingDays) ? workingDays : [workingDays];
      dayNums = days.map(d => dayNameToNum[d]).filter(n => n !== undefined);
    }

    const updates = {
      workingDays: dayNums,
      workingHoursStart: workingHoursStart || '10:00',
      workingHoursEnd: workingHoursEnd || '18:00',
      appointmentDuration: parseInt(appointmentDuration) || 30,
      gapBetweenAppointments: parseInt(gapBetweenAppointments) || 0,
      pendingExpiryHours: parseInt(pendingExpiryHours) || 48,
      companyName: (companyName || '').trim(),
      companyEmail: (companyEmail || '').trim(),
      companyPhone: (companyPhone || '').trim(),
      companyAddress: (companyAddress || '').trim()
    };

    for (const [key, value] of Object.entries(updates)) {
      await updateSetting(db, key, value);
    }

    res.redirect('/admin/settings?success=1');
  } catch (err) {
    console.error('Settings save error:', err);
    const db = getDB();
    const currentSettings = await getSettings(db);
    res.render('admin/settings', {
      title: 'Settings', currentSettings,
      success: null,
      error: 'Failed to save settings.'
    });
  }
});

// ─── Helper: populate service info on bookings ──────────────────────────────────
async function populateServices(db, bookings) {
  if (!bookings || !bookings.length) return;
  const serviceIds = [...new Set(bookings.map(b => b.serviceId?.toString()).filter(Boolean))];
  if (!serviceIds.length) return;
  const services = await db.collection('services')
    .find({ _id: { $in: serviceIds.map(id => { try { return new ObjectId(id); } catch(e) { return null; } }).filter(Boolean) } })
    .toArray();
  const map = {};
  services.forEach(s => { map[s._id.toString()] = s; });
  bookings.forEach(b => {
    b.service = map[b.serviceId?.toString()] || null;
  });
}

module.exports = router;
