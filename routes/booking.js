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
      formData: {},
      error: null
    });
  } catch (err) {
    console.error('Book page error:', err);
    res.render('appointments/book', {
      title: 'Book Appointment',
      services: [],
      selectedService: '',
      formData: {},
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
      countryCode, phoneNumber, customerCompany, projectDescription,
      appointmentDate, appointmentTime
    } = req.body;

    // Sanitize & Format Phone with Country Code
    let finalCountryCode = (countryCode || '+91').trim();
    if (!finalCountryCode.startsWith('+')) {
      finalCountryCode = '+' + finalCountryCode;
    }

    // Determine phone digits from phoneNumber or customerPhone
    let rawDigits = (phoneNumber || customerPhone || '').replace(/[^\d]/g, '');
    const codeDigits = finalCountryCode.replace('+', '');

    // Prevent double country code if customer pasted e.g. +91 9876543210
    if (rawDigits.startsWith(codeDigits) && rawDigits.length > codeDigits.length + 6) {
      rawDigits = rawDigits.slice(codeDigits.length);
    }
    // Remove leading 0 if present (e.g. 09876543210 -> 9876543210)
    if (rawDigits.startsWith('0') && rawDigits.length > 7) {
      rawDigits = rawDigits.slice(1);
    }

    const fullPhoneNumber = `${finalCountryCode}${rawDigits}`;

    // Validate required fields
    if (!serviceId || !customerName || !customerEmail || !rawDigits ||
        !projectDescription || !appointmentDate || !appointmentTime) {
      const services = await db.collection('services')
        .find({ isActive: { $ne: false } }).sort({ order: 1 }).toArray();
      return res.render('appointments/book', {
        title: 'Book Appointment',
        services,
        selectedService: serviceId || '',
        formData: req.body,
        error: 'Please fill in all required fields.'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail.trim())) {
      const services = await db.collection('services')
        .find({ isActive: { $ne: false } }).sort({ order: 1 }).toArray();
      return res.render('appointments/book', {
        title: 'Book Appointment',
        services,
        selectedService: serviceId || '',
        formData: req.body,
        error: 'Please enter a valid email address.'
      });
    }

    // Validate phone number length (min 7, max 15 digits)
    if (rawDigits.length < 7 || rawDigits.length > 15) {
      const services = await db.collection('services')
        .find({ isActive: { $ne: false } }).sort({ order: 1 }).toArray();
      return res.render('appointments/book', {
        title: 'Book Appointment',
        services,
        selectedService: serviceId || '',
        formData: req.body,
        error: 'Please enter a valid phone number (7 to 15 digits).'
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
        title: 'Book Appointment',
        services,
        selectedService: '',
        formData: req.body,
        error: 'Invalid software service selected.'
      });
    }

    // Check for blocked date
    const blocked = await db.collection('blocked_dates').findOne({ date: appointmentDate });
    if (blocked) {
      const services = await db.collection('services')
        .find({ isActive: { $ne: false } }).sort({ order: 1 }).toArray();
      return res.render('appointments/book', {
        title: 'Book Appointment',
        services,
        selectedService: serviceId,
        formData: req.body,
        error: 'The selected date is not available. Please choose a different date.'
      });
    }

    // Generate readable booking reference ID (e.g. 6-hex uppercase)
    const bookingId = crypto.randomBytes(3).toString('hex').toUpperCase();

    // Insert the appointment (compound unique index prevents duplicate date+time for active bookings)
    const appointment = {
      bookingId,
      serviceId: new ObjectId(serviceId),
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      customerPhone: fullPhoneNumber,
      countryCode: finalCountryCode,
      phoneNumber: rawDigits,
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
        // Duplicate slot already reserved
        const services = await db.collection('services')
          .find({ isActive: { $ne: false } }).sort({ order: 1 }).toArray();
        return res.render('appointments/book', {
          title: 'Book Appointment',
          services,
          selectedService: serviceId,
          formData: req.body,
          error: 'This time slot is no longer available. Please choose a different time.'
        });
      }
      throw insertErr;
    }

    // Send emails (customer confirmation + admin alert) via official Google Gmail API OAuth 2.0
    sendBookingConfirmation(appointment, service.name)
      .then(res => {
        if (res && res.success) {
          console.log(`✔ [Email] Customer confirmation dispatched to: ${appointment.customerEmail}`);
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

    // Populate service details for success confirmation page
    appointment.service = service;
    res.render('appointments/success', {
      title: 'Booking Submitted',
      booking: appointment
    });
  } catch (err) {
    console.error('Booking submission error:', err);
    const db = getDB();
    const services = await db.collection('services')
      .find({ isActive: { $ne: false } }).sort({ order: 1 }).toArray();
    res.render('appointments/book', {
      title: 'Book Appointment',
      services,
      selectedService: '',
      formData: req.body || {},
      error: 'Something went wrong. Please try again.'
    });
  }
});

module.exports = router;
