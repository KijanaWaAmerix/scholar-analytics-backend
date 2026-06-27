/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — Email Service
   File: backend/utils/emailService.js
   Handles: Password reset, account setup, notifications
═══════════════════════════════════════════════════════════ */

const nodemailer = require('nodemailer');

/* ── Create reusable transporter ─────────────────────────── */
const createTransporter = () => {
  return nodemailer.createTransport({
    host   : process.env.EMAIL_HOST,
    port   : process.env.EMAIL_PORT,
    secure : false, // true for port 465, false for 587
    auth   : {
      user : process.env.EMAIL_USER,
      pass : process.env.EMAIL_PASS,
    },
  });
};

/* ══════════════════════════════════════════════════════════
   EMAIL TEMPLATES
══════════════════════════════════════════════════════════ */

/* Shared HTML wrapper — branded Scholar Analytics */
const emailWrapper = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { margin:0; padding:0; background:#f4f6f9;
           font-family:'Segoe UI',sans-serif; }
    .wrapper { max-width:560px; margin:32px auto; }
    .header  { background:linear-gradient(135deg,#0a2540,#1a5276);
               padding:28px 32px; border-radius:12px 12px 0 0; }
    .brand   { color:#fff; font-size:22px; font-weight:700; }
    .brand span { color:#2ecc71; }
    .body    { background:#fff; padding:32px;
               border:1px solid #e2e8f0; }
    .footer  { background:#f8fafc; padding:16px 32px;
               border:1px solid #e2e8f0; border-top:none;
               border-radius:0 0 12px 12px;
               font-size:12px; color:#94a3b8; text-align:center; }
    .btn     { display:inline-block; padding:13px 28px;
               background:linear-gradient(135deg,#1a5276,#2e86c1);
               color:#fff; text-decoration:none; border-radius:8px;
               font-weight:600; font-size:15px; margin:20px 0; }
    .notice  { background:#fef9e7; border:1px solid #f9e79f;
               border-radius:8px; padding:12px 16px;
               font-size:13px; color:#7d6608; margin-top:16px; }
    h2       { color:#1a2a3a; margin-top:0; }
    p        { color:#4a5568; line-height:1.6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="brand">
        Scholar <span>Analytics</span>
      </div>
      <div style="color:rgba(255,255,255,0.6);font-size:13px;margin-top:4px;">
        CBC Kenya — KJSEA School Management System
      </div>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      &copy; 2024 Scholar Analytics &mdash;
      Empowering Education Through Data<br/>
      Support: <a href="mailto:${process.env.SUPPORT_EMAIL}"
        style="color:#2e86c1;">
        ${process.env.SUPPORT_EMAIL}
      </a>
    </div>
  </div>
</body>
</html>`;

/* ══════════════════════════════════════════════════════════
   1. PASSWORD RESET EMAIL
══════════════════════════════════════════════════════════ */
const sendPasswordResetEmail = async ({ email, name, resetUrl }) => {
  const transporter = createTransporter();

  const content = `
    <h2>Reset Your Password</h2>
    <p>Hello <strong>${name}</strong>,</p>
    <p>
      We received a request to reset the password for your
      Scholar Analytics account.
      Click the button below to set a new password:
    </p>
    <div style="text-align:center;">
      <a href="${resetUrl}" class="btn">
        Reset My Password
      </a>
    </div>
    <div class="notice">
      <strong>⏰ This link expires in 1 hour.</strong><br/>
      If you did not request a password reset,
      please ignore this email. Your account is safe.
    </div>
    <p style="font-size:13px;color:#94a3b8;margin-top:16px;">
      Or copy this link into your browser:<br/>
      <span style="color:#2e86c1;">${resetUrl}</span>
    </p>`;

  await transporter.sendMail({
    from    : `"Scholar Analytics" <${process.env.EMAIL_USER}>`,
    to      : email,
    subject : 'Scholar Analytics — Password Reset Request',
    html    : emailWrapper(content),
  });
};

/* ══════════════════════════════════════════════════════════
   2. ACCOUNT SETUP EMAIL (sent when admin creates teacher)
══════════════════════════════════════════════════════════ */
const sendAccountSetupEmail = async ({
  email, name, schoolName, setupUrl, role,
}) => {
  const transporter = createTransporter();

  const content = `
    <h2>Welcome to Scholar Analytics!</h2>
    <p>Hello <strong>${name}</strong>,</p>
    <p>
      Your <strong>${role}</strong> account has been created
      on <strong>${schoolName}</strong>'s Scholar Analytics
      portal. Click the button below to set your password
      and activate your account:
    </p>
    <div style="text-align:center;">
      <a href="${setupUrl}" class="btn">
        Set Up My Account
      </a>
    </div>
    <div class="notice">
      <strong>⏰ This link expires in 24 hours.</strong><br/>
      After setting your password you can log in at any time
      from the Scholar Analytics portal.
    </div>
    <p style="margin-top:20px;font-size:14px;">
      <strong>Your login email:</strong> ${email}
    </p>`;

  await transporter.sendMail({
    from    : `"Scholar Analytics" <${process.env.EMAIL_USER}>`,
    to      : email,
    subject : `Welcome to Scholar Analytics — ${schoolName}`,
    html    : emailWrapper(content),
  });
};

/* ══════════════════════════════════════════════════════════
   3. PASSWORD CHANGED CONFIRMATION
══════════════════════════════════════════════════════════ */
const sendPasswordChangedEmail = async ({ email, name }) => {
  const transporter = createTransporter();

  const content = `
    <h2>Password Changed Successfully</h2>
    <p>Hello <strong>${name}</strong>,</p>
    <p>
      Your Scholar Analytics password was changed successfully.
      If you made this change, no action is needed.
    </p>
    <div class="notice">
      <strong>⚠️ Did not change your password?</strong><br/>
      Contact us immediately at
      <a href="mailto:${process.env.SUPPORT_EMAIL}">
        ${process.env.SUPPORT_EMAIL}
      </a>
    </div>`;

  await transporter.sendMail({
    from    : `"Scholar Analytics" <${process.env.EMAIL_USER}>`,
    to      : email,
    subject : 'Scholar Analytics — Password Changed',
    html    : emailWrapper(content),
  });
};

/* ══════════════════════════════════════════════════════════
   4. RESULTS NOTIFICATION TO PARENT
══════════════════════════════════════════════════════════ */
const sendResultsEmail = async ({
  parentEmail,
  parentName,
  studentName,
  schoolName,
  term,
  examName,
  totalPoints,
  meanGrade,
  position,
  totalStudents,
  portalUrl,
}) => {
  const transporter = createTransporter();

  const content = `
    <h2>Results Available — ${examName}</h2>
    <p>Dear <strong>${parentName}</strong>,</p>
    <p>
      The Term ${term} ${examName} results for
      <strong>${studentName}</strong> from
      <strong>${schoolName}</strong> are now available.
    </p>
    <table style="width:100%;border-collapse:collapse;
                  margin:16px 0;font-size:14px;">
      <tr style="background:#f8fafc;">
        <td style="padding:10px 14px;font-weight:600;
                   border:1px solid #e2e8f0;">
          KJSEA Points
        </td>
        <td style="padding:10px 14px;border:1px solid #e2e8f0;
                   font-weight:700;color:#7d3c98;">
          ${totalPoints}/72
        </td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-weight:600;
                   border:1px solid #e2e8f0;">
          Mean Grade
        </td>
        <td style="padding:10px 14px;border:1px solid #e2e8f0;
                   font-weight:700;color:#1a5276;">
          ${meanGrade}
        </td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:10px 14px;font-weight:600;
                   border:1px solid #e2e8f0;">
          Class Position
        </td>
        <td style="padding:10px 14px;border:1px solid #e2e8f0;
                   font-weight:700;">
          ${position} out of ${totalStudents}
        </td>
      </tr>
    </table>
    <div style="text-align:center;">
      <a href="${portalUrl}" class="btn">
        View Full Report Card
      </a>
    </div>`;

  await transporter.sendMail({
    from    : `"${schoolName} via Scholar Analytics" <${process.env.EMAIL_USER}>`,
    to      : parentEmail,
    subject : `${studentName}'s Results — ${examName} Term ${term}`,
    html    : emailWrapper(content),
  });
};

module.exports = {
  sendPasswordResetEmail,
  sendAccountSetupEmail,
  sendPasswordChangedEmail,
  sendResultsEmail,
};