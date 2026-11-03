# Google Gmail API OAuth 2.0 — Manual Setup via OAuth Playground

Yeh guide aapko Google OAuth 2.0 Playground se **manually** authentic `GOOGLE_REFRESH_TOKEN` generate karne ka exact step-by-step tareeqa batati hai.

---

## 📌 Environment Variables Configuration

Aapki `.env` file mein yeh exact variables configure honge:

```env
# Google Gmail API OAuth2 Configuration
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-generated-refresh-token
GOOGLE_REDIRECT_URI=https://developers.google.com/oauthplayground

# Gmail Sender Configuration
EMAIL_USER=anasshaikh00456@gmail.com
EMAIL_FROM_NAME=Software Appointment Booking
ADMIN_EMAIL=anasshaikh00456@gmail.com
```

---

## 🛠️ Step-by-Step Manual Generation Guide

### STEP 1: Google Cloud Console mein Redirect URI Add Karein (Zaroori)
1. [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials) kholein.
2. Apne OAuth 2.0 Client par click karein.
3. **Authorized redirect URIs** section mein dekhein. Wahan yeh exact URI add hona zaroori hai:
   ```text
   https://developers.google.com/oauthplayground
   ```
   *(Agar yeh nahi hai, toh **+ Add URI** par click karein, yeh URL dalein aur **Save** par click karein).*

---

### STEP 2: Google OAuth Playground Open & Configure Karein
1. Browser mein [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground) kholein.
2. **Sabse Zaroori Step (Gear ⚙️ Icon):**
   - Top-right corner mein **Gear icon (⚙️ OAuth 2.0 configuration)** par click karein.
   - Checkbox tick karein: **`☑ Use your own OAuth credentials`**.
   - **OAuth Client ID:** Apni `.env` se `GOOGLE_CLIENT_ID` paste karein.
   - **OAuth Client secret:** Apni `.env` se `GOOGLE_CLIENT_SECRET` paste karein.

> ⚠ **Important Note:** Agar aap Gear (⚙️) icon mein apna Client ID aur Client Secret enter nahi karenge, toh Google Playground apne default credentials use karega aur generate kiya gaya token aapke app mein `unauthorized_client` error dega.

---

### STEP 3: Gmail Scope Authorize Karein
1. Left side panel (**Step 1: Select & authorize APIs**) mein scroll karein aur **Gmail API v1** par click karein.
2. Is scope ko check/select karein:
   ```text
   https://www.googleapis.com/auth/gmail.send
   ```
3. Blue button **Authorize APIs** par click karein.
4. Google login screen khulegi. Apne Gmail account (`anasshaikh00456@gmail.com`) se sign in karein.
5. "Google hasn't verified this app" screen par:
   - **Advanced** par click karein.
   - **Go to Software Appointment Booking (unsafe)** par click karein.
   - **Continue** par click karke permissions allow karein.

---

### STEP 4: Refresh Token Exchange Karein
1. Permissions allow karne ke baad OAuth Playground automatically **Step 2 (Exchange authorization code for tokens)** par aa jayega.
2. Blue button **Exchange authorization code for tokens** par click karein.
3. Response section mein aapko dikhega:
   - `Refresh token` (e.g. `1//04xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
   - `Access token`
4. **Refresh token** ko copy kar lein!

---

### STEP 5: `.env` Update Karein
Apni project file `C:\Anas-1\software-appointment-booking\.env` kholein aur copied refresh token ko paste kar dein:

```ini
GOOGLE_REFRESH_TOKEN=1//04xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### STEP 6: Connection Verification Run Karein

Terminal mein verification script chalayein:

```powershell
cd C:\Anas-1\software-appointment-booking
node scripts/verifyGmailOAuth.js
```

Yeh script:
- `.env` values inspect karega bina secrets leak kiye.
- Google Gmail API (`users.getProfile`) ke zariye OAuth connection check karega.
- Confirm karega ki authenticated Google account `EMAIL_USER` se match karta hai.

#### Live Test Email Send Karna (Optional):
```powershell
node scripts/verifyGmailOAuth.js --send-test
```
Yeh command aapke configured `ADMIN_EMAIL` par ek real test email send karegi aur Message ID print karegi.

---

## 🔍 Common Errors & How to Fix Them

| Error Code | Reason | Fix |
|---|---|---|
| `unauthorized_client` | Refresh token Playground ke default Client ID se generate hua hai, aapke Client ID se nahi. | Step 2 follow karein: Gear icon (⚙️) khol kar "Use your own OAuth credentials" check karein aur apna Client ID + Secret dalein. |
| `invalid_grant` | Refresh token expire ho gaya hai, revoke ho gaya hai, ya password change hua hai. | OAuth Playground se naya Refresh Token generate karke `.env` mein paste karein. |
| `invalid_client` | `.env` mein `GOOGLE_CLIENT_ID` ya `GOOGLE_CLIENT_SECRET` galat hai. | Google Cloud Console se exact Client ID aur Client Secret verify karein. |
| `insufficient_scope` | Scope `https://www.googleapis.com/auth/gmail.send` select nahi kiya gaya tha. | Step 3 mein exact `https://www.googleapis.com/auth/gmail.send` scope select karke re-authorize karein. |
