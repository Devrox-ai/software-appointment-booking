/**
 * Public Routes — Home, About, Services, Contact, Privacy, Terms
 */

const express = require('express');
const router = express.Router();
const { getDB } = require('../config/database');
const { verifyCsrf } = require('../middleware/auth');

// Home
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const services = await db.collection('services')
      .find({ isActive: { $ne: false } })
      .sort({ order: 1 })
      .toArray();
    res.render('home', { title: 'Home', services });
  } catch (err) {
    console.error('Home error:', err);
    res.render('home', { title: 'Home', services: [] });
  }
});

// About
router.get('/about', (req, res) => {
  res.render('about', { title: 'About Us' });
});

// Services
router.get('/services', async (req, res) => {
  try {
    const db = getDB();
    const services = await db.collection('services')
      .find({ isActive: { $ne: false } })
      .sort({ order: 1 })
      .toArray();
    res.render('services', { title: 'Our Services', services });
  } catch (err) {
    res.render('services', { title: 'Our Services', services: [] });
  }
});

// Contact — GET
router.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact Us', success: null, error: null });
});

// Contact — POST
router.post('/contact', verifyCsrf, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.render('contact', {
        title: 'Contact Us',
        error: 'Please fill in all required fields.',
        success: null
      });
    }
    const db = getDB();
    await db.collection('contact_messages').insertOne({
      name, email, phone: phone || '', subject, message,
      createdAt: new Date()
    });
    res.render('contact', {
      title: 'Contact Us',
      success: 'Your message has been sent successfully! We\'ll get back to you within 24 hours.',
      error: null
    });
  } catch (err) {
    console.error('Contact error:', err);
    res.render('contact', {
      title: 'Contact Us',
      error: 'Something went wrong. Please try again.',
      success: null
    });
  }
});

// Privacy
router.get('/privacy', (req, res) => {
  res.render('privacy', { title: 'Privacy Policy' });
});

// Terms
router.get('/terms', (req, res) => {
  res.render('terms', { title: 'Terms and Conditions' });
});

module.exports = router;
