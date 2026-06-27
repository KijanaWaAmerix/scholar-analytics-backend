require('dotenv').config();
const mongoose = require('mongoose');
const School   = require('./models/School');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected');

  const school = await School.findOne({ schoolName: 'Test School' });

  if (!school) {
    console.log('School not found');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('Status     :', school.status);
  console.log('Expiry     :', school.subscription?.expiryDate);
  console.log('Lock Reason:', school.lockedReason);
  console.log('Auto Lock  :', school.subscription?.autoLock);

  school.status                  = 'active';
  school.lockedAt                = null;
  school.lockedReason            = null;
  school.subscription.expiryDate = new Date('2027-12-31');
  school.subscription.autoLock   = false;

  await school.save();
  console.log('Fixed successfully');

  await mongoose.disconnect();
  process.exit(0);
}

run();