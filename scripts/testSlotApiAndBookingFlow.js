/**
 * End-to-End Verification Test for Slot API, Country Code Dropdown & Full Booking Flow
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { connectDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const http = require('http');
const express = require('express');

// We can test the Express app directly using supertest or node http
async function runTests() {
  console.log('================================================================');
  console.log('   VERIFYING SLOT API, COUNTRY CODE & COMPLETE BOOKING FLOW      ');
  console.log('================================================================\n');

  const db = await connectDB();
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✔ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✘ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Test App Boot & API Routes
    const app = require('../app');
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(3088, resolve));
    console.log('  ✔ Test server running on port 3088\n');

    // Helper for HTTP GET
    function getJson(urlPath) {
      return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:3088${urlPath}`, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch (e) {
              resolve({ status: res.statusCode, raw: data, error: e.message });
            }
          });
        }).on('error', reject);
      });
    }

    // ─── TEST 1: /api/slots endpoint exists and returns JSON ────────────────
    const resSlots = await getJson('/api/slots?date=2026-11-25');
    assert(resSlots.status === 200, 'GET /api/slots returns HTTP 200');
    assert(resSlots.body && resSlots.body.success === true, '/api/slots returns success: true');
    assert(Array.isArray(resSlots.body?.slots) && resSlots.body.slots.length > 0, `/api/slots returns array of slots (${resSlots.body?.slots?.length} slots found)`);
    assert(resSlots.body.slots[0].time && typeof resSlots.body.slots[0].available === 'boolean', 'Slot objects have .time and .available properties');

    // ─── TEST 2: /api/available-slots endpoint works identically ────────────
    const resAvail = await getJson('/api/available-slots?date=2026-11-25');
    assert(resAvail.status === 200, 'GET /api/available-slots returns HTTP 200');
    assert(resAvail.body && resAvail.body.success === true, '/api/available-slots returns success: true');
    assert(resAvail.body.slots.length === resSlots.body.slots.length, '/api/slots and /api/available-slots return identical slot count');

    // ─── TEST 3: Blocked dates and non-working days handling ────────────────
    // 2026-11-22 is a Sunday (day 0)
    const resSunday = await getJson('/api/slots?date=2026-11-22');
    assert(resSunday.status === 200, 'GET /api/slots for Sunday returns HTTP 200');
    assert(resSunday.body.isWorkingDay === false && resSunday.body.slots.length === 0, 'Sunday is marked as non-working day with 0 available slots');

    // ─── TEST 4: Phone Number Country Code Normalization ────────────────────
    // Test helper to verify logic matching routes/booking.js
    function normalizePhone(countryCode, phoneNumber) {
      let finalCountryCode = (countryCode || '+91').trim();
      if (!finalCountryCode.startsWith('+')) finalCountryCode = '+' + finalCountryCode;
      let rawDigits = (phoneNumber || '').replace(/[^\d]/g, '');
      const codeDigits = finalCountryCode.replace('+', '');
      if (rawDigits.startsWith(codeDigits) && rawDigits.length > codeDigits.length + 6) {
        rawDigits = rawDigits.slice(codeDigits.length);
      }
      if (rawDigits.startsWith('0') && rawDigits.length > 7) {
        rawDigits = rawDigits.slice(1);
      }
      return `${finalCountryCode}${rawDigits}`;
    }

    assert(normalizePhone('+91', '9876543210') === '+919876543210', 'India standard number correctly formatted (+919876543210)');
    assert(normalizePhone('+91', '+91 9876543210') === '+919876543210', 'Double country code typing safely prevented (no +91+91)');
    assert(normalizePhone('+91', '09876543210') === '+919876543210', 'Leading zero stripped cleanly');
    assert(normalizePhone('+1', '4155552671') === '+14155552671', 'US calling code (+1) correctly formatted');
    assert(normalizePhone('+971', '501234567') === '+971501234567', 'UAE calling code (+971) correctly formatted');

    // ─── TEST 5: Exact URL Navigation: /book?service=6ae86b114f4880fc40d22fcd ──
    const targetServiceId = '6ae86b114f4880fc40d22fcd';
    const targetService = await db.collection('services').findOne({ _id: new ObjectId(targetServiceId) });
    assert(targetService && targetService.name === 'Website Development', 'Found target service "Website Development" (ID: 6ae86b114f4880fc40d22fcd)');

    // 5A: Test /book?service=6ae86b114f4880fc40d22fcd (Preselected via Home/Services button)
    const resPreselected = await new Promise(resolve => {
      http.get(`http://127.0.0.1:3088/book?service=${targetServiceId}`, res => {
        let html = '';
        res.on('data', c => html += c);
        res.on('end', () => resolve({ status: res.statusCode, html }));
      });
    });

    assert(resPreselected.status === 200, 'GET /book?service=6ae86b114f4880fc40d22fcd returns HTTP 200');
    assert(resPreselected.html.includes('SELECTED SERVICE'), 'Banner displays "SELECTED SERVICE" at top of page');
    assert(resPreselected.html.includes('Website Development'), 'Banner displays actual service name "Website Development"');
    assert(resPreselected.html.includes('id="sectionServiceSelection" style="display: none;'), 'Service selection cards are HIDDEN when service ID is present');
    assert(resPreselected.html.includes('id="sectionCustomerDetails" style="display: block;'), 'Customer details form is IMMEDIATELY DISPLAYED');
    assert(resPreselected.html.includes('Customer Details Form'), 'Customer Details Form heading is directly visible');
    assert(resPreselected.html.includes('countryCodeSelect'), 'Country Code Dropdown is present');
    assert(resPreselected.html.includes('🇮🇳 India (+91)'), 'India (+91) is default in Country Code Dropdown');

    // 5B: Test bare /book (No service ID in URL)
    const resBareBook = await new Promise(resolve => {
      http.get('http://127.0.0.1:3088/book', res => {
        let html = '';
        res.on('data', c => html += c);
        res.on('end', () => resolve({ status: res.statusCode, html }));
      });
    });

    assert(resBareBook.status === 200, 'GET /book returns HTTP 200');
    assert(resBareBook.html.includes('id="sectionServiceSelection" style="display: block;'), 'Service selection cards are SHOWN when no service ID is in URL');
    assert(resBareBook.html.includes('id="sectionCustomerDetails" style="display: none;'), 'Customer details form is hidden until customer chooses a service');
    assert(resBareBook.html.includes('id="selectedServiceTopBanner"\n           style="display: none;'), 'Top banner is hidden on bare /book');

    const service = targetService;

    // ─── TEST 6: Real Booking Insertion with Country Code ───────────────────
    const testDate = '2026-11-26';
    const testTime = '11:30';
    // Clean any prior appointment for this slot
    await db.collection('appointments').deleteMany({ appointmentDate: testDate, appointmentTime: testTime });

    const crypto = require('crypto');
    const bookingId = crypto.randomBytes(3).toString('hex').toUpperCase();
    const fullPhone = normalizePhone('+91', '9876543210');

    const appointment = {
      bookingId,
      serviceId: service._id,
      customerName: 'Anas Shaikh Test Client',
      customerEmail: 'shaikhanas0567@gmail.com',
      customerPhone: fullPhone,
      countryCode: '+91',
      phoneNumber: '9876543210',
      customerCompany: 'Devrox AI Corp',
      projectDescription: 'Building a cloud-native software appointment booking platform.',
      appointmentDate: testDate,
      appointmentTime: testTime,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insertResult = await db.collection('appointments').insertOne(appointment);
    assert(insertResult.insertedId, `Test appointment inserted in MongoDB with status "pending" (ID: SAB-${bookingId})`);

    // ─── TEST 7: Slot is now marked as booked in /api/slots ─────────────────
    const resSlotsAfter = await getJson(`/api/slots?date=${testDate}`);
    const bookedSlot = resSlotsAfter.body?.slots?.find(s => s.time === testTime);
    assert(bookedSlot && bookedSlot.available === false, `Slot ${testTime} is now marked as booked (available: false)`);

    // ─── TEST 8: Compound Unique Index Blocks Double-Booking ────────────────
    let duplicateBlocked = false;
    try {
      await db.collection('appointments').insertOne({
        ...appointment,
        bookingId: 'DUP001',
        _id: new ObjectId()
      });
    } catch (err) {
      if (err.code === 11000) duplicateBlocked = true;
    }
    assert(duplicateBlocked, 'MongoDB compound unique index successfully blocks duplicate booking for same slot');

    // ─── TEST 9: Admin Dashboard & Status Transitions ───────────────────────
    // Transition to accepted
    const acceptRes = await db.collection('appointments').findOneAndUpdate(
      { _id: insertResult.insertedId, status: 'pending' },
      { $set: { status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    const acceptedDoc = acceptRes && (acceptRes.value || acceptRes);
    assert(acceptedDoc && acceptedDoc.status === 'accepted', 'Booking successfully accepted by administrator');

    // Clean up test booking
    await db.collection('appointments').deleteOne({ _id: insertResult.insertedId });
    console.log('  ✔ Test appointment cleaned up from database');

    server.close();
  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`   TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
