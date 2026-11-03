/**
 * Diagnostic & Verification Script for Google Gmail API OAuth 2.0
 * 
 * Safely verifies OAuth 2.0 configuration and checks Gmail API permissions.
 * 
 * Usage:
 *   node scripts/verifyGmailOAuth.js
 *     -> Performs safe token refresh & OAuth validation without sending email
 *        and without calling APIs requiring additional scopes beyond gmail.send.
 * 
 *   node scripts/verifyGmailOAuth.js --send-test
 *     -> Calls Gmail API `users.messages.send` with scope `https://www.googleapis.com/auth/gmail.send`
 *        to send a real test email to ADMIN_EMAIL and verifies delivery acceptance.
 * 
 * Safety:
 * - Does NOT open a browser or prompt in the terminal.
 * - Does NOT start any local HTTP server or use localhost callbacks.
 * - Never prints or leaks secrets, client secret, or refresh tokens.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const emailService = require('../services/emailService');

function maskString(str, visibleChars = 4) {
  if (!str) return '(not set)';
  if (str.length <= visibleChars * 2) return '****';
  return str.slice(0, visibleChars) + '...' + str.slice(-visibleChars);
}

async function verify() {
  console.log('================================================================');
  console.log('       GMAIL API OAUTH 2.0 INTEGRATION VERIFICATION            ');
  console.log('================================================================\n');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground';
  const emailUser = process.env.EMAIL_USER;
  const adminEmail = process.env.ADMIN_EMAIL;
  const emailFromName = process.env.EMAIL_FROM_NAME || 'Software Appointment Booking';

  console.log('1. Checking Environment Variables in .env:');
  console.log(`   - GOOGLE_CLIENT_ID     : ${maskString(clientId, 10)}`);
  console.log(`   - GOOGLE_CLIENT_SECRET : ${maskString(clientSecret, 4)} (PROTECTED)`);
  console.log(`   - GOOGLE_REFRESH_TOKEN : ${maskString(refreshToken, 6)} (PROTECTED)`);
  console.log(`   - GOOGLE_REDIRECT_URI  : ${redirectUri}`);
  console.log(`   - EMAIL_USER           : ${emailUser || '(NOT SET)'}`);
  console.log(`   - ADMIN_EMAIL          : ${adminEmail || '(NOT SET)'}`);
  console.log(`   - EMAIL_FROM_NAME      : ${emailFromName}\n`);

  let configError = false;

  if (!clientId || clientId.includes('your-google-oauth-client-id') || clientId.includes('your-google-client-id')) {
    console.error('   ✘ GOOGLE_CLIENT_ID is missing or set to placeholder.');
    configError = true;
  }
  if (!clientSecret || clientSecret.includes('your-google-oauth-client-secret') || clientSecret.includes('your-google-client-secret')) {
    console.error('   ✘ GOOGLE_CLIENT_SECRET is missing or set to placeholder.');
    configError = true;
  }
  if (!refreshToken || refreshToken.includes('your-google-oauth-refresh-token') || refreshToken.includes('your-google-refresh-token')) {
    console.error('   ✘ GOOGLE_REFRESH_TOKEN is missing or set to placeholder.');
    configError = true;
  }
  if (!emailUser) {
    console.error('   ✘ EMAIL_USER is missing.');
    configError = true;
  }
  if (!adminEmail) {
    console.error('   ✘ ADMIN_EMAIL is missing.');
    configError = true;
  }

  if (configError) {
    console.error('\nConfiguration check failed. Please ensure valid credentials are set in .env.\n');
    process.exit(1);
  }

  console.log('   ✔ All required environment variables are present.\n');

  console.log('2. Verifying OAuth 2.0 Credentials (Token Refresh Check):');
  const oauth2Client = emailService.getOAuth2Client();
  if (!oauth2Client) {
    console.error('   ✘ Failed to initialize OAuth2 client from .env configuration.');
    process.exit(1);
  }

  // Safe check without calling APIs that require extra scopes
  try {
    const tokenRes = await oauth2Client.getAccessToken();
    if (!tokenRes || !tokenRes.token) {
      throw new Error('Google OAuth token endpoint did not return an access token.');
    }
    console.log('   ✔ OAuth 2.0 Token Refresh Successful!');
    console.log('   ✔ Valid access token obtained from Google OAuth token endpoint.');
    console.log('   ✔ Refresh token is active, matched with Client ID & Client Secret, and unexpired.\n');
  } catch (tokenErr) {
    console.error('   ✘ OAuth 2.0 Authentication Failed during token refresh!\n');
    const { code, message } = emailService.extractGoogleErrorInfo(tokenErr);
    console.error(`   - Error Code : ${code}`);
    console.error(`   - Details    : ${message}\n`);

    if (message.includes('unauthorized_client') || code === 'unauthorized_client') {
      console.log('   Resolution: The refresh token was not generated with this GOOGLE_CLIENT_ID.');
      console.log('   In OAuth Playground, click the gear icon (⚙️), check "Use your own OAuth credentials",');
      console.log('   and paste your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before authorizing.\n');
    } else if (message.includes('invalid_grant') || code === 'invalid_grant') {
      console.log('   Resolution: The refresh token has expired or been revoked.');
      console.log('   Regenerate a new refresh token using Google OAuth Playground.\n');
    }

    process.exit(1);
  }

  const sendTestArg = process.argv.includes('--send-test');
  if (sendTestArg) {
    console.log('3. Testing Real Email Sending via Gmail API (users.messages.send):');
    console.log(`   - Scope : https://www.googleapis.com/auth/gmail.send`);
    console.log(`   - From  : ${emailUser}`);
    console.log(`   - To    : ${adminEmail}`);

    const testResult = await emailService.sendEmail({
      to: adminEmail,
      subject: `[Test] Software Appointment Booking — Gmail API OAuth 2.0 Test`,
      html: `
        <div style="font-family:sans-serif;padding:24px;border:1px solid #e2e8f0;border-radius:8px;max-width:560px;margin:0 auto;">
          <h2 style="color:#1e3a5f;margin-top:0;">Gmail API OAuth 2.0 Test Successful ✓</h2>
          <p style="color:#334155;line-height:1.6;">
            This email confirms that your appointment booking application has successfully connected to the 
            <strong>Google Gmail API</strong> using OAuth 2.0 and has permission to send messages.
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" />
          <table style="font-size:13px;color:#64748b;width:100%;">
            <tr><td><strong>Sender Account:</strong></td><td>${emailUser}</td></tr>
            <tr><td><strong>Recipient:</strong></td><td>${adminEmail}</td></tr>
            <tr><td><strong>API Method:</strong></td><td>gmail.users.messages.send</td></tr>
            <tr><td><strong>Timestamp:</strong></td><td>${new Date().toISOString()}</td></tr>
          </table>
        </div>
      `,
      type: 'test_verification'
    });

    if (testResult.success) {
      console.log(`\n   ✔ [SUCCESS] Gmail API accepted the email!`);
      console.log(`   ✔ Message ID: ${testResult.messageId}`);
      console.log(`   ✔ Test email successfully delivered to ${adminEmail}.\n`);
      console.log('================================================================');
      console.log('           GMAIL API VERIFICATION COMPLETE: ALL OK              ');
      console.log('================================================================');
      process.exit(0);
    } else {
      console.error(`\n   ✘ [FAILURE] Gmail API rejected the email!`);
      console.error(`   ✘ Error Details: ${testResult.error}\n`);
      console.log('================================================================');
      console.log('           GMAIL API VERIFICATION: FAILED                       ');
      console.log('================================================================');
      process.exit(1);
    }
  } else {
    console.log('3. Gmail API Email Sending Check:');
    console.log('   ℹ Live email sending skipped.');
    console.log('   ℹ To send a real test email to ADMIN_EMAIL, run:');
    console.log('     node scripts/verifyGmailOAuth.js --send-test\n');
    console.log('================================================================');
    console.log('           SAFE AUTHENTICATION CHECK PASSED: OK                 ');
    console.log('================================================================');
    process.exit(0);
  }
}

verify();
