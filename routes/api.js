/**
 * API Routes — Available slots, calendar data
 */

const express = require('express');
const router = express.Router();
const { getDB } = require('../config/database');
const { getSettings } = require('../config/settings');

/**
 * Shared Handler: Get Available & Booked Slots for a Given Date
 * Supports both /api/slots and /api/available-slots
 */
async function handleSlotsRequest(req, res) {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.',
        message: 'Invalid date format.'
      });
    }

    const db = getDB();
    const settings = await getSettings(db);

    // 1. Check if date is blocked by admin
    const blocked = await db.collection('blocked_dates').findOne({ date });
    if (blocked) {
      return res.json({
        success: true,
        date,
        slots: [],
        availableSlots: [],
        isBlocked: true,
        blocked: true,
        message: blocked.reason || 'This date is marked as unavailable.'
      });
    }

    // 2. Check if the date falls on a configured working day
    // Parse year, month, day to avoid timezone drift
    const [y, m, d] = date.split('-').map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0 = Sunday, 1 = Monday... 6 = Saturday
    const workingDays = settings.workingDays || [1, 2, 3, 4, 5, 6];
    if (!workingDays.includes(dayOfWeek)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return res.json({
        success: true,
        date,
        slots: [],
        availableSlots: [],
        isWorkingDay: false,
        message: `${dayNames[dayOfWeek]} is a non-working day. Please select a date between Monday and Saturday.`
      });
    }

    // 3. Generate all configured schedule slots
    const startTime = settings.workingHoursStart || '10:00';
    const endTime = settings.workingHoursEnd || '18:00';
    const duration = settings.appointmentDuration || 30;
    const gap = settings.gapBetweenAppointments || 0;

    const allSlots = generateTimeSlots(startTime, endTime, duration, gap);

    // 4. Fetch existing booked slots for this date (both 'pending' and 'accepted' reserve the slot)
    const existingBookings = await db.collection('appointments')
      .find({
        appointmentDate: date,
        status: { $in: ['pending', 'accepted'] }
      })
      .project({ appointmentTime: 1 })
      .toArray();

    const takenTimes = new Set(existingBookings.map(b => b.appointmentTime));

    // 5. If date is today, disable past time slots with a 30-min buffer
    const now = new Date();
    // Format today as YYYY-MM-DD in local time
    const todayYear = now.getFullYear();
    const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
    const todayDay = String(now.getDate()).padStart(2, '0');
    const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const slotsData = allSlots.map(timeStr => {
      const isTaken = takenTimes.has(timeStr);
      let isPast = false;
      if (date === todayStr) {
        const [h, m] = timeStr.split(':').map(Number);
        if (h * 60 + m <= currentMinutes + 30) {
          isPast = true;
        }
      }

      const available = !isTaken && !isPast;
      let reason = 'available';
      if (isTaken) reason = 'booked';
      else if (isPast) reason = 'past';

      return {
        time: timeStr,
        available,
        reason
      };
    });

    const availableOnly = slotsData.filter(s => s.available).map(s => s.time);

    return res.json({
      success: true,
      date,
      slots: slotsData,
      availableSlots: availableOnly,
      isBlocked: false,
      isWorkingDay: true,
      totalSlots: slotsData.length,
      availableCount: availableOnly.length
    });
  } catch (err) {
    console.error('Slot calculation error:', err);
    return res.status(500).json({
      success: false,
      error: 'Unable to connect to slot booking service. Please try again.',
      message: 'Server error retrieving time slots.'
    });
  }
}

// Bind both endpoints to guarantee zero 404s
router.get('/slots', handleSlotsRequest);
router.get('/available-slots', handleSlotsRequest);

/**
 * GET /api/blocked-dates?month=YYYY-MM
 * Returns blocked dates and working days info for calendar initialization.
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
      workingHoursStart: settings.workingHoursStart || '10:00',
      workingHoursEnd: settings.workingHoursEnd || '18:00'
    });
  } catch (err) {
    console.error('Blocked dates API error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving calendar config.' });
  }
});

/**
 * GET /api/admin/calendar-data?month=YYYY-MM
 * Returns bookings and blocked dates for the admin calendar.
 */
router.get('/admin/calendar-data', async (req, res) => {
  try {
    const { month } = req.query; // e.g. '2026-11'
    if (!month) return res.status(400).json({ success: false, message: 'Month required.' });

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
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/**
 * Generate time slots between start and end times.
 */
function generateTimeSlots(start, end, durationMinutes, gapMinutes) {
  const slots = [];
  const [sh, sm] = (start || '10:00').split(':').map(Number);
  const [eh, em] = (end || '18:00').split(':').map(Number);
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
