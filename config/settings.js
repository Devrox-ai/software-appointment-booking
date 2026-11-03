/**
 * Application Settings Module
 * Provides default settings and functions to load/update settings from MongoDB.
 */

// Default configurable settings
const defaultSettings = {
  workingDays: [1, 2, 3, 4, 5, 6], // Mon-Sat (0=Sun, 6=Sat)
  workingHoursStart: '10:00',
  workingHoursEnd: '18:00',
  appointmentDuration: 30, // minutes
  gapBetweenAppointments: 0, // minutes
  pendingExpiryHours: 48, // hours before pending expires
  timezone: 'Asia/Kolkata',
  companyName: 'TechNova Solutions',
  companyEmail: 'info@technova.com',
  companyPhone: '+91 98765 43210',
  companyAddress: 'Pune, Maharashtra, India'
};

/**
 * Loads settings from the database and merges with defaults.
 * Any key not found in the DB falls back to the default value.
 */
async function getSettings(db) {
  try {
    const settingsDocs = await db.collection('settings').find({}).toArray();

    // Start with defaults and override with DB values
    const merged = { ...defaultSettings };
    for (const doc of settingsDocs) {
      if (doc.key && doc.value !== undefined) {
        merged[doc.key] = doc.value;
      }
    }

    return merged;
  } catch (error) {
    console.error('Error loading settings:', error.message);
    return { ...defaultSettings };
  }
}

/**
 * Updates (or inserts) a single setting in the database.
 */
async function updateSetting(db, key, value) {
  try {
    await db.collection('settings').updateOne(
      { key },
      { $set: { key, value, updatedAt: new Date() } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error(`Error updating setting "${key}":`, error.message);
    return false;
  }
}

module.exports = { defaultSettings, getSettings, updateSetting };
