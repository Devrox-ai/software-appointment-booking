/**
 * MongoDB Database Connection Module
 * Uses the native MongoDB driver to connect and manage the database instance.
 */

const { MongoClient } = require('mongodb');

let db = null;
let client = null;

/**
 * Connects to MongoDB and creates required indexes.
 * Returns the database instance.
 */
async function connectDB() {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    const dbName = process.env.DB_NAME || 'software_appointment_booking';

    client = new MongoClient(uri);
    await client.connect();

    db = client.db(dbName);
    console.log(`Connected to database: ${dbName}`);

    // Create indexes for optimal query performance
    await createIndexes(db);

    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
}

/**
 * Creates all required indexes on collections.
 */
async function createIndexes(db) {
  try {
    // Appointments: unique compound index to prevent double-booking for active statuses
    await db.collection('appointments').createIndex(
      { appointmentDate: 1, appointmentTime: 1 },
      {
        unique: true,
        partialFilterExpression: {
          status: { $in: ['pending', 'accepted'] }
        }
      }
    );

    // Appointments: unique bookingId for lookups
    await db.collection('appointments').createIndex(
      { bookingId: 1 },
      { unique: true }
    );

    // Appointments: index on status for filtered queries
    await db.collection('appointments').createIndex({ status: 1 });

    // Appointments: index on customer email for search
    await db.collection('appointments').createIndex({ customerEmail: 1 });

    // Admins: unique email
    await db.collection('admins').createIndex(
      { email: 1 },
      { unique: true }
    );

    // Blocked dates: unique date
    await db.collection('blocked_dates').createIndex(
      { date: 1 },
      { unique: true }
    );

    // Settings: unique key
    await db.collection('settings').createIndex(
      { key: 1 },
      { unique: true }
    );

    // Services: compound index for active services sorted by order
    await db.collection('services').createIndex({ isActive: 1, order: 1 });

    console.log('Database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error.message);
    // Don't throw — indexes may already exist with same spec
  }
}

/**
 * Returns the cached database instance.
 * Throws if not connected yet.
 */
function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB() first.');
  }
  return db;
}

module.exports = { connectDB, getDB };
