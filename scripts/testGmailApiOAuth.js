/**
 * Unit Test for Gmail API OAuth 2.0 Integration
 */

require('dotenv').config();
const { google } = require('googleapis');
const emailService = require('../services/emailService');
const { connectDB } = require('../config/database');

async function testGmailApi() {
  console.log('================================================================');
  console.log('         TESTING GMAIL API OAUTH 2.0 IMPLEMENTATION             ');
  console.log('================================================================\n');

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

  const db = await connectDB();

  // Test 1: Verify googleapis package is available
  assert(typeof google.gmail === 'function', 'googleapis library is properly imported and provides gmail API');

  // Test 2: Test OAuth2 Client initialization logic with sample credentials
  const dummyClientId = '322541593793-eqat34nj3fgfqjnml9551gv96qkuf6ch.apps.googleusercontent.com';
  const dummyClientSecret = 'dummy-client-secret';
  const dummyRedirectUri = 'https://developers.google.com/oauthplayground';

  const oauth2Client = new google.auth.OAuth2(dummyClientId, dummyClientSecret, dummyRedirectUri);
  assert(oauth2Client !== null, 'Google OAuth2 client initialized successfully with OAuth Playground redirect URI');

  // Test 3: Verify OAuth consent URL generation has correct scope and access_type
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.send']
  });
  assert(authUrl.includes('access_type=offline'), 'OAuth URL includes access_type=offline');
  assert(authUrl.includes('gmail.send'), 'OAuth URL includes scope https://www.googleapis.com/auth/gmail.send');
  assert(authUrl.includes('prompt=consent'), 'OAuth URL includes prompt=consent');

  // Test 4: Verify emailService returns success=false when credentials are placeholder (No fake success)
  const savedSecret = process.env.GOOGLE_CLIENT_SECRET;
  try {
    process.env.GOOGLE_CLIENT_SECRET = 'your-google-oauth-client-secret';
    const failResult = await emailService.sendAdminNewBookingAlert({
      bookingId: 'TESTOAUTH_FAIL',
      customerName: 'Test Client',
      customerEmail: 'client@example.com',
      customerPhone: '+91 9999999999',
      customerCompany: 'Dummy Corp',
      projectDescription: 'Sample project requirements',
      appointmentDate: '2026-11-25',
      appointmentTime: '15:00'
    }, 'Web Application Development');

    assert(failResult.success === false, 'sendEmail returns success=false on placeholder credentials (No fake success)');
  } finally {
    process.env.GOOGLE_CLIENT_SECRET = savedSecret;
  }

  // Test 5: Verify status in MongoDB email_logs is captured without exposing secrets
  const log = await db.collection('email_logs').findOne({ bookingId: 'TESTOAUTH_FAIL' });
  assert(log !== null, 'Log record created in email_logs');
  assert(log && log.provider === 'gmail_api_oauth2', 'Provider is correctly recorded as gmail_api_oauth2');
  assert(log && (log.status === 'unauthorized' || log.status === 'failed'), 'Status is marked as unauthorized or failed');
  assert(log && !log.clientSecret && !log.refreshToken, 'No OAuth secrets or tokens exposed in MongoDB logs');

  // Clean up
  await db.collection('email_logs').deleteMany({ bookingId: { $in: ['TESTOAUTH', 'TESTOAUTH_FAIL'] } });

  console.log('\n================================================================');
  console.log(`   GMAIL API TESTS: ${passed} PASSED, ${failed} FAILED          `);
  console.log('================================================================\n');

  process.exit(failed === 0 ? 0 : 1);
}

testGmailApi();
