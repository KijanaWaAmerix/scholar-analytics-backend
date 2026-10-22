/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — SMS Service (Ping Africa or Africa's Talking)
   File: backend/utils/smsService.js
═══════════════════════════════════════════════════════════ */

let AfricasTalking = null;

let client = null;

const getClient = () => {
  if (!client) {
    AfricasTalking = AfricasTalking || require('africastalking');
    client = AfricasTalking({
      apiKey  : process.env.AT_API_KEY,
      username: process.env.AT_USERNAME,
    });
  }
  return client;
};

/* ── Phone number → +2547XXXXXXXX ─────────────────────────── */
const toE164 = (raw) => {
  const d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+'))   return d;
  if (d.startsWith('254')) return `+${d}`;
  return `+254${d.replace(/^0/, '')}`;
};

/* ══════════════════════════════════════════════════════════
   PROVIDERS
   If PING_API_KEY is set we use Ping Africa (HTTPS API).
   Otherwise we fall back to Africa's Talking (AT_API_KEY).

   Render env vars for Ping Africa:
     PING_API_KEY    API token (Bearer) from bulk.ping.africa
     PING_SENDER_ID  optional — leave out to use your default sender
════════════════════════════════════════════════════════════ */
const sendViaPing = async ({ to, message }) => {
  const body = { recipient: toE164(to), message };
  if (process.env.PING_SENDER_ID) body.sender_id = process.env.PING_SENDER_ID;

  const res = await fetch('https://bulk.ping.africa/api/sms/send', {
    method  : 'POST',
    headers : {
      Authorization  : `Bearer ${process.env.PING_API_KEY}`,
      'Content-Type' : 'application/json',
      Accept         : 'application/json',
    },
    body: JSON.stringify(body),
  });

  let data = {};
  try { data = await res.json(); } catch { /* non-JSON reply */ }

  if (!res.ok || data.success === false) {
    const reason = data.error || data.message ||
      (res.status === 402 ? 'Insufficient SMS credits' : `HTTP ${res.status}`);
    console.error('Ping Africa SMS Error:', res.status, reason);
    return { success: false, error: String(reason) };
  }

  return {
    success : true,
    status  : data.message?.status || 'sent',
    cost    : data.credits_charged,
    number  : body.recipient,
  };
};

const sendViaAfricasTalking = async ({ to, message }) => {
  const sms    = getClient().SMS;
  const result = await sms.send({
    to     : [toE164(to)],
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
};

/* ══════════════════════════════════════════════════════════
   SEND SINGLE SMS
══════════════════════════════════════════════════════════ */
exports.sendSMS = async ({ to, message }) => {
  try {
    return process.env.PING_API_KEY
      ? await sendViaPing({ to, message })
      : await sendViaAfricasTalking({ to, message });
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