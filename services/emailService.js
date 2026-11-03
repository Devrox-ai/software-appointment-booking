/**
 * Email Service using Google Gmail API with OAuth 2.0
 * 
 * Uses the official `googleapis` library to authenticate via OAuth 2.0
 * and send RFC 2822 / RFC 2046 multipart/alternative base64url encoded messages
 * via `gmail.users.messages.send`.
 * 
 * Scope required: https://www.googleapis.com/auth/gmail.send
 * 
 * Deliverability & Spam Optimization:
 * - Full RFC 2046 `multipart/alternative` with both plain text and styled HTML
 * - Standard RFC 5322 headers: Date, Message-ID, Reply-To, Auto-Submitted, X-Mailer
 * - Idempotency tracking to prevent duplicate emails for repeated admin actions
 * - Safe error logging and delivery auditing in MongoDB `email_logs`
 */

require('dotenv').config();
const crypto = require('crypto');
const { google } = require('googleapis');
const { getDB } = require('../config/database');

/**
 * Returns an authenticated Google OAuth2 client or null if credentials are not configured.
 */
function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground';

  // Check if credentials exist and are not empty / placeholders
  if (!clientId || !clientSecret || !refreshToken ||
      clientId.includes('your-google-oauth-client-id') ||
      clientId.includes('your-google-client-id') ||
      clientSecret.includes('your-google-oauth-client-secret') ||
      clientSecret.includes('your-google-client-secret') ||
      refreshToken.includes('your-google-oauth-refresh-token') ||
      refreshToken.includes('your-google-refresh-token')) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/**
 * Safely extracts error code and message from Google API / Gaxios errors
 * preventing [object Object] serialization.
 */
function extractGoogleErrorInfo(err) {
  if (!err) return { code: 'UNKNOWN_ERROR', message: 'Unknown error occurred' };

  let code = err.code || (err.response && err.response.status) || 'ERROR';
  let message = err.message || 'Unknown error occurred';

  const data = err.response && err.response.data;
  if (data) {
    if (typeof data === 'object') {
      if (data.error && typeof data.error === 'object') {
        // Standard Google REST API format: { error: { code: 403, message: "...", status: "..." } }
        code = data.error.code || code;
        message = data.error.message || message;
      } else if (typeof data.error === 'string') {
        // OAuth2 Token Endpoint format: { error: "invalid_grant", error_description: "..." }
        code = data.error;
        message = data.error_description || data.error;
      }
    } else if (typeof data === 'string') {
      message = data;
    }
  }

  return {
    code: String(code || 'ERROR'),
    message: String(message || 'Unknown error')
  };
}

/**
 * Categorizes and formats OAuth / Gmail API errors into clean, informative messages
 * without leaking secrets, tokens, or credentials.
 */
function categorizeOAuthError(err) {
  const { code, message } = extractGoogleErrorInfo(err);
  
  if (message.includes('unauthorized_client') || code === 'unauthorized_client') {
    return `OAuth Error [unauthorized_client]: The refresh token was not generated with this GOOGLE_CLIENT_ID. Please regenerate the refresh token in Google OAuth Playground using your own Client ID and Client Secret.`;
  }
  if (message.includes('invalid_grant') || code === 'invalid_grant') {
    return `OAuth Error [invalid_grant]: The refresh token has expired, been revoked, or is invalid. Please regenerate a new refresh token using Google OAuth Playground.`;
  }
  if (message.includes('invalid_client') || code === 'invalid_client') {
    return `OAuth Error [invalid_client]: The GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env is incorrect.`;
  }
  if (message.includes('insufficient authentication scopes') || message.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
    return `Gmail API Scope Error [${code}]: Request had insufficient authentication scopes (${message}). Ensure "https://www.googleapis.com/auth/gmail.send" is authorized.`;
  }
  
  return `Google API Error [${code}]: ${message}`;
}

/**
 * Performs a safe authentication/token check without sending an email
 * and without calling APIs requiring additional scopes beyond OAuth token refresh.
 */
async function verifyOAuthToken(oauth2Client) {
  try {
    const client = oauth2Client || getOAuth2Client();
    if (!client) {
      return { valid: false, error: 'Gmail API OAuth credentials not configured in .env.' };
    }
    const tokenRes = await client.getAccessToken();
    if (tokenRes && tokenRes.token) {
      return { valid: true };
    }
    return { valid: false, error: 'No access token returned by OAuth provider.' };
  } catch (err) {
    return { valid: false, error: categorizeOAuthError(err) };
  }
}

