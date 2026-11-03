# Software Consultation & Services Appointment Booking System

A complete, production-grade Software Services Appointment Booking web application built with **Node.js**, **Express.js**, **EJS**, and the native **MongoDB driver** (`mongodb`).

Features full customer booking workflow, server-side duplicate-booking prevention with unique compound indexes, admin approval/rejection/cancellation workflow, dynamic interactive calendar, and transactional HTML email notifications via official Google Gmail API with OAuth 2.0 (`googleapis`).

---

## 🌟 Key Features

1. **Modern Customer Portal:**
   - Premium, clean responsive UI (Mobile, Tablet, Desktop)
   - Category-wise software services display
   - Interactive 4-step consultation booking wizard
   - Real-time date & time slot availability checking (Asia/Kolkata timezone)
   - Instant booking reference generation (`SAB-XXXXXX`)
   - Detailed booking confirmation status page

2. **Bulletproof Double-Booking Prevention:**
   - Server-side slot availability validation
   - Native MongoDB compound index `{ appointmentDate: 1, appointmentTime: 1 }` with partial filter expression `{ status: { $in: ['pending', 'accepted'] } }`
   - Atomic database-level guarantee preventing two customers from reserving the same slot simultaneously
   - Immediate slot reservation upon `Pending` submission
   - Automatic slot release if booking is `Rejected` or `Cancelled`

3. **Secure Admin Dashboard:**
   - Session-based authentication with bcrypt-hashed credentials
   - Dashboard with live metrics (Total, Pending, Accepted, Rejected, Cancelled)
   - Filterable & paginated bookings table
   - Comprehensive booking detail view with customer information & project description
   - One-click **Accept**, **Reject** (with reason), and **Cancel** (with reason) actions
   - Interactive monthly calendar with color-coded appointment badges
   - Dynamic date blocking & unblocking directly from the calendar or blocked dates management
   - Services management (Add, Edit, Toggle Active/Inactive)
   - Working days and working hours configuration

4. **Official Google Gmail API OAuth 2.0 Email System:**
   - **Email 1:** New Booking Alert to Admin (`anasshaikh00456@gmail.com`)
   - **Email 2:** Booking Received Confirmation to Customer (Pending Approval)
   - **Email 3:** Booking Accepted Notification to Customer (Confirmed)
   - **Email 4:** Booking Rejected / Cancelled Notification to Customer (with reasons)
   - Uses official `googleapis` library with RFC 2822 base64url MIME encoding
   - Structured logging of all outgoing emails to MongoDB `email_logs` collection
   - Full setup documentation in `GOOGLE_GMAIL_SETUP.md` with token generator script
   - Graceful fallback: email delivery failures never crash bookings or alter appointment states

---

## 🛠️ Technology Stack

- **Runtime:** Node.js (v16+)
- **Web Framework:** Express.js 4.x
- **Template Engine:** EJS
- **Database:** MongoDB (Native Driver `mongodb` 6.x — *No Mongoose*)
- **Authentication:** `express-session`, `bcrypt`
- **Email Service:** Google Gmail API with OAuth 2.0 (`googleapis`)
- **Security:** CSRF session tokens, input sanitation, rate limiting, HttpOnly cookies

---

## 📂 Project Structure

```
software-appointment-booking/
├── app.js                    # Main application entry point & Express server
├── package.json              # Dependencies and scripts
├── .env                      # Environment variables (private, git-ignored)
├── .env.example              # Example environment configuration template
├── .gitignore                # Git ignore rules
├── GOOGLE_GMAIL_SETUP.md     # Step-by-step Gmail API OAuth 2.0 setup guide
├── config/
│   ├── database.js           # Native MongoDB connection & index initialization
│   └── settings.js           # Application & scheduling configuration
├── middleware/
│   └── auth.js               # Admin authentication guard & CSRF verification
├── routes/
│   ├── public.js             # Public pages (Home, About, Services, Contact, Terms, Privacy)
│   ├── booking.js            # Appointment booking routes & submission handling
│   ├── api.js                # AJAX endpoints (Available slots, blocked dates, calendar data)
│   └── admin.js              # Admin dashboard, bookings, calendar, services, settings
├── services/
│   └── emailService.js       # Google Gmail API OAuth 2.0 email service & email_logs writer
├── views/
│   ├── partials/
│   │   ├── header.ejs        # Responsive top navbar with active states
│   │   └── footer.ejs        # 4-column footer with social links & copyright
│   ├── appointments/
│   │   ├── book.ejs          # 4-step consultation booking wizard
│   │   └── success.ejs       # Booking confirmation / pending approval page
│   ├── admin/
│   │   ├── login.ejs         # Admin login page
│   │   ├── dashboard.ejs     # Metric cards, today's appointments, recent bookings
│   │   ├── bookings.ejs      # Paginated booking management with status filters
│   │   ├── booking-detail.ejs# Full booking review, approval/rejection actions
│   │   ├── calendar.ejs      # Monthly calendar with day inspection & date blocking
│   │   ├── blocked-dates.ejs # Dedicated blocked dates management
│   │   ├── services.ejs      # Software services CRUD & active/inactive toggles
│   │   └── settings.ejs      # Working days, hours, slot duration & company info
│   ├── home.ejs              # Homepage with hero, services grid, how it works, CTA
│   ├── about.ejs             # Company story, mission, vision & values
│   ├── services.ejs          # Full customer-facing services showcase
│   ├── contact.ejs           # Contact form and company contact information
│   ├── privacy.ejs           # Privacy policy
│   ├── terms.ejs             # Terms and conditions
│   └── error.ejs             # Contextual error page (404, 403, 500)
├── public/
│   ├── css/
│   │   ├── style.css         # Main stylesheet for public pages & components
│   │   └── admin.css         # Admin dashboard layout, calendar, stat cards
│   └── js/
│       ├── main.js           # Navigation, alert auto-dismiss, modal handlers
│       ├── booking.js        # Multi-step booking wizard & AJAX slot loader
│       └── admin.js          # Admin calendar renderer, day inspector, modals
└── scripts/
    ├── createAdmin.js        # Admin account creation & database seeding script
    ├── verifyGmailOAuth.js   # OAuth 2.0 connection verification & test email script
    ├── testEmailWorkflow.js  # Automated email and booking workflow test
    ├── testGmailApiOAuth.js  # Unit tests for Gmail API OAuth 2.0 integration
    └── testSuite.js          # Complete end-to-end booking verification test
```

