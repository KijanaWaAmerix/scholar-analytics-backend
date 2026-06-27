/* ═══════════════════════════════════════════════════════════
   SCHOLAR ANALYTICS — One-Time School Setup Script
   File: backend/setupSchool.js
   Run: node setupSchool.js
   Seeds: 6 classes + 54 subjects + 54 exams
═══════════════════════════════════════════════════════════ */

require('dotenv').config();
const mongoose = require('mongoose');
const Class    = require('./models/Class');
const Subject  = require('./models/Subject');
const Exam     = require('./models/Exam');
const School   = require('./models/School');

const CBC_SUBJECTS = [
  { code:'ENG',   name:'English',                learningArea:'Languages'    },
  { code:'KIS',   name:'Kiswahili',              learningArea:'Languages'    },
  { code:'MATH',  name:'Mathematics',            learningArea:'Mathematics'  },
  { code:'INTER', name:'Integrated Science',     learningArea:'Sciences'     },
  { code:'SST',   name:'Social Studies',         learningArea:'Humanities'   },
  { code:'CRE',   name:'Religious Education',    learningArea:'Life Skills'  },
  { code:'PRT',   name:'Pre Technical',          learningArea:'Technical'    },
  { code:'AGR',   name:'Agriculture',            learningArea:'Technical'    },
  { code:'CAS',   name:'Creative Arts & Sports', learningArea:'Creative Arts'},
];

const DEFAULT_CLASSES = [
  { name:'Grade 7 East', grade:7, stream:'East' },
  { name:'Grade 7 West', grade:7, stream:'West' },
  { name:'Grade 8 East', grade:8, stream:'East' },
  { name:'Grade 8 West', grade:8, stream:'West' },
  { name:'Grade 9 East', grade:9, stream:'East' },
  { name:'Grade 9 West', grade:9, stream:'West' },
];

const EXAM_NAMES  = ['Opener', 'Midterm', 'Endterm'];
const TERMS       = [1, 2, 3];
const ACAD_YEAR   = '2024';

const setup = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    /* Get school */
    const school = await School.findOne({ schoolName: 'Test School' });
    if (!school) {
      console.error('❌ Test School not found. Run createTestData.js first.');
      process.exit(1);
    }

    console.log(`\n🏫 Setting up: ${school.schoolName}`);
    console.log('══════════════════════════════════════════');

    /* ── Step 1: Classes ──────────────────────────────── */
    console.log('\n📚 Creating classes...');
    const classMap = {};

    for (const cls of DEFAULT_CLASSES) {
      let classDoc = await Class.findOne({
        name: cls.name, school: school._id, academicYear: ACAD_YEAR,
      });

      if (!classDoc) {
        classDoc = await Class.create({
          ...cls,
          school      : school._id,
          academicYear: ACAD_YEAR,
        });
        console.log(`   ✅ Created: ${cls.name}`);
      } else {
        console.log(`   ⏭️  Exists : ${cls.name}`);
      }

      classMap[cls.name] = classDoc._id;
    }

    /* ── Step 2: Subjects ─────────────────────────────── */
    console.log('\n📖 Creating subjects...');
    let subCreated = 0;
    let subSkipped = 0;

    for (const [className, classId] of Object.entries(classMap)) {
      for (const subj of CBC_SUBJECTS) {
        const existing = await Subject.findOne({
          code: subj.code, class: classId, school: school._id,
        });

        if (existing) { subSkipped++; continue; }

        await Subject.create({
          name        : subj.name,
          code        : subj.code,
          class       : classId,
          school      : school._id,
          learningArea: subj.learningArea,
        });
        subCreated++;
      }
    }

    console.log(`   ✅ Created: ${subCreated} subjects`);
    console.log(`   ⏭️  Skipped: ${subSkipped} already existed`);

    /* ── Step 3: Exams ────────────────────────────────── */
    console.log('\n📝 Creating exams...');
    let examCreated = 0;
    let examSkipped = 0;

    for (const [className, classId] of Object.entries(classMap)) {
      for (const term of TERMS) {
        for (const examName of EXAM_NAMES) {
          const existing = await Exam.findOne({
            name: examName, term, academicYear: ACAD_YEAR,
            class: classId, school: school._id,
          });

          if (existing) { examSkipped++; continue; }

          await Exam.create({
            name        : examName,
            term,
            academicYear: ACAD_YEAR,
            class       : classId,
            school      : school._id,
            isOpen      : true,
            isPublished : false,
          });
          examCreated++;
        }
      }
    }

    console.log(`   ✅ Created: ${examCreated} exams`);
    console.log(`   ⏭️  Skipped: ${examSkipped} already existed`);

    /* ── Summary ──────────────────────────────────────── */
    console.log('\n══════════════════════════════════════════');
    console.log('🎉 SCHOOL SETUP COMPLETE');
    console.log('══════════════════════════════════════════');
    console.log(`  Classes  : ${Object.keys(classMap).length}`);
    console.log(`  Subjects : ${subCreated + subSkipped} total`);
    console.log(`  Exams    : ${examCreated + examSkipped} total`);
    console.log('══════════════════════════════════════════');
    console.log('\n  You can now:');
    console.log('  ✅ Log in as admin@test.com');
    console.log('  ✅ Add students to classes');
    console.log('  ✅ Enter marks for each subject');
    console.log('  ✅ Generate results and report cards');
    console.log('══════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Setup Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

setup();