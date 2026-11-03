/**
 * Booking Routes — Book appointment, submit, success page
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDB } = require('../config/database');
const { getSettings } = require('../config/settings');
const { verifyCsrf } = require('../middleware/auth');
const { sendBookingConfirmation, sendAdminNewBookingAlert } = require('../services/emailService');
const { ObjectId } = require('mongodb');

// Book — GET
router.get('/book', async (req, res) => {
  try {
    const db = getDB();
    const services = await db.collection('services')
      .find({ isActive: { $ne: false } })
      .sort({ order: 1 })
      .toArray();
    const selectedService = req.query.service || '';
    res.render('appointments/book', {
      title: 'Book Appointment',
      services,
      selectedService,
      error: null
    });
  } catch (err) {
    console.error('Book page error:', err);
    res.render('appointments/book', {
      title: 'Book Appointment',
      services: [],
      selectedService: '',
      error: 'Unable to load services. Please try again.'
    });
  }
});

// Book — POST
router.post('/book', verifyCsrf, async (req, res) => {
  try {
    const db = getDB();
    const {
      serviceId, customerName, customerEmail, customerPhone,
      customerCompany, projectDescription, appointmentDate, appointmentTime
    } = req.body;

    // Validate required fields
    if (!serviceId || !customerName || !customerEmail || !customerPhone ||
        !projectDescription || !appointmentDate || !appointmentTime) {
      const services = await db.collection('services')
        .find({ isActive: { $ne: false } }).sort({ order: 1 }).toArray();
      return res.render('appointments/book', {
        title: 'Book Appointment',
        services,
        selectedService: serviceId || '',
        error: 'Please fill in all required fields.'
      });
    }

    // Verify service exists
    let service;
    try {
      service = await db.collection('services').findOne({ _id: new ObjectId(serviceId) });
    } catch (e) {
      service = null;
    }
    if (!service) {
      const services = await db.collection('services')
        .find({ isActive: { $ne: false } }).sort({ order: 1 }).toArray();
      return res.render('appointments/book', {
        title: 'Book Appointment', services,
        selectedService: '', error: 'Invalid service selected.'
      });
    }

    // Check for blocked date
    const blocked = await db.collection('blocked_dates').findOne({ date: appointmentDate });
    if (blocked) {
      const services = await db.collection('services')
        .find({ isActive: { $ne: false } }).sort({ order: 1 }).toArray();
      return res.render('appointments/book', {
        title: 'Book Appointment', services,
        selectedService: serviceId,
        error: 'The selected date is not available. Please choose a different date.'
      });
    }

    // Generate booking ID
    const bookingId = crypto.randomBytes(3).toString('hex').toUpperCase();

    // Insert the appointment (unique index prevents duplicate date+time for active bookings)
    const appointment = {
      bookingId,
      serviceId: new ObjectId(serviceId),
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      customerPhone: customerPhone.trim(),
      customerCompany: (customerCompany || '').trim(),
      projectDescription: projectDescription.trim(),
      appointmentDate,          // 'YYYY-MM-DD'
      appointmentTime,          // 'HH:MM'
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    try {
      await db.collection('appointments').insertOne(appointment);
    } catch (insertErr) {
      if (insertErr.code === 11000) {
        // Duplicate key — slot already taken
        const services = await db.collection('services')
          .find({ isActive: { $ne: false } }).sort({ order: 1 }).toArray();
        return res.render('appointments/book', {
          title: 'Book Appointment', services,
          selectedService: serviceId,
          error: 'This time slot is no longer available. Please choose a different time.'
        });
      }
      throw insertErr;
    }

    // Send emails (customer confirmation + admin notification)
    sendBookingConfirmation(appointment, service.name)
      .then(res => {
        if (res && res.success) {
          console.log(`✔ [Email] Confirmation email dispatched to customer: ${appointment.customerEmail}`);
        } else {
          console.warn(`⚠ [Email] Customer confirmation could not be sent: ${res?.error}`);
        }
      })
      .catch(err => console.error('Customer email send error:', err?.message || err));

    sendAdminNewBookingAlert(appointment, service.name)
      .then(res => {
        if (res && res.success) {
          console.log(`✔ [Email] Admin alert dispatched to: ${process.env.ADMIN_EMAIL}`);
        } else {
          console.warn(`⚠ [Email] Admin alert could not be sent: ${res?.error}`);
        }
      })
      .catch(err => console.error('Admin email send error:', err?.message || err));

    // Populate service info for success page
    appointment.service = service;
    res.render('appointments/success', {
      title: 'Booking Submitted',
      booking: appointment
    });
  } catch (err) {
    console.error('Booking error:', err);
    const db = getDB();
    const services = await db.collection('services')
      .find({ isActive: { $ne: false } }).sort({ order: 1 }).toArray();
    res.render('appointments/book', {
      title: 'Book Appointment', services,
      selectedService: '',
      error: 'Something went wrong. Please try again.'
    });
  }
});

module.exports = router;
