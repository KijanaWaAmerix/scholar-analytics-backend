require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('./models/User');

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected...');

    const existing = await User.findOne({ role: 'superadmin' });

    if (existing) {
      console.log('SuperAdmin already exists:', existing.email);
      process.exit(0);
    }

    await User.create({
      fullName      : 'Scholar Analytics Admin',
      email         : 'dankibe1998@gmail.com',
      password      : 'SuperAdmin2024',
      role          : 'superadmin',
      isActive      : true,
      isAccountSetup: true,
    });

    console.log('');
    console.log('✅ SuperAdmin created!');
    console.log('══════════════════════════════════');
    console.log('Email   : dankibe1998@gmail.com');
    console.log('Password: SuperAdmin2024');
    console.log('══════════════════════════════════');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();