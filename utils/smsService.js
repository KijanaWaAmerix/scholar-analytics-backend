/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — SMS Service (Africa's Talking)
   File: backend/utils/smsService.js
═══════════════════════════════════════════════════════════ */

const AfricasTalking = require('africastalking');

let client = null;

const getClient = () => {
  if (!client) {
    client = AfricasTalking({
      apiKey  : process.env.AT_API_KEY,
      username: process.env.AT_USERNAME,
    });
  }
  return client;
};

/* ══════════════════════════════════════════════════════════
   SEND SINGLE SMS
══════════════════════════════════════════════════════════ */
exports.sendSMS = async ({ to, message }) => {
  try {
    const sms    = getClient().SMS;
    const result = await sms.send({
      to     : [to.startsWith('+') ? to : `+254${to.replace(/^0/, '')}`],
      message,
      from   : process.env.AT_SENDER_ID || 'ScholarA',
    });

    const recipient = result.SMSMessageData?.Recipients?.[0];
    return {
      success : recipient?.status === 'Success',
      status  : recipient?.status,
      cost    : recipient?.cost,
      number  : recipient?.number,
    };

  } catch (error) {
    console.error('SMS Error:', error.message);
    return { success:false, error: error.message };
  }
};

/* ══════════════════════════════════════════════════════════
   SEND BULK SMS
══════════════════════════════════════════════════════════ */
exports.sendBulkSMS = async (messages) => {
  const results = [];
  for (const msg of messages) {
    const result = await exports.sendSMS(msg);
    results.push({ ...msg, ...result });
    await new Promise(r => setTimeout(r, 100)); /* Rate limit */
  }
  return results;
};

/* ══════════════════════════════════════════════════════════
   MESSAGE TEMPLATES
══════════════════════════════════════════════════════════ */
exports.templates = {

  reportCard: (learnerName, grade, points, schoolName) =>
    `Dear Parent, ${learnerName}'s ${schoolName} report is ready. ` +
    `Mean Grade: ${grade} | KJSEA Points: ${points}/72. ` +
    `Contact school for the full report card. - ${schoolName}`,

  atRisk: (learnerName, avg, schoolName) =>
    `Dear Parent, ${learnerName} scored ${avg}% in the recent exam at ${schoolName}. ` +
    `This is below the expected standard. Please visit the school. - ${schoolName}`,

  examResults: (learnerName, avg, position, schoolName) =>
    `Dear Parent, ${learnerName} got ${avg}% (Position ${position}) in the recent exam at ${schoolName}. ` +
    `Contact us for the full report. - ${schoolName}`,

  termReminder: (schoolName, closingDate) =>
    `Dear Parent, term ends on ${closingDate} at ${schoolName}. ` +
    `Please ensure school fees are cleared. - ${schoolName}`,
};