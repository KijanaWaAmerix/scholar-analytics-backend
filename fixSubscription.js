require('dotenv').config();
const mongoose = require('mongoose');
const School   = require('./models/School');

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected...');

    const school = await School.findOne({ schoolName: 'Test School' });

    if (!school) {
      console.log('❌ School not found');
      process.exit(1);
    }

    /* Set expiry 2 years from now */
    school.subscription.expiryDate = new Date('2027-12-31');
    school.subscription.plan       = 'standard';
    school.status                  = 'active';
    school.lockedAt                = null;
    school.lockedReason            = null;

    await school.save();

    console.log('✅ Subscription updated');
    console.log('   School :', school.schoolName);
    console.log('   Status :', school.status);
    console.log('   Expires:', school.subscription.expiryDate.toDateString());
    console.log('');
    console.log('Now try logging in again.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();