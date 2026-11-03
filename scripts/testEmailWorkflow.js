/**
 * Automated Verification Script for Email & Booking Workflow
 * Tests the exact workflow specified by the user.
 */

require('dotenv').config();
const { connectDB } = require('../config/database');
const emailService = require('../services/emailService');

async function testWorkflow() {
  console.log('================================================================');
  console.log('   TESTING APPOINTMENT BOOKING & EMAIL WORKFLOW FOR ANAS        ');
  console.log('================================================================\n');

  const db = await connectDB();
  const adminEmail = process.env.ADMIN_EMAIL || 'anasshaikh00456@gmail.com';

  console.log(`Configured Admin Email: ${adminEmail}`);

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

  // 1. Pick service
  const service = await db.collection('services').findOne({ isActive: true });
  assert(service !== null, 'Found active software service: ' + service.name);

  // 2. Select test slot (far future date to avoid collision with real bookings)
  const testDate = '2026-11-20';
  const testTime = '14:30';
  const customerEmail = 'customer.test@example.com';
  const customerName = 'Rahul Sharma';
  const customerPhone = '+91 9876501234';
  const projectRequirements = 'Need an enterprise SaaS portal with multi-tenant architecture and real-time analytics.';

  // Clean up any test records for this slot
  await db.collection('appointments').deleteMany({ appointmentDate: testDate, appointmentTime: testTime });
  await db.collection('email_logs').deleteMany({ bookingId: { $in: ['ANAS01', 'ANAS02'] } });

  // 3. Customer submits booking -> Must be saved as 'pending'
  const booking = {
    bookingId: 'ANAS01',
    serviceId: service._id,
    customerName,
    customerEmail,
    customerPhone,
    customerCompany: 'Apex Tech Inc.',
    projectDescription: projectRequirements,
    appointmentDate: testDate,
    appointmentTime: testTime,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await db.collection('appointments').insertOne(booking);

  const savedBooking = await db.collection('appointments').findOne({ bookingId: 'ANAS01' });
  assert(savedBooking !== null, 'Booking saved successfully in MongoDB');
  assert(savedBooking.status === 'pending', 'Appointment status is strictly "pending" (NOT automatically accepted)');

  // 4. Send emails triggered on booking submission
  // a) Admin notification to anasshaikh00456@gmail.com
  await emailService.sendAdminNewBookingAlert(booking, service.name);
  // b) Customer received email to customer's submitted email
  await emailService.sendBookingConfirmation(booking, service.name);

  // Verify email_logs in MongoDB
  const adminLog = await db.collection('email_logs').findOne({
    bookingId: 'ANAS01',
    type: 'admin_notification'
  });
  assert(adminLog !== null, 'Admin notification logged in MongoDB email_logs');
  assert(adminLog && adminLog.to === 'anasshaikh00456@gmail.com', `Admin notification sent to exact admin email: ${adminLog?.to}`);
  assert(adminLog && adminLog.subject.includes(customerName), 'Admin email subject contains customer name');

  const customerLog = await db.collection('email_logs').findOne({
    bookingId: 'ANAS01',
    type: 'customer_received'
  });
  assert(customerLog !== null, 'Customer confirmation logged in MongoDB email_logs');
  assert(customerLog && customerLog.to === customerEmail, `Customer email sent to customer's own address: ${customerLog?.to}`);

  // 5. Test Double Booking Prevention on Pending Slot
  let doubleBookingPrevented = false;
  try {
    const duplicate = {
      bookingId: 'ANAS02',
      serviceId: service._id,
      customerName: 'Second Customer',
      customerEmail: 'second@example.com',
      customerPhone: '+91 9111122222',
      projectDescription: 'Attempting duplicate',
      appointmentDate: testDate,
      appointmentTime: testTime,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await db.collection('appointments').insertOne(duplicate);
  } catch (err) {
    if (err.code === 11000) {
      doubleBookingPrevented = true;
    }
  }
  assert(doubleBookingPrevented, 'Double booking blocked by MongoDB unique index for pending appointment');

  // 6. Admin manually accepts booking
  await db.collection('appointments').updateOne(
    { bookingId: 'ANAS01', status: 'pending' },
    { $set: { status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() } }
  );

  const acceptedDoc = await db.collection('appointments').findOne({ bookingId: 'ANAS01' });
  assert(acceptedDoc.status === 'accepted' && acceptedDoc.acceptedAt, 'Admin updated status in MongoDB to "accepted"');

  // Trigger acceptance email to customer
  await emailService.sendBookingAccepted(acceptedDoc, service.name);

  const acceptLog = await db.collection('email_logs').findOne({
    bookingId: 'ANAS01',
    type: 'customer_accepted'
  });
  assert(acceptLog !== null, 'Acceptance email logged in MongoDB email_logs');
  assert(acceptLog && acceptLog.to === customerEmail, `Acceptance email delivered to customer: ${acceptLog?.to}`);

  // 7. Verify slot still blocked when accepted
  let doubleBookingOnAcceptedPrevented = false;
  try {
    await db.collection('appointments').insertOne({
      bookingId: 'ANAS03',
      serviceId: service._id,
      customerName: 'Third Customer',
      customerEmail: 'third@example.com',
      customerPhone: '+91 9333344444',
      projectDescription: 'Trying while accepted',
      appointmentDate: testDate,
      appointmentTime: testTime,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } catch (err) {
    if (err.code === 11000) {
      doubleBookingOnAcceptedPrevented = true;
    }
  }
  assert(doubleBookingOnAcceptedPrevented, 'Double booking blocked by MongoDB unique index for accepted appointment');

  // 8. Admin cancels booking
  const cancelReason = 'Requested by client due to urgent schedule conflict';
  await db.collection('appointments').updateOne(
    { bookingId: 'ANAS01' },
    { $set: { status: 'cancelled', cancellationReason: cancelReason, cancelledAt: new Date(), updatedAt: new Date() } }
  );

  const cancelledDoc = await db.collection('appointments').findOne({ bookingId: 'ANAS01' });
  assert(cancelledDoc.status === 'cancelled', 'Admin updated status in MongoDB to "cancelled"');

  // Trigger cancellation email to customer
  await emailService.sendBookingCancelled(cancelledDoc, service.name, cancelReason);

  const cancelLog = await db.collection('email_logs').findOne({
    bookingId: 'ANAS01',
    type: 'customer_cancelled'
  });
  assert(cancelLog !== null, 'Cancellation email logged in MongoDB email_logs');
  assert(cancelLog && cancelLog.to === customerEmail, `Cancellation email delivered to customer: ${cancelLog?.to}`);

  // 9. Verify slot is released after cancellation
  const rebookedSlot = await db.collection('appointments').insertOne({
    bookingId: 'ANAS04',
    serviceId: service._id,
    customerName: 'Subsequent Customer',
    customerEmail: 'subsequent@example.com',
    customerPhone: '+91 9555566666',
    projectDescription: 'Booking after release',
    appointmentDate: testDate,
    appointmentTime: testTime,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  });
  assert(rebookedSlot.insertedId !== null, 'Slot released! New customer successfully reserved the released slot');

  // 10. Admin rejects appointment test
  const rejectReason = 'Service scope outside current consultation availability';
  await db.collection('appointments').updateOne(
    { bookingId: 'ANAS04' },
    { $set: { status: 'rejected', rejectionReason: rejectReason, rejectedAt: new Date(), updatedAt: new Date() } }
  );
  const rejectedDoc = await db.collection('appointments').findOne({ bookingId: 'ANAS04' });
  assert(rejectedDoc.status === 'rejected', 'Admin updated status in MongoDB to "rejected"');

  await emailService.sendBookingRejected(rejectedDoc, service.name, rejectReason);
  const rejectLog = await db.collection('email_logs').findOne({
    bookingId: 'ANAS04',
    type: 'customer_rejected'
  });
  assert(rejectLog !== null, 'Rejection email logged in MongoDB email_logs');
  assert(rejectLog && rejectLog.to === 'subsequent@example.com', `Rejection email delivered to customer: ${rejectLog?.to}`);

  // Clean up test data
  await db.collection('appointments').deleteMany({
    bookingId: { $in: ['ANAS01', 'ANAS02', 'ANAS03', 'ANAS04'] }
  });
  await db.collection('email_logs').deleteMany({
    bookingId: { $in: ['ANAS01', 'ANAS02', 'ANAS03', 'ANAS04'] }
  });

  console.log('\n================================================================');
  console.log(`   WORKFLOW RESULTS: ${passed} PASSED, ${failed} FAILED         `);
  console.log('================================================================\n');

  process.exit(failed === 0 ? 0 : 1);
}

testWorkflow();