/**
 * Creates an RFC 2822 / RFC 2046 multipart/alternative MIME message and base64url encodes it.
 * Providing both text/plain and text/html prevents MIME_HTML_ONLY spam flagging.
 */
function makeBase64UrlEmail({ to, from, fromName, subject, html, text }) {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const sanitizedFromName = (fromName || 'Software Appointment Booking').replace(/["\r\n]/g, '').trim();
  const senderHeader = `"${sanitizedFromName}" <${from}>`;
  const boundary = `----=_Part_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  
  const fromDomain = from.includes('@') ? from.split('@')[1] : 'appointmentbooking.local';
  const messageId = `<sab.${Date.now()}.${crypto.randomBytes(6).toString('hex')}@${fromDomain}>`;
  const rfcDate = new Date().toUTCString();

  // Plain-text alternative fallback if text wasn't provided
  const plainText = text || html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<td[^>]*>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n\s+\n/g, '\n\n')
    .trim();

  const emailLines = [
    `From: ${senderHeader}`,
    `To: ${to}`,
    `Reply-To: ${from}`,
    `Date: ${rfcDate}`,
    `Message-ID: ${messageId}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated',
    'X-Auto-Response-Suppress: All',
    'X-Mailer: TechNova Software Appointment Booking System',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    plainText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    `--${boundary}--`
  ];

  const rawMessage = emailLines.join('\r\n');
  return Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
}

/**
 * Sends an email using Google Gmail API with OAuth 2.0 (gmail.users.messages.send).
 * Features idempotency tracking to prevent duplicate sends on repeated action submissions.
 * Logs result to MongoDB email_logs collection.
 * Does not throw so calling routes are never broken by email errors.
 */
async function sendEmail({ to, subject, html, text, type, bookingId, allowDuplicate = false }) {
  const senderEmail = process.env.EMAIL_USER;
  const fromName = process.env.EMAIL_FROM_NAME || 'Software Appointment Booking';

  let logEntry = {
    provider: 'gmail_api_oauth2',
    to,
    from: senderEmail || 'NOT_CONFIGURED',
    subject,
    type: type || 'general',
    bookingId: bookingId || null,
    status: 'failed',
    messageId: null,
    error: null,
    sentAt: new Date()
  };

  if (!senderEmail) {
    const errorMsg = 'EMAIL_USER is not configured in .env. Sender address is required.';
    console.warn(`⚠ [Gmail API] Skipped send to ${to}: ${errorMsg}`);
    logEntry.status = 'unauthorized';
    logEntry.error = errorMsg;
    await logToDB(logEntry);
    return { success: false, error: errorMsg };
  }

  if (!to || !to.includes('@')) {
    const errorMsg = `Recipient email address (${to || 'undefined'}) is missing or invalid.`;
    console.warn(`⚠ [Gmail API] Skipped send: ${errorMsg}`);
    logEntry.status = 'failed';
    logEntry.error = errorMsg;
    await logToDB(logEntry);
    return { success: false, error: errorMsg };
  }

  // Idempotency: prevent sending the exact same notification twice for the same booking
  if (!allowDuplicate && bookingId && type && type !== 'general' && type !== 'test_verification') {
    try {
      const db = getDB();
      if (db) {
        const existingSent = await db.collection('email_logs').findOne({
          bookingId: String(bookingId),
          type,
          status: 'sent'
        });
        if (existingSent) {
          console.log(`ℹ [Gmail API] Duplicate email prevented: ${type} for booking SAB-${bookingId} already sent at ${existingSent.sentAt}.`);
          return { success: true, messageId: existingSent.messageId, skippedDuplicate: true };
        }
      }
    } catch (dbCheckErr) {
      // Continue if DB check fails
    }
  }

  try {
    const oauth2Client = getOAuth2Client();

    if (!oauth2Client) {
      const missingMsg = 'Gmail API OAuth credentials not configured in .env (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN are required).';
      console.warn(`⚠ [Gmail API] Skipped send to ${to}: ${missingMsg}`);
      logEntry.status = 'unauthorized';
      logEntry.error = missingMsg;
      await logToDB(logEntry);
      return { success: false, error: missingMsg };
    }

    const raw = makeBase64UrlEmail({
      to,
      from: senderEmail,
      fromName,
      subject,
      html,
      text
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });

    if (response && response.data && response.data.id) {
      logEntry.status = 'sent';
      logEntry.messageId = response.data.id;
      logEntry.threadId = response.data.threadId || null;
      console.log(`✔ [Gmail API] Email sent to ${to} [Type: ${type}] (Message ID: ${response.data.id})`);
      await logToDB(logEntry);
      return { success: true, messageId: response.data.id };
    } else {
      throw new Error('Gmail API response did not contain message ID');
    }
  } catch (err) {
    const sanitizedError = categorizeOAuthError(err);
    console.error(`✘ [Gmail API Error] Failed to send email to ${to}:`, sanitizedError);
    logEntry.status = 'failed';
    logEntry.error = sanitizedError;
    await logToDB(logEntry);
    return { success: false, error: sanitizedError };
  }
}

async function logToDB(entry) {
  try {
    const db = getDB();
    if (db) {
      await db.collection('email_logs').insertOne(entry);
    }
  } catch (dbErr) {
    if (!dbErr.message || !dbErr.message.includes('not initialized')) {
      console.error('Failed to write to email_logs:', dbErr.message);
    }
  }
}

// ─── EMAIL TEMPLATES ───────────────────────────────────────────────────────────

/**
 * EMAIL 1: New Booking Request Notification to Admin
 * Delivered to ADMIN_EMAIL configured in .env.
 */
async function sendAdminNewBookingAlert(booking, serviceName) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn('⚠ [Gmail API] ADMIN_EMAIL is not configured in .env. Cannot deliver new booking alert.');
    return { success: false, error: 'ADMIN_EMAIL is not configured in .env' };
  }

  const companyName = process.env.EMAIL_FROM_NAME || 'TechNova Software Solutions';
  const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
  const dashboardUrl = `${siteUrl}/admin/bookings/${booking._id || ''}`;

  const plainText = [
    `NEW CONSULTATION REQUEST: SAB-${booking.bookingId}`,
    `==================================================`,
    ``,
    `A new appointment booking has been submitted and requires your review:`,
    ``,
    `Booking Reference : SAB-${booking.bookingId}`,
    `Customer Name     : ${booking.customerName}`,
    `Customer Email    : ${booking.customerEmail}`,
    `Customer Phone    : ${booking.customerPhone}`,
    `Company           : ${booking.customerCompany || 'N/A'}`,
    `Selected Service  : ${serviceName}`,
    `Appointment Date  : ${formatDate(booking.appointmentDate)}`,
    `Appointment Time  : ${booking.appointmentTime} (Asia/Kolkata)`,
    `Status            : Pending Review`,
    ``,
    `Project Requirements:`,
    `${booking.projectDescription}`,
    ``,
    `Review this booking in your Admin Dashboard:`,
    dashboardUrl,
    ``,
    `--`,
    `${companyName} Internal Management System`
  ].join('\n');

  const html = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:8px;color:#1e293b;">
      <div style="background:#0f172a;color:#ffffff;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;font-weight:600;">Internal Notification</span>
        <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;">New Consultation Request</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#cbd5e1;">A new client appointment has been submitted for admin review</p>
      </div>
      <div style="background:#ffffff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;width:35%;">Booking Reference</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:700;color:#0f172a;">SAB-${booking.bookingId}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Customer Name</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">${booking.customerName}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Customer Email</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;"><a href="mailto:${booking.customerEmail}" style="color:#2563eb;text-decoration:none;">${booking.customerEmail}</a></td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Customer Phone</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">${booking.customerPhone}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Company Name</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">${booking.customerCompany || 'N/A'}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Selected Service</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;color:#0f172a;">${serviceName}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Appointment Date</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">${formatDate(booking.appointmentDate)}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Appointment Time</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">${booking.appointmentTime} (Asia/Kolkata)</td></tr>
          <tr><td style="padding:10px 0;color:#64748b;">Current Status</td><td style="padding:10px 0;"><span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">Pending Review</span></td></tr>
        </table>
        
        <div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:6px;border-left:4px solid #2563eb;">
          <strong style="color:#0f172a;display:block;margin-bottom:6px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Project Requirements:</strong>
          <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${booking.projectDescription}</p>
        </div>

        <div style="text-align:center;margin-top:28px;">
          <a href="${dashboardUrl}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;display:inline-block;">Open Booking in Admin Dashboard</a>
        </div>
      </div>
    </div>`;

  return await sendEmail({
    to: adminEmail,
    subject: `[New Consultation Request] SAB-${booking.bookingId} — ${booking.customerName} (${serviceName})`,
    html,
    text: plainText,
    type: 'admin_notification',
    bookingId: booking.bookingId
  });
}

/**
 * EMAIL 2: Booking Received Confirmation to Customer
 * Informs customer that their booking was received and is under review.
 */
async function sendBookingConfirmation(booking, serviceName) {
  const companyName = process.env.EMAIL_FROM_NAME || 'TechNova Software Solutions';
  const customerEmail = booking.customerEmail;

  if (!customerEmail) {
    return { success: false, error: 'Customer email is missing.' };
  }

  const plainText = [
    `CONSULTATION REQUEST RECEIVED: SAB-${booking.bookingId}`,
    `======================================================`,
    ``,
    `Dear ${booking.customerName},`,
    ``,
    `Thank you for requesting a consultation with ${companyName}.`,
    `We have successfully received your booking request. Our engineering team is currently reviewing your project details.`,
    ``,
    `PLEASE NOTE: Your appointment is currently pending review. It is not confirmed yet.`,
    `You will receive an official confirmation email once our team reviews and approves your slot.`,
    ``,
    `Booking Summary:`,
    `- Reference ID : SAB-${booking.bookingId}`,
    `- Service      : ${serviceName}`,
    `- Date         : ${formatDate(booking.appointmentDate)}`,
    `- Time         : ${booking.appointmentTime} (Asia/Kolkata)`,
    `- Status       : Pending Review`,
    ``,
    `If you have any questions or additional requirements to share, simply reply to this email.`,
    ``,
    `Warm regards,`,
    `${companyName} Consultation Team`
  ].join('\n');

  const html = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:8px;color:#1e293b;">
      <div style="background:#0f172a;color:#ffffff;padding:26px 24px;text-align:center;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:22px;font-weight:700;">Appointment Request Received</h1>
        <p style="margin:6px 0 0;font-size:14px;color:#cbd5e1;">Your request is under review by our technical team</p>
      </div>
      <div style="background:#ffffff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:15px;color:#1e293b;margin-top:0;">Dear <strong>${booking.customerName}</strong>,</p>
        <p style="font-size:14px;color:#475569;line-height:1.6;">
          Thank you for reaching out to <strong>${companyName}</strong>. We have received your consultation booking request.
        </p>

        <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:14px;margin:18px 0;border-radius:4px;">
          <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.5;">
            <strong>Status Notice:</strong> Your appointment request is currently <strong>pending admin approval</strong>. You will receive an official confirmation email as soon as our team confirms your scheduled slot.
          </p>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0;">
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;width:35%;">Booking Reference</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:700;color:#2563eb;">SAB-${booking.bookingId}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Service Requested</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">${serviceName}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Requested Date</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">${formatDate(booking.appointmentDate)}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Requested Time</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">${booking.appointmentTime} (Asia/Kolkata)</td></tr>
          <tr><td style="padding:10px 0;color:#64748b;">Current Status</td><td style="padding:10px 0;"><span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">Pending Review</span></td></tr>
        </table>

        <p style="font-size:13px;color:#64748b;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:16px;">
          Have questions or need to make adjustments? Simply reply directly to this email to get in touch with our team.
        </p>
      </div>
      <div style="text-align:center;padding:16px 0 0;font-size:12px;color:#94a3b8;">
        &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
      </div>
    </div>`;

  return await sendEmail({
    to: customerEmail,
    subject: `Appointment Request Received — SAB-${booking.bookingId}`,
    html,
    text: plainText,
    type: 'customer_received',
    bookingId: booking.bookingId
  });
}

