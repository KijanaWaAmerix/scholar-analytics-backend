const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS    : 30000,
      socketTimeoutMS             : 45000,
      tls                         : true,
      tlsAllowInvalidCertificates : true,
      tlsAllowInvalidHostnames    : true,
    });

    console.log(`
╔════════════════════════════════════════╗
║   MongoDB Connected Successfully       ║
║   Host: ${conn.connection.host.substring(0,28).padEnd(28)}║
╚════════════════════════════════════════╝
    `);

  } catch (error) {
    console.error(`
╔════════════════════════════════════════╗
║   MongoDB Connection FAILED            ║
║   ${error.message.substring(0,36).padEnd(36)}║
╚════════════════════════════════════════╝
    `);
    process.exit(1);
  }
};

module.exports = connectDB;