/**
 * API Routes — Available slots, calendar data
 */

const express = require('express');
const router = express.Router();
const { getDB } = require('../config/database');
const { getSettings } = require('../config/settings');

/**
 * GET /api/available-slots?date=YYYY-MM-DD
 * Returns available time slots for the given date.
 */
router.get('/available-slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.json({ success: false, message: 'Invalid date format.' });
    }

    const db = getDB();
    const settings = await getSettings(db);

    // Check if the date is blocked
    const blocked = await db.collection('blocked_dates').findOne({ date });
    if (blocked) {
      return res.json({ success: true, slots: [], blocked: true, message: 'This date is blocked.' });
    }

    // Check if the day is a working day
    const dayOfWeek = new Date(date + 'T00:00:00').getDay(); // 0=Sun..6=Sat
    const workingDays = settings.workingDays || [1, 2, 3, 4, 5, 6];
    if (!workingDays.includes(dayOfWeek)) {
      return res.json({ success: true, slots: [], message: 'Not a working day.' });
    }

    // Generate all possible slots
    const startTime = settings.workingHoursStart || '10:00';
    const endTime = settings.workingHoursEnd || '18:00';
    const duration = settings.appointmentDuration || 30;
    const gap = settings.gapBetweenAppointments || 0;

    const allSlots = generateTimeSlots(startTime, endTime, duration, gap);

    // Get existing bookings for this date (pending + accepted occupy the slot)
    const existingBookings = await db.collection('appointments')
      .find({
        appointmentDate: date,
        status: { $in: ['pending', 'accepted'] }
      })
      .project({ appointmentTime: 1 })
      .toArray();

    const takenTimes = new Set(existingBookings.map(b => b.appointmentTime));

    // Filter out past slots if today
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const available = allSlots.filter(slot => {
      if (takenTimes.has(slot)) return false;
      if (date === today) {
        const [h, m] = slot.split(':').map(Number);
        if (h * 60 + m <= currentMinutes + 30) return false; // 30 min buffer
      }
      return true;
    });

    return res.json({ success: true, slots: available });
  } catch (err) {
    console.error('Available slots error:', err);
    return res.json({ success: false, message: 'Server error.' });
  }
});

/**
 * GET /api/blocked-dates?month=YYYY-MM
 * Returns blocked dates and non-working days info for the calendar.
 */
router.get('/blocked-dates', async (req, res) => {
  try {
    const db = getDB();
    const settings = await getSettings(db);

    const blockedDocs = await db.collection('blocked_dates').find({}).toArray();
    const blockedDates = blockedDocs.map(d => d.date);

    return res.json({
      success: true,
      blockedDates,
      workingDays: settings.workingDays || [1, 2, 3, 4, 5, 6],
      workingHoursStart: settings.workingHoursStart,
      workingHoursEnd: settings.workingHoursEnd
    });
  } catch (err) {
    console.error('Blocked dates API error:', err);
    return res.json({ success: false, message: 'Server error.' });
  }
});

/**
 * GET /api/admin/calendar-data?month=YYYY-MM
 * Returns bookings and blocked dates for the admin calendar.
 */
router.get('/admin/calendar-data', async (req, res) => {
  try {
    const { month } = req.query;   // e.g. '2026-11'
    if (!month) return res.json({ success: false, message: 'Month required.' });

    const db = getDB();

    // Get bookings for the month
    const regex = `^${month}`;
    const bookings = await db.collection('appointments')
      .find({ appointmentDate: { $regex: regex } })
      .toArray();

    // Populate services
    const serviceIds = [...new Set(bookings.map(b => b.serviceId?.toString()).filter(Boolean))];
    const { ObjectId } = require('mongodb');
    const services = await db.collection('services')
      .find({ _id: { $in: serviceIds.map(id => { try { return new ObjectId(id); } catch(e) { return null; } }).filter(Boolean) } })
      .toArray();
    const serviceMap = {};
    services.forEach(s => { serviceMap[s._id.toString()] = s; });

    bookings.forEach(b => {
      b.service = serviceMap[b.serviceId?.toString()] || null;
    });

    // Get blocked dates
    const blockedDocs = await db.collection('blocked_dates')
      .find({ date: { $regex: regex } }).toArray();
    const blockedDates = blockedDocs.map(d => d.date);

    return res.json({ success: true, bookings, blockedDates });
  } catch (err) {
    console.error('Admin calendar data error:', err);
    return res.json({ success: false, message: 'Server error.' });
  }
});

/**
 * Generate time slots between start and end times.
 */
function generateTimeSlots(start, end, durationMinutes, gapMinutes) {
  const slots = [];
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  let current = startMin;
  while (current + durationMinutes <= endMin) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    current += durationMinutes + gapMinutes;
  }
  return slots;
}

module.exports = router;
