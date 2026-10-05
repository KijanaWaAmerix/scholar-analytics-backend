require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to:', mongoose.connection.name);

    const col = mongoose.connection.collection('students');

    /* 1. Drop the old index (ignore if it's already gone) */
    try {
      await col.dropIndex('upiNumber_1_school_1');
      console.log('Old index dropped');
    } catch (e) {
      console.log('Index drop:', e.message);
    }

    /* 2. Remove null / empty UPI values so they're missing instead */
    const a = await col.updateMany({ upiNumber: null }, { $unset: { upiNumber: '' } });
    const b = await col.updateMany({ upiNumber: '' },   { $unset: { upiNumber: '' } });
    console.log('Cleaned:', a.modifiedCount + b.modifiedCount);

    /* 3. Create the new partial unique index */
    await col.createIndex(
      { upiNumber: 1, school: 1 },
      {
        unique: true,
        partialFilterExpression: { upiNumber: { $type: 'string' } },
      }
    );
    console.log('New partial index created');

    /* 4. Show final indexes */
    console.log(await col.indexes());
  } catch (err) {
    console.error('Script failed:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();