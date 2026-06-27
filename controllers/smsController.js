/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — SMS Controller
   File: backend/controllers/smsController.js
═══════════════════════════════════════════════════════════ */

const SMS     = require('../utils/smsService');
const Student = require('../models/Student');
const Mark    = require('../models/Mark');
const School  = require('../models/School');

/* ══════════════════════════════════════════════════════════
   SEND TEST SMS
══════════════════════════════════════════════════════════ */
exports.sendTest = async (req, res, next) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ success:false, message:'Phone and message required.' });
    }

    const result = await SMS.sendSMS({ to: phone, message });

    res.status(200).json({ success: result.success, result });
  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   NOTIFY AT-RISK PARENTS
══════════════════════════════════════════════════════════ */
exports.notifyAtRisk = async (req, res, next) => {
  try {
    const { examId } = req.body;
    const school     = req.user.school;

    const schoolDoc = await School.findById(school).lean();
    const schoolName= schoolDoc?.schoolName || 'Your School';

    /* Get all marks for this exam */
    const marks = await Mark.find({ exam:examId, school, absent:false, score:{ $ne:null } })
      .populate('student', 'fullName parentContact')
      .lean();

    /* Group by student */
    const studentMap = {};
    marks.forEach(m => {
      const sid = m.student?._id?.toString();
      if (!sid || !m.student?.parentContact) return;
      if (!studentMap[sid]) {
        studentMap[sid] = { student: m.student, scores: [] };
      }
      studentMap[sid].scores.push(m.score);
    });

    /* Filter at-risk */
    const toNotify = Object.values(studentMap)
      .map(s => ({
        ...s.student,
        avg: parseFloat((s.scores.reduce((a,b)=>a+b,0)/s.scores.length).toFixed(1)),
      }))
      .filter(s => s.avg < 41 && s.parentContact);

    if (!toNotify.length) {
      return res.status(200).json({
        success: true,
        message: 'No at-risk students with parent contacts found.',
        sent   : 0,
      });
    }

    /* Send SMS */
    const messages = toNotify.map(s => ({
      to     : s.parentContact,
      message: SMS.templates.atRisk(s.fullName, s.avg, schoolName),
    }));

    const results = await SMS.sendBulkSMS(messages);
    const sent    = results.filter(r => r.success).length;

    res.status(200).json({
      success: true,
      message: `${sent} SMS sent to at-risk parents.`,
      sent,
      failed : results.length - sent,
      results,
    });

  } catch (error) {
    next(error);
  }
};

/* ══════════════════════════════════════════════════════════
   NOTIFY ALL PARENTS — results published
══════════════════════════════════════════════════════════ */
exports.notifyResults = async (req, res, next) => {
  try {
    const { examId, classId } = req.body;
    const school              = req.user.school;

    const schoolDoc  = await School.findById(school).lean();
    const schoolName = schoolDoc?.schoolName || 'Your School';

    const filter = { exam:examId, school, absent:false, score:{ $ne:null } };
    if (classId) filter.class = classId;

    const marks = await Mark.find(filter)
      .populate('student', 'fullName parentContact')
      .lean();

    /* Group by student */
    const studentMap = {};
    marks.forEach(m => {
      const sid = m.student?._id?.toString();
      if (!sid || !m.student?.parentContact) return;
      if (!studentMap[sid]) {
        studentMap[sid] = { student: m.student, scores: [] };
      }
      studentMap[sid].scores.push(m.score);
    });

    const students = Object.values(studentMap).map((s, i) => ({
      ...s.student,
      avg     : parseFloat((s.scores.reduce((a,b)=>a+b,0)/s.scores.length).toFixed(1)),
      position: i + 1,
    }));

    /* Sort by avg desc for positions */
    students.sort((a, b) => b.avg - a.avg);
    students.forEach((s, i) => s.position = i + 1);

    const toNotify = students.filter(s => s.parentContact);

    if (!toNotify.length) {
      return res.status(200).json({ success:true, message:'No students with parent contacts.', sent:0 });
    }

    const messages = toNotify.map(s => ({
      to     : s.parentContact,
      message: SMS.templates.examResults(s.fullName, s.avg, s.position, schoolName),
    }));

    const results = await SMS.sendBulkSMS(messages);
    const sent    = results.filter(r => r.success).length;

    res.status(200).json({
      success: true,
      message: `${sent} result SMS sent to parents.`,
      sent,
      results,
    });

  } catch (error) {
    next(error);
  }
};