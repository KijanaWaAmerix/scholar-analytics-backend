'use strict';

/**
 * Scheme of work scheduler. Plain code, no AI: it decides WHICH lesson falls in
 * WHICH week and date. Gemini is only used afterwards to write the content of each lesson.
 *
 * Inputs (all dates are ISO strings, YYYY-MM-DD):
 *   design            parsed grade design JSON (strands -> sub_strands with `lessons`)
 *   startSubStrand    e.g. "1.1"
 *   endSubStrand      e.g. "1.3"  (inclusive)
 *   termStart/termEnd first and last day of the term
 *   halfTermStart/halfTermEnd  first and last day of the half-term break
 *   holidays          optional array of ISO dates with no lessons (public holidays, etc.)
 *   lessonsPerDay     optional, defaults to one lesson Mon-Fri (5 a week).
 *                     Use e.g. {1:1, 2:1, 3:2, 4:0, 5:1} for a different timetable (1=Mon ... 5=Fri).
 *
 * The half-term break is shown as a HALF TERM row between the last lesson before it and the first
 * lesson after it. A week lost entirely to the break is not numbered, so Week 6 is followed by Week 7.
 */

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toISO(date) {
  return date.toISOString().slice(0, 10);
}
function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
function mondayOf(date) {
  const dow = date.getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** Flat list of lessons for the chosen sub-strand range, in design order. */
function buildLessonSequence(design, startSubStrand, endSubStrand) {
  const all = [];
  for (const strand of design.strands) {
    for (const sub of strand.sub_strands) {
      all.push({ strand, sub });
    }
  }
  const startIdx = all.findIndex((x) => x.sub.id === startSubStrand);
  const endIdx = all.findIndex((x) => x.sub.id === endSubStrand);
  if (startIdx === -1) throw new Error(`Unknown start sub-strand: ${startSubStrand}`);
  if (endIdx === -1) throw new Error(`Unknown end sub-strand: ${endSubStrand}`);
  if (endIdx < startIdx) throw new Error('End sub-strand comes before the start sub-strand');

  const sequence = [];
  for (const { strand, sub } of all.slice(startIdx, endIdx + 1)) {
    for (let n = 1; n <= sub.lessons; n++) {
      sequence.push({
        strandId: strand.id,
        strand: strand.name,
        subStrandId: sub.id,
        subStrand: sub.name,
        lessonInSubStrand: n,
        lessonsInSubStrand: sub.lessons,
      });
    }
  }
  return sequence;
}

/** Every teaching slot in the term, with weeks marked as normal, partial or half-term. */
function buildCalendar(opts) {
  const {
    termStart, termEnd, halfTermStart, halfTermEnd,
    holidays = [], lessonsPerDay = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
  } = opts;

  const start = parseDate(termStart);
  const end = parseDate(termEnd);
  /* Half term is optional */
  const hasBreak = Boolean(halfTermStart && halfTermEnd);
  const htStart = hasBreak ? parseDate(halfTermStart) : null;
  const htEnd = hasBreak ? parseDate(halfTermEnd) : null;
  if (end < start) throw new Error('Term end is before term start');
  if (hasBreak && htEnd < htStart) throw new Error('Half-term end is before half-term start');
  if (hasBreak && (htStart < start || htEnd > end)) throw new Error('Half-term must fall inside the term');

  const holidaySet = new Set(holidays);
  const weeks = [];

  for (let monday = mondayOf(start); monday <= end; monday = addDays(monday, 7)) {
    const slots = [];
    let weekdaysInTerm = 0;
    let weekdaysOnBreak = 0;

    for (let dow = 1; dow <= 5; dow++) {
      const day = addDays(monday, dow - 1);
      if (day < start || day > end) continue;
      weekdaysInTerm++;
      const iso = toISO(day);
      if (hasBreak && day >= htStart && day <= htEnd) { weekdaysOnBreak++; continue; }
      if (holidaySet.has(iso)) continue;
      const count = lessonsPerDay[dow] || 0;
      for (let k = 1; k <= count; k++) {
        slots.push({ date: iso, day: DAY_NAMES[dow], lessonOfDay: k });
      }
    }

    weeks.push({
      mondayISO: toISO(monday),
      slots,
      isHalfTermWeek: weekdaysInTerm > 0 && weekdaysOnBreak === weekdaysInTerm,
      lostToBreak: weekdaysOnBreak,
    });
  }
  return weeks;
}

function generateScheme(opts) {
  const { design, startSubStrand, endSubStrand } = opts;
  const sequence = buildLessonSequence(design, startSubStrand, endSubStrand);
  const calendar = buildCalendar(opts);

  const rows = [];
  let weekNo = 0;
  let next = 0; // index into sequence
  let halfTermShown = false;
  let lastWeekWithLessons = 0;

  for (const week of calendar) {
    // A week with no teaching slots (the half-term week, or all holidays) is not numbered.
    if (week.slots.length === 0) continue;
    weekNo++;

    for (const slot of week.slots) {
      if (next >= sequence.length) break;
      // The HALF TERM row goes at the exact point where the break falls: after the last
      // lesson before the break and before the first lesson after it. It is only shown
      // when lessons continue after the break.
      if (opts.halfTermStart && opts.halfTermEnd && !halfTermShown && slot.date > opts.halfTermEnd) {
        rows.push({
          type: 'HALF_TERM',
          week: null,
          from: opts.halfTermStart,
          to: opts.halfTermEnd,
          label: 'HALF TERM',
        });
        halfTermShown = true;
      }
      rows.push({
        type: 'LESSON',
        week: weekNo,
        lessonOfWeek: rows.filter((r) => r.type === 'LESSON' && r.week === weekNo).length + 1,
        ...slot,
        ...sequence[next],
        lessonNo: next + 1,
      });
      next++;
      lastWeekWithLessons = weekNo;
    }
  }

  const slotsAvailable = calendar.reduce((n, w) => n + w.slots.length, 0);
  const fits = next >= sequence.length;
  return {
    rows,
    summary: {
      lessonsRequired: sequence.length,
      lessonsPlaced: next,
      slotsAvailable,
      weeksUsed: lastWeekWithLessons,
      fits,
      shortBy: fits ? 0 : sequence.length - next,
      spareSlots: fits ? slotsAvailable - sequence.length : 0,
      lastLesson: next > 0 ? rows.filter((r) => r.type === 'LESSON').pop() : null,
    },
  };
}

module.exports = { generateScheme, buildLessonSequence, buildCalendar };
