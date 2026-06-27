require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('./models/User');
const School   = require('./models/School');

console.log('Script started...');
console.log('MONGO_URI:', process.env.MONGO_URI ? 'Found ✅' : 'MISSING ❌');

const createTestData = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB Atlas');

    /* School */
    let school = await School.findOne({ schoolName: 'Test School' });
    if (!school) {
      school = await School.create({
        schoolName   : 'Test School',
        schoolMotto  : 'Excellence Through Knowledge',
        status       : 'active',
        subscription : {
          plan      : 'standard',
          expiryDate: new Date('2026-12-31'),
        },
      });
      console.log('✅ New school created:', school.schoolName);
    } else {
      console.log('✅ Using existing school:', school.schoolName);
    }

    /* Admin */
    let admin = await User.findOne({ email: 'admin@test.com' });
    if (!admin) {
      admin = await User.create({
        fullName      : 'School Admin',
        email         : 'admin@test.com',
        password      : 'Admin1234',
        role          : 'admin',
        school        : school._id,
        isAccountSetup: true,
        isActive      : true,
      });
      console.log('✅ New admin created');
    } else {
      console.log('✅ Admin already exists:', admin.email);
    }

    console.log('\n🎉 TEST ACCOUNT READY');
    console.log('══════════════════════════════════');
    console.log('Email    : admin@test.com');
    console.log('Password : Admin1234');
    console.log('School   :', school.schoolName);
    console.log('══════════════════════════════════');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

/* ← This line MUST exist */
createTestData();