---

## 🚀 Step-by-Step Setup Guide

### 1. Prerequisites
- **Node.js** installed (v16.0.0 or higher).
- **MongoDB** running locally (`mongodb://localhost:27017`) or a free **MongoDB Atlas** cluster.

### 2. Install Dependencies
Open PowerShell or your command prompt in the project root:
```powershell
cd C:\Anas-1\software-appointment-booking
npm install
```

### 3. Configure Environment Variables
Open `.env` in the root folder and configure your settings:

```ini
PORT=3000
MONGO_URI=mongodb://localhost:27017
DB_NAME=software_appointment_booking
SESSION_SECRET=super-secret-random-key-change-this

# Admin Credentials
ADMIN_EMAIL=your-admin-email@gmail.com
ADMIN_PASSWORD=admin123

# Google Gmail API OAuth2 Configuration (via OAuth 2.0 Playground)
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REFRESH_TOKEN=your-google-oauth-refresh-token
GOOGLE_REDIRECT_URI=https://developers.google.com/oauthplayground

# Gmail Sender Configuration
EMAIL_USER=your-sender-gmail@gmail.com
EMAIL_FROM_NAME=Software Appointment Booking
SITE_URL=http://localhost:3000
```

#### How to Configure Gmail API OAuth 2.0:
See the detailed guide in [GOOGLE_GMAIL_SETUP.md](GOOGLE_GMAIL_SETUP.md) for step-by-step instructions:
1. In Google Cloud Console, enable **Gmail API**.
2. Create an OAuth 2.0 Web Client and add `https://developers.google.com/oauthplayground` as an **Authorized redirect URI**.
3. Use [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground) with your own Client ID & Secret (gear icon ⚙️) to authorize `https://www.googleapis.com/auth/gmail.send`.
4. Exchange authorization code for a `Refresh token` and set `GOOGLE_REFRESH_TOKEN` in `.env`.
5. Run `node scripts/verifyGmailOAuth.js` to test authentication.

### 4. Seed Database & Create Admin
Run the automated initialization script:
```powershell
node scripts/createAdmin.js
```
This script will:
- Connect to MongoDB
- Initialize unique database indexes
- Create your administrator account
- Seed the 10 software service categories
- Seed default scheduling settings (Monday to Saturday, 10:00 AM – 6:00 PM, 30 min duration)

### 5. Start the Server
```powershell
npm start
```
The server will start at:
- **Public Website:** `http://localhost:3000`
- **Admin Dashboard:** `http://localhost:3000/admin/login`

---

## 🧪 Testing the Complete Workflow

1. **Browse Website:**
   - Open `http://localhost:3000` to view the homepage.
   - Click "Book Consultation" or go to `http://localhost:3000/book`.
2. **Book an Appointment:**
   - Step 1: Select "Web Application Development".
   - Step 2: Fill in Name, Email, Phone, and Project Description.
   - Step 3: Pick tomorrow's date from the interactive calendar. Select an available time slot (e.g., `10:00 AM`).
   - Step 4: Review the summary and click **Confirm Booking**.
   - You will see the confirmation screen with your `SAB-XXXXXX` reference ID in **Pending Approval** state.
3. **Verify Double-Booking Protection:**
   - In another browser tab, try booking the **exact same date and time slot**.
   - Notice that the slot no longer appears in the slot picker, and if forced via form, MongoDB immediately blocks it with a duplicate key error!
4. **Admin Approval:**
   - Go to `http://localhost:3000/admin/login`.
   - Log in with `admin@example.com` / `admin123`.
   - On the dashboard, see the new **Pending** booking request.
   - Click "View", review the project details, and click **Accept Appointment**.
   - The status updates to **Accepted**, confirmation emails are logged, and the slot remains reserved.
5. **Rejection & Slot Release:**
   - Reject an appointment with a reason (e.g., "Schedule conflict").
   - The status changes to **Rejected**, and the time slot immediately becomes available again for new customers!
6. **Date Blocking:**
   - Navigate to **Calendar** or **Blocked Dates** in the admin panel.
   - Block a date (e.g., a holiday). That date will immediately be disabled on the customer booking calendar.

---

## 🛡️ Production & Deployment Notes

- For production, set `NODE_ENV=production`.
- Use a process manager like **PM2**: `pm2 start app.js --name "appointment-booking"`.
- When using HTTPS, set `cookie.secure = true` in `app.js`.
