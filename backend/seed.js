const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
require('dotenv').config();

const User    = require('./models/User');
const Venue   = require('./models/Venue');
const Booking = require('./models/Booking');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // Wipe existing data
  await Promise.all([
    User.deleteMany({}),
    Venue.deleteMany({}),
    Booking.deleteMany({}),
  ]);
  console.log('🗑️  Cleared existing data');

  // Create users
  const hashedPass = await bcrypt.hash('password123', 12);

  const owner = await User.create({
    name: 'Arjun Mehta', email: 'arjun@venue.com',
    password: hashedPass, role: 'owner', businessName: 'Skyline Events',
  });
  const customer = await User.create({
    name: 'Priya Sharma', email: 'priya@gmail.com',
    password: hashedPass, role: 'customer',
  });
  console.log('👥 Created 2 users');

  // Create venues
  const venues = await Venue.insertMany([
    {
      name: 'The Pearl Banquet Hall', owner: owner._id, ownerName: owner.name,
      type: 'Banquet Hall', location: 'Bandra, Mumbai',
      description: 'Elegant hall with chandeliers and marble floors.',
      capacity: 300, price: 6500, rating: 4.9,
      tags: ['Wedding', 'Corporate', 'Premium'],
      amenities: ['🎤 Sound', '💡 Lighting', '🍽️ Catering'],
      available: true, emoji: '🏛️',
    },
    {
      name: 'Skyline Rooftop Terrace', owner: owner._id, ownerName: owner.name,
      type: 'Rooftop', location: 'Worli, Mumbai',
      description: 'Stunning rooftop with panoramic city views.',
      capacity: 120, price: 4200, rating: 4.7,
      tags: ['Cocktail', 'Social'],
      amenities: ['💡 Lighting', '🌐 WiFi'],
      available: true, emoji: '🌅',
    },
    {
      name: 'Urban Conference Hub', owner: owner._id, ownerName: owner.name,
      type: 'Conference Center', location: 'BKC, Mumbai',
      description: 'Modern conference rooms with AV equipment.',
      capacity: 80, price: 3000, rating: 4.6,
      tags: ['Corporate', 'Conference'],
      amenities: ['📽️ Projector', '🌐 WiFi'],
      available: true, emoji: '🏙️',
    },
  ]);
  console.log(`🏛️  Created ${venues.length} venues`);

  // Create a sample booking
  await Booking.create({
    venue: venues[0]._id, venueName: venues[0].name,
    customer: customer._id, customerName: customer.name,
    date: '2025-12-20', startTime: '18:00', hours: 5, guests: 200,
    eventType: 'Wedding', facilities: ['🎤 Sound System'],
    basePrice: 32500, addonPrice: 2500, platformFee: 1750, total: 36750,
    status: 'confirmed',
  });
  console.log('📅 Created 1 sample booking');

  console.log('');
  console.log('═══════════════════════════════════');
  console.log('  🌱 Seed complete! Login details:');
  console.log('  Owner:    arjun@venue.com / password123');
  console.log('  Customer: priya@gmail.com / password123');
  console.log('═══════════════════════════════════');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});