/**
 * EMAIL 3: Booking Accepted Confirmation to Customer
 */
async function sendBookingAccepted(booking, serviceName) {
  const companyName = process.env.EMAIL_FROM_NAME || 'TechNova Software Solutions';
  const customerEmail = booking.customerEmail;

  if (!customerEmail) {
    return { success: false, error: 'Customer email is missing.' };
  }

  const plainText = [
    `APPOINTMENT CONFIRMED: SAB-${booking.bookingId}`,
    `==============================================`,
    ``,
    `Dear ${booking.customerName},`,
    ``,
    `Great news! Your software consultation with ${companyName} has been officially CONFIRMED.`,
    ``,
    `Confirmed Appointment Details:`,
    `- Reference ID : SAB-${booking.bookingId}`,
    `- Service      : ${serviceName}`,
    `- Date         : ${formatDate(booking.appointmentDate)}`,
    `- Time         : ${booking.appointmentTime} (Asia/Kolkata)`,
    `- Status       : Confirmed`,
    ``,
    `What to prepare:`,
    `Please ensure you have any project briefs, architectural notes, wireframes, or questions ready for our session.`,
    ``,
    `If you need to reschedule or have any questions ahead of time, please reply directly to this email.`,
    ``,
    `We look forward to meeting with you!`,
    ``,
    `Warm regards,`,
    `${companyName} Consultation Team`
  ].join('\n');

  const html = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:8px;color:#1e293b;">
      <div style="background:#059669;color:#ffffff;padding:26px 24px;text-align:center;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:22px;font-weight:700;">Appointment Confirmed! &#10003;</h1>
        <p style="margin:6px 0 0;font-size:14px;color:#d1fae5;">Your software consultation is officially scheduled</p>
      </div>
      <div style="background:#ffffff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:15px;color:#1e293b;margin-top:0;">Dear <strong>${booking.customerName}</strong>,</p>
        <p style="font-size:14px;color:#475569;line-height:1.6;">
          We are pleased to inform you that your consultation request has been <strong>approved and confirmed</strong>. Our engineering consultation team looks forward to meeting with you to discuss your project.
        </p>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0;">
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;width:35%;">Booking Reference</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:700;color:#059669;">SAB-${booking.bookingId}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Service</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">${serviceName}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Confirmed Date</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">${formatDate(booking.appointmentDate)}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;">Confirmed Time</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-weight:600;">${booking.appointmentTime} (Asia/Kolkata)</td></tr>
          <tr><td style="padding:10px 0;color:#64748b;">Status</td><td style="padding:10px 0;"><span style="background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">Confirmed</span></td></tr>
        </table>

        <div style="background:#f0fdf4;border-left:4px solid #059669;padding:14px;margin:20px 0;border-radius:4px;">
          <strong style="color:#065f46;font-size:13px;display:block;margin-bottom:4px;">Session Preparation:</strong>
          <p style="margin:0;font-size:13px;color:#166534;line-height:1.5;">
            Please ensure you have any relevant documents, wireframes, or technical notes ready for our session.
          </p>
        </div>

        <p style="font-size:13px;color:#64748b;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:16px;">
          Need to reschedule? Simply reply directly to this email at least 24 hours in advance.
        </p>
      </div>
      <div style="text-align:center;padding:16px 0 0;font-size:12px;color:#94a3b8;">
        &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
      </div>
    </div>`;

  return await sendEmail({
    to: customerEmail,
    subject: `Appointment Confirmed — SAB-${booking.bookingId}`,
    html,
    text: plainText,
    type: 'customer_accepted',
    bookingId: booking.bookingId
  });
}

/**
 * EMAIL 4a: Booking Rejected Notification to Customer
 */
async function sendBookingRejected(booking, serviceName, reason) {
  const companyName = process.env.EMAIL_FROM_NAME || 'TechNova Software Solutions';
  const customerEmail = booking.customerEmail;

  if (!customerEmail) {
    return { success: false, error: 'Customer email is missing.' };
  }

  const plainText = [
    `APPOINTMENT REQUEST UPDATE: SAB-${booking.bookingId}`,
    `===================================================`,
    ``,
    `Dear ${booking.customerName},`,
    ``,
    `Thank you for your interest in consultation services with ${companyName}.`,
    `We regret to inform you that we are unable to accommodate your requested slot on ${formatDate(booking.appointmentDate)} at ${booking.appointmentTime}.`,
    ``,
    `Reason: ${reason || 'Schedule conflicts with existing project deliverables.'}`,
    ``,
    `The requested time slot has been released. You are warmly welcome to choose an alternative date or time that suits your schedule.`,
    ``,
    `If you would like assistance picking an alternative time, please reply to this email.`,
    ``,
    `Sincerely,`,
    `${companyName} Consultation Team`
  ].join('\n');

  const html = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:8px;color:#1e293b;">
      <div style="background:#334155;color:#ffffff;padding:26px 24px;text-align:center;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:22px;font-weight:700;">Appointment Request Update</h1>
        <p style="margin:6px 0 0;font-size:14px;color:#cbd5e1;">Notice regarding your consultation request</p>
      </div>
      <div style="background:#ffffff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:15px;color:#1e293b;margin-top:0;">Dear <strong>${booking.customerName}</strong>,</p>
        <p style="font-size:14px;color:#475569;line-height:1.6;">
          Thank you for requesting a consultation with <strong>${companyName}</strong>. We regret to inform you that your request for <strong>${formatDate(booking.appointmentDate)} at ${booking.appointmentTime}</strong> could not be approved at this time.
        </p>

        <div style="background:#f8fafc;border-left:4px solid #64748b;padding:14px;margin:18px 0;border-radius:4px;">
          <strong style="color:#334155;font-size:13px;display:block;margin-bottom:4px;">Reason:</strong>
          <p style="margin:0;color:#475569;font-size:14px;">${reason || 'Schedule conflicts with existing project deliverables.'}</p>
        </div>

        <p style="font-size:14px;color:#475569;line-height:1.6;">
          You are warmly invited to choose an alternative date or time slot that works best for your schedule.
        </p>

        <p style="font-size:13px;color:#64748b;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:16px;">
          If you need personal assistance scheduling an alternative time, please reply directly to this email.
        </p>
      </div>
      <div style="text-align:center;padding:16px 0 0;font-size:12px;color:#94a3b8;">
        &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
      </div>
    </div>`;

  return await sendEmail({
    to: customerEmail,
    subject: `Appointment Request Update — SAB-${booking.bookingId}`,
    html,
    text: plainText,
    type: 'customer_rejected',
    bookingId: booking.bookingId
  });
}

