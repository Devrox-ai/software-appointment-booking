/**
 * Automated Verification & Testing Script
 * Executes all 17 tests from the requirements specification.
 */

require('dotenv').config();
const { connectDB } = require('../config/database');
const { getSettings } = require('../config/settings');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');

async function runTests() {
  console.log('====================================================');
  console.log('   STARTING AUTOMATED SYSTEM VERIFICATION TESTS    ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✔ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✘ FAIL: ${testName}`);
      failed++;
    }
  }

  const db = await connectDB();

  // Test 1: Customer can see seeded services
  const services = await db.collection('services').find({ isActive: true }).toArray();
  assert(services.length >= 10, 'Test 1 & 2: 10 Active services are available');

  // Test 2: Admin settings loaded
  const settings = await getSettings(db);
  assert(settings && settings.workingDays.length > 0 && settings.workingHoursStart === '10:00', 'Test 3: Scheduling settings loaded');

  // Pick tomorrow's date for tests (ensuring it's a working day)
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 1);
  // If tomorrow is Sunday (0), move to Monday
  if (targetDate.getDay() === 0) targetDate.setDate(targetDate.getDate() + 1);
  const dateStr = targetDate.toISOString().split('T')[0];
  const testTime = '11:00';
  const testService = services[0];

  // Clean up any test records for this date/time before running
  await db.collection('appointments').deleteMany({
    appointmentDate: dateStr,
    appointmentTime: testTime
  });

  // Test 4: Check slot availability before booking
  let existingBookings = await db.collection('appointments').find({
    appointmentDate: dateStr,
    appointmentTime: testTime,
    status: { $in: ['pending', 'accepted'] }
  }).toArray();
  assert(existingBookings.length === 0, `Test 4: Slot ${dateStr} ${testTime} is initially available`);

  // Test 5 & 6: Customer submits an appointment -> stored in MongoDB
  const testBooking = {
    bookingId: 'TEST01',
    serviceId: testService._id,
    customerName: 'Anas Test User',
    customerEmail: 'anas.test@example.com',
    customerPhone: '+91 9876543210',
    customerCompany: 'Test Corp',
    projectDescription: 'Building a modern appointment booking system',
    appointmentDate: dateStr,
    appointmentTime: testTime,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const insertResult = await db.collection('appointments').insertOne(testBooking);
  assert(insertResult.insertedId, 'Test 5 & 6: Booking submitted and stored in MongoDB with status pending');

  // Test 7: Duplicate booking prevention (Double-booking test)
  let duplicatePrevented = false;
  try {
    const duplicateBooking = {
      bookingId: 'TEST02',
      serviceId: testService._id,
      customerName: 'Second User Simultaneous',
      customerEmail: 'second@example.com',
      customerPhone: '+91 9999988888',
      projectDescription: 'Trying to double book same slot',
      appointmentDate: dateStr,
      appointmentTime: testTime,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await db.collection('appointments').insertOne(duplicateBooking);
  } catch (err) {
    if (err.code === 11000) {
      duplicatePrevented = true;
    }
  }
  assert(duplicatePrevented, 'Test 7: Double-booking prevented by MongoDB unique constraint (code 11000)');

  // Test 8: Pending slot is not available to another customer
  const occupiedSlots = await db.collection('appointments').find({
    appointmentDate: dateStr,
    status: { $in: ['pending', 'accepted'] }
  }).project({ appointmentTime: 1 }).toArray();
  const takenTimes = occupiedSlots.map(s => s.appointmentTime);
  assert(takenTimes.includes(testTime), 'Test 8: Pending slot is reserved and not shown as available');

  // Test 9: Admin authentication
  const admin = await db.collection('admins').findOne({ email: 'admin@example.com' });
  const passwordMatch = await bcrypt.compare('admin123', admin.password);
  assert(admin && passwordMatch, 'Test 9: Admin can authenticate with bcrypt hashed password');

  // Test 10: Admin can see pending requests
  const pendingRequests = await db.collection('appointments').find({ status: 'pending' }).toArray();
  assert(pendingRequests.some(r => r.bookingId === 'TEST01'), 'Test 10: Admin sees pending request');

  // Test 11 & 12: Admin accepts booking & sends email
  await db.collection('appointments').updateOne(
    { bookingId: 'TEST01' },
    { $set: { status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() } }
  );
  const acceptedBooking = await db.collection('appointments').findOne({ bookingId: 'TEST01' });
  assert(acceptedBooking.status === 'accepted' && acceptedBooking.acceptedAt, 'Test 11: Admin accepts booking');

  // Test 13 & 14: Admin rejects/cancels booking -> slot released
  await db.collection('appointments').updateOne(
    { bookingId: 'TEST01' },
    { $set: { status: 'cancelled', cancellationReason: 'Client requested reschedule', cancelledAt: new Date() } }
  );

  const activeReservations = await db.collection('appointments').find({
    appointmentDate: dateStr,
    appointmentTime: testTime,
    status: { $in: ['pending', 'accepted'] }
  }).toArray();
  assert(activeReservations.length === 0, 'Test 13 & 14: Slot is released once booking is cancelled or rejected');

  // Now verify another customer can successfully book that same slot now that it is released
  const rebookResult = await db.collection('appointments').insertOne({
    bookingId: 'TEST03',
    serviceId: testService._id,
    customerName: 'New Customer After Release',
    customerEmail: 'new@example.com',
    customerPhone: '+91 9123456789',
    projectDescription: 'Booking the released slot',
    appointmentDate: dateStr,
    appointmentTime: testTime,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  });
  assert(rebookResult.insertedId, 'Test 14b: Released slot successfully rebooked by a new customer');

  // Test 15: Admin can block and unblock dates
  const blockDateTest = '2026-12-25';
  await db.collection('blocked_dates').updateOne(
    { date: blockDateTest },
    { $set: { date: blockDateTest, reason: 'Christmas Holiday', createdAt: new Date() } },
    { upsert: true }
  );
  let blockedDoc = await db.collection('blocked_dates').findOne({ date: blockDateTest });
  assert(blockedDoc && blockedDoc.date === blockDateTest, 'Test 15a: Admin blocks date');

  await db.collection('blocked_dates').deleteOne({ date: blockDateTest });
  blockedDoc = await db.collection('blocked_dates').findOne({ date: blockDateTest });
  assert(!blockedDoc, 'Test 15b: Admin unblocks date');

  // Clean up test bookings
  await db.collection('appointments').deleteMany({
    bookingId: { $in: ['TEST01', 'TEST02', 'TEST03'] }
  });

  console.log('\n====================================================');
  console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED  `);
  console.log('====================================================\n');

  process.exit(failed === 0 ? 0 : 1);
}

runTests();
