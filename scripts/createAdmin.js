/**
 * Create Admin & Seed Database Script
 * Run: node scripts/createAdmin.js
 * 
 * Creates default admin account, seeds 10 default software services,
 * and initializes application settings if not already present.
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { connectDB } = require('../config/database');
const { defaultSettings } = require('../config/settings');

const defaultServices = [
  {
    name: 'Website Development',
    description: 'Professional, responsive websites tailored to your business needs. From landing pages to complex corporate web portals.',
    icon: '🌐',
    isActive: true,
    order: 1
  },
  {
    name: 'E-commerce Development',
    description: 'Full-featured online stores with secure payment gateways, inventory management, and seamless shopping experiences.',
    icon: '🛒',
    isActive: true,
    order: 2
  },
  {
    name: 'Custom Software Development',
    description: 'Bespoke software solutions designed to solve your unique business challenges and streamline daily operations.',
    icon: '⚙️',
    isActive: true,
    order: 3
  },
  {
    name: 'Mobile Application Development',
    description: 'Native and cross-platform mobile apps for iOS and Android that deliver exceptional user experience.',
    icon: '📱',
    isActive: true,
    order: 4
  },
  {
    name: 'Web Application Development',
    description: 'Scalable, feature-rich web applications built with modern architectures and robust database backends.',
    icon: '💻',
    isActive: true,
    order: 5
  },
  {
    name: 'UI/UX Design',
    description: 'User-centered design that combines stunning visual aesthetics with intuitive digital interaction patterns.',
    icon: '🎨',
    isActive: true,
    order: 6
  },
  {
    name: 'Website Maintenance',
    description: 'Ongoing website support, security patching, performance optimization, and continuous uptime monitoring.',
    icon: '🔧',
    isActive: true,
    order: 7
  },
  {
    name: 'API Integration',
    description: 'Seamless integration of third-party APIs, payment gateways, CRM systems, and external cloud services.',
    icon: '🔗',
    isActive: true,
    order: 8
  },
  {
    name: 'Software Consultation',
    description: 'Expert guidance on technology stack selection, system architecture design, and digital transformation roadmaps.',
    icon: '💡',
    isActive: true,
    order: 9
  },
  {
    name: 'Other / Custom Requirements',
    description: 'Have a unique project in mind? Let us understand your vision and craft a customized software solution for you.',
    icon: '📋',
    isActive: true,
    order: 10
  }
];

async function seedDatabase() {
  try {
    const db = await connectDB();
    const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'admin123';

    // 1. Seed or update Admin
    const existingAdmin = await db.collection('admins').findOne({ email });
    if (!existingAdmin) {
      const hash = await bcrypt.hash(password, 12);
      await db.collection('admins').insertOne({
        email,
        password: hash,
        createdAt: new Date()
      });
      console.log(`✔ Admin created successfully: ${email}`);
    } else {
      console.log(`ℹ Admin already exists: ${email}`);
    }

    // 2. Seed Services if empty
    const serviceCount = await db.collection('services').countDocuments();
    if (serviceCount === 0) {
      const now = new Date();
      const servicesToInsert = defaultServices.map(s => ({
        ...s,
        createdAt: now,
        updatedAt: now
      }));
      await db.collection('services').insertMany(servicesToInsert);
      console.log(`✔ Seeded ${servicesToInsert.length} default software services`);
    } else {
      console.log(`ℹ Services collection already contains ${serviceCount} services`);
    }

    // 3. Seed Settings if empty
    const settingsCount = await db.collection('settings').countDocuments();
    if (settingsCount === 0) {
      const now = new Date();
      const settingsDocs = Object.entries(defaultSettings).map(([key, value]) => ({
        key,
        value,
        createdAt: now,
        updatedAt: now
      }));
      await db.collection('settings').insertMany(settingsDocs);
      console.log(`✔ Seeded default application settings`);
    } else {
      console.log(`ℹ Settings collection already contains ${settingsCount} settings`);
    }

    console.log('\n✔ Database setup and seeding completed successfully!\n');
    process.exit(0);
  } catch (err) {
    console.error('Error during database setup:', err);
    process.exit(1);
  }
}

seedDatabase();