/**
 * EMAIL 4b: Booking Cancelled Notification to Customer
 */
async function sendBookingCancelled(booking, serviceName, reason) {
  const companyName = process.env.EMAIL_FROM_NAME || 'TechNova Software Solutions';
  const customerEmail = booking.customerEmail;

  if (!customerEmail) {
    return { success: false, error: 'Customer email is missing.' };
  }

  const plainText = [
    `APPOINTMENT CANCELLED: SAB-${booking.bookingId}`,
    `=============================================`,
    ``,
    `Dear ${booking.customerName},`,
    ``,
    `Your previously confirmed appointment SAB-${booking.bookingId} on ${formatDate(booking.appointmentDate)} at ${booking.appointmentTime} has been cancelled.`,
    ``,
    `Cancellation Reason: ${reason || 'Cancelled by administration.'}`,
    ``,
    `We sincerely apologize for any inconvenience caused. The appointment slot has been released.`,
    `If you would like to reschedule at another time, please reply directly to this email.`,
    ``,
    `Sincerely,`,
    `${companyName} Consultation Team`
  ].join('\n');

  const html = `
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:8px;color:#1e293b;">
      <div style="background:#334155;color:#ffffff;padding:26px 24px;text-align:center;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:22px;font-weight:700;">Appointment Cancelled</h1>
        <p style="margin:6px 0 0;font-size:14px;color:#cbd5e1;">Notice regarding your scheduled consultation</p>
      </div>
      <div style="background:#ffffff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:15px;color:#1e293b;margin-top:0;">Dear <strong>${booking.customerName}</strong>,</p>
        <p style="font-size:14px;color:#475569;line-height:1.6;">
          Your previously confirmed appointment <strong>SAB-${booking.bookingId}</strong> for <strong>${formatDate(booking.appointmentDate)} at ${booking.appointmentTime}</strong> has been cancelled.
        </p>

        <div style="background:#f8fafc;border-left:4px solid #64748b;padding:14px;margin:18px 0;border-radius:4px;">
          <strong style="color:#334155;font-size:13px;display:block;margin-bottom:4px;">Cancellation Note:</strong>
          <p style="margin:0;color:#475569;font-size:14px;">${reason || 'Cancelled by administration.'}</p>
        </div>

        <p style="font-size:14px;color:#475569;line-height:1.6;">
          We apologize for any inconvenience this may cause and would be happy to reschedule at your earliest convenience.
        </p>

        <p style="font-size:13px;color:#64748b;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:16px;">
          If you have questions or want to reschedule, please reply directly to this email.
        </p>
      </div>
      <div style="text-align:center;padding:16px 0 0;font-size:12px;color:#94a3b8;">
        &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
      </div>
    </div>`;

  return await sendEmail({
    to: customerEmail,
    subject: `Appointment Cancelled — SAB-${booking.bookingId}`,
    html,
    text: plainText,
    type: 'customer_cancelled',
    bookingId: booking.bookingId
  });
}

module.exports = {
  getOAuth2Client,
  extractGoogleErrorInfo,
  categorizeOAuthError,
  verifyOAuthToken,
  sendEmail,
  sendAdminNewBookingAlert,
  sendBookingConfirmation,
  sendBookingAccepted,
  sendBookingRejected,
  sendBookingCancelled
};
