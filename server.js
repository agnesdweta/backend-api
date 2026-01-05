const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const PORT = 3000;
const DB_FILE = 'db.json';
const SECRET_KEY = 'secretkey';

// ===== Middleware =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const path = require('path');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads')); // pastikan folder 'uploads'
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

const upload = multer({ storage });
app.use('/uploads', express.static('uploads'));

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    // Buat file baru dengan default structure
    const defaultDB = { users: [], assignments: [], schedules: [], exams: [], questions: [], courses: [], forum: [], calendar: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2));
    return defaultDB;
  }

  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE));
    // Pastikan setiap array ada
    return {
      users: data.users || [],
      assignments: data.assignments || [],
      schedules: data.schedules || [],
      exams: data.exams || [],
      questions: data.questions || [],
      courses: data.courses || [],
      forum: data.forum || [],
      calendar: data.calendar || []
    };
  } catch (err) {
    console.error('Error membaca db.json:', err);
    const defaultDB = { users: [], assignments: [], schedules: [], exams: [], questions: [], courses: [], forum: [], calendar: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2));
    return defaultDB;
  }
}
function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ===== JWT Middleware =====
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Token tidak ada' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token tidak valid' });
    req.user = user;
    next();
  });
}

// ===== TEST =====
app.get('/', (req, res) => {
  res.send('API OK');
});


// ================= AUTH =================

// REGISTER
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Data tidak lengkap' });
  }

  const db = loadDB();
  if (db.users.find(u => u.username === username)) {
    return res.status(409).json({ message: 'Username sudah digunakan' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = {
    id: Date.now(),
    username,
    password: hashedPassword
  };

  db.users.push(newUser);
  saveDB(db);

  res.json({ message: 'Register berhasil' });
});

// LOGIN
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const db = loadDB();
  const user = db.users.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ message: 'Username / Password salah' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ message: 'Username / Password salah' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username },
    SECRET_KEY,
    { expiresIn: '1h' }
  );

  res.json({
    message: 'Login berhasil',
    token,
    username: user.username
  });
});

// ===== UPDATE PROFILE USER =====
// Tanpa token, tanpa password lama, hanya update firstName, lastName, email

app.get('/users/:id', (req, res) => {
  const db = loadDB();
  const id = Number(req.params.id);
  const user = db.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });
  res.json(user);
});

app.put('/users/:id/profile', (req, res) => {
  const db = loadDB();
  const id = Number(req.params.id);
  const user = db.users.find(u => u.id === id);

  if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

  const { firstName, lastName, email } = req.body;

  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (email) user.email = email;

  saveDB(db);

  res.json({ message: 'Profile berhasil diupdate', user });
});

// UPLOAD PHOTO USER (POST)
app.post('/users/:id/photo', upload.single('photo'), (req, res) => {
    try {
        const db = loadDB();
        const id = Number(req.params.id);
        const user = db.users.find(u => u.id === id);
        if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

        if (!req.file) return res.status(400).json({ message: 'File tidak ada' });

        // Hapus foto lama jika ada
        if (user.photoPath) {
      const oldFile = path.join(__dirname, 'uploads', user.photoPath);
      if (fs.existsSync(oldFile)) {
        fs.unlinkSync(oldFile);
      }
    
        }

        // Simpan nama file baru ke db.json
        user.photoPath = req.file.filename;
        saveDB(db);

        // Return user terbaru
    res.json(user);
  } catch (err) {
    console.error('Error upload photo:', err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});
  


// ================= ASSIGNMENTS CRUD =================

// GET ALL
app.get('/assignments', (req, res) => {
  const db = loadDB();
  res.json(db.assignments);
});
app.get('/assignments/:id', (req, res) => {
  const db = loadDB();
  const assignment = db.assignments.find(a => a.id == req.params.id); // tetap pakai '==', aman
  if (!assignment) return res.status(404).json({ message: 'Assignment tidak ditemukan' });
  res.json(assignment);
});

// CREATE
app.post('/assignments', upload.single('image'), (req, res) => {
  const db = loadDB();
  const { title, course, deadline } = req.body;

  if (!title || !course || !deadline) {
    return res.status(400).json({ message: 'Data tidak lengkap' });
  }
  const newAssignment = {
    id: Date.now(),
    title,
    course,
    deadline,
    image: req.file ? req.file.filename : null
  };

  db.assignments.push(newAssignment);
  saveDB(db);
  res.json(newAssignment);
});

// UPDATE
app.put('/assignments/:id', upload.single('image'), (req, res) => {
  const db = loadDB();
  const idx = db.assignments.findIndex(a => a.id == req.params.id);

  if (idx === -1) {
    return res.status(404).json({ message: 'Assignment tidak ditemukan' });
  }

  const { title, course, deadline } = req.body;
  if (title) db.assignments[idx].title = title;
  if (course) db.assignments[idx].course = course;
  if (deadline) db.assignments[idx].deadline = deadline;
  if (req.file) db.assignments[idx].image = req.file.filename;

  saveDB(db);
  res.json(db.assignments[idx]);
});

// DELETE
app.delete('/assignments/:id', (req, res) => {
  const db = loadDB();
  const id = Number(req.params.id);
  const before = db.assignments.length;
  db.assignments = db.assignments.filter(a => a.id !== id);

  if (db.assignments.length === before) {
    return res.status(404).json({ message: 'Assignment tidak ditemukan' });
  }

  saveDB(db);
  res.json({ message: 'Assignment dihapus' });
});
// UPLOAD IMAGE
app.post('/assignments/:id/upload', upload.single('image'), (req, res) => {
  console.log("REQ FILE:", req.file); 
  if (!req.file) {
    return res.status(400).json({ message: 'Tidak ada file yang diupload' });
  }
  const db = loadDB();
  const idx = db.assignments.findIndex(a => a.id == req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Assignment tidak ditemukan' });

  db.assignments[idx].image = req.file.filename;
  saveDB(db);
   res.json(db.assignments[idx]);
});

// DELETE IMAGE
app.delete('/assignments/:id/image', (req, res) => {
  const fs = require('fs');
  const path = require('path');

  const db = loadDB();
  const idx = db.assignments.findIndex(a => a.id == req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Assignment tidak ditemukan' });

  const assignment = db.assignments[idx];

  if (!assignment.image) {
    return res.status(400).json({ message: 'Assignment tidak memiliki gambar' });
  }

  // path file gambar di server
  const filePath = path.join(__dirname, 'uploads', assignment.image);

  // hapus file dari folder uploads
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Gagal hapus file:", err);
      // tetap lanjut hapus reference di DB meskipun file tidak ada
    }

    // hapus reference gambar di DB
    assignment.image = null;
    saveDB(db);

    // kembalikan assignment terbaru
    res.json(assignment);
  });
});

// ===== CRUD Schedule =====

// GET ALL
app.get('/schedules', (req, res) => {
    const db = loadDB();
    res.json(db.schedules);
});

// CREATE
app.post('/schedules', (req, res) => {
    const db = loadDB();
    const { title, date, time } = req.body;
    if (!title || !date || !time) {
        return res.status(400).json({ message: 'Data tidak lengkap' });
    }

    const newSchedule = { id: Date.now(), title, date, time };
    db.schedules.push(newSchedule);
    saveDB(db);

    res.json(newSchedule);
});
// UPDATE
app.put('/schedules/:id', (req, res) => {
    const db = loadDB();
    const idx = db.schedules.findIndex(s => s.id == req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Schedule tidak ditemukan' });

    const { title, date, time } = req.body;
    if (title) db.schedules[idx].title = title;
    if (date) db.schedules[idx].date = date;
    if (time) db.schedules[idx].time = time;

    saveDB(db);
    res.json(db.schedules[idx]);
});

// DELETE
app.delete('/schedules/:id', (req, res) => {
    const db = loadDB();
    const id = Number(req.params.id); 
    db.schedules = db.schedules.filter(s => s.id !== id);
    saveDB(db);
    res.json({ message: 'Schedule dihapus' });
});

// ===== EXAMS =====

// GET ALL EXAMS
app.get('/exams', (req, res) => {
  const db = loadDB();
  res.json(db.exams);
});
// CREATE EXAM
app.post('/exams', (req, res) => {
  const db = loadDB();
  const { title, course, date, time } = req.body;

  if (!title || !course || !date || !time)
    return res.status(400).json({ message: 'Data tidak lengkap' });

  const exam = {
    id: Date.now(),
    title,
    course,
    date,
    time
  };
  db.exams.push(exam);
  saveDB(db);
  res.json(exam);
});

// UPDATE EXAM
app.put('/exams/:id', (req, res) => {
  const db = loadDB();
  const exam = db.exams.find(e => e.id == req.params.id);
  if (!exam) return res.status(404).json({ message: 'Exam tidak ditemukan' });

  exam.title = req.body.title || exam.title;
  exam.course = req.body.course || exam.course;
  exam.date = req.body.date || exam.date;
  exam.time = req.body.time || exam.time;

  saveDB(db);
  res.json(exam);
});
// DELETE EXAM
app.delete('/exams/:id', (req, res) => {
  const db = loadDB();
  db.exams = db.exams.filter(e => e.id != req.params.id);
  db.questions = db.questions.filter(q => q.exam_id != req.params.id);
  saveDB(db);
  res.json({ message: 'Exam dihapus' });
});
// ===== QUESTIONS =====

// GET QUESTIONS BY EXAM ID
app.get('/exams/:id/questions', (req, res) => {
  const db = loadDB();
  const examId = Number(req.params.id);

  const questions = db.questions.filter(q => q.exam_id === examId);
  res.json(questions);
});
// ADD QUESTION
app.post('/questions', (req, res) => {
  const db = loadDB();
  const { exam_id, question } = req.body;

  if (!exam_id || !question)
    return res.status(400).json({ message: 'Data tidak lengkap' });

  const q = {
    id: Date.now(),
    exam_id: Number(exam_id),
    question
  };
  db.questions.push(q);
  saveDB(db);
  res.json(q);
});

// UPDATE QUESTION
app.put('/questions/:id', (req, res) => {
  const db = loadDB();
  const q = db.questions.find(q => q.id == req.params.id);
  if (!q) return res.status(404).json({ message: 'Soal tidak ditemukan' });

  q.question = req.body.question || q.question;
  saveDB(db);
  res.json(q);
});

// DELETE QUESTION
app.delete('/questions/:id', (req, res) => {
  const db = loadDB();
  db.questions = db.questions.filter(q => q.id != req.params.id);
  saveDB(db);
  res.json({ message: 'Soal dihapus' });
});
// ================= COURSES CRUD =================

// GET ALL COURSES
app.get('/courses', (req, res) => {
  const db = loadDB();
  res.json(db.courses);
});

// CREATE COURSE
app.post('/courses', (req, res) => {
  const db = loadDB();
  const { name, time, description, instructor } = req.body;

  if (!name || !time || !description || !instructor) {
    return res.status(400).json({ message: 'Data tidak lengkap' });
  }

  const newCourse = {
    id: Date.now(),
    name,
    time,
    description,
    instructor
  };

  db.courses.push(newCourse);
  saveDB(db);
  res.json(newCourse);
});

// UPDATE COURSE
app.put('/courses/:id', (req, res) => {
  const db = loadDB();
  const idx = db.courses.findIndex(c => c.id == req.params.id);

  if (idx === -1) {
    return res.status(404).json({ message: 'Course tidak ditemukan' });
  }

  const { name, time, description, instructor } = req.body;

  if (name) db.courses[idx].name = name;
  if (time) db.courses[idx].time = time;
  if (description) db.courses[idx].description = description;
  if (instructor) db.courses[idx].instructor = instructor;

  saveDB(db);
  res.json(db.courses[idx]);
});

// DELETE COURSE
app.delete('/courses/:id', (req, res) => {
  const db = loadDB();
  const id = Number(req.params.id);

  db.courses = db.courses.filter(c => c.id !== id);
  saveDB(db);

  res.json({ message: 'Course dihapus' });
});

// ===== FORUM CRUD =====

// GET ALL FORUM POSTS
app.get('/forum', (req, res) => {
  const db = loadDB();
  res.json(db.forum);
});

// CREATE NEW POST
app.post('/forum', (req, res) => {
  const db = loadDB();
  const { content, user } = req.body;

  if (!content || !user) {
    return res.status(400).json({ message: 'Data tidak lengkap' });
  }
  const newPost = {
    id: Date.now(),
    content,
    user,
    createdAt: new Date().toISOString()
  };

  db.forum.push(newPost);
  saveDB(db);
  res.status(201).json(newPost);
});

// UPDATE POST
app.put('/forum/:id', (req, res) => {
  const db = loadDB();
  const id = Number(req.params.id);
  const post = db.forum.find(f => f.id === id);
  if (!post) return res.status(404).json({ message: 'Post tidak ditemukan' });

  const { content, user } = req.body;
  if (content) post.content = content;
  if (user) post.user = user;

  saveDB(db);
  res.json(post);
});

// DELETE POST
app.delete('/forum/:id', (req, res) => {
  const db = loadDB();
  const id = Number(req.params.id);
  const before = db.forum.length;

  db.forum = db.forum.filter(f => f.id !== id);
  if (db.forum.length === before)
    return res.status(404).json({ message: 'Post tidak ditemukan' });

  saveDB(db);
  res.json({ message: 'Post dihapus' });
});

// ===== CALENDAR CRUD =====

// GET ALL CALENDAR EVENTS
app.get('/calendar', (req, res) => {
  const db = loadDB();
  res.json(db.calendar || []); // pastikan ada array calendar
});

// GET EVENTS BY DATE
app.get('/calendar/date/:date', (req, res) => {
  const db = loadDB();
  const date = req.params.date; // format "yyyy-MM-dd"
  const events = (db.calendar || []).filter(e => e.date === date);
  res.json(events);
});

// CREATE NEW EVENT
app.post('/calendar', (req, res) => {
  const db = loadDB();
  const { date, title, description, user } = req.body;

  if (!date || !title || !user) {
    return res.status(400).json({ message: 'Data tidak lengkap' });
  }

  const newEvent = {
    id: Date.now(),
    date,
    title,
    description: description || '',
    user
  };

  if (!db.calendar) db.calendar = [];
  db.calendar.push(newEvent);
  saveDB(db);

  res.status(201).json(newEvent);
});

// UPDATE EVENT
app.put('/calendar/:id', (req, res) => {
  const db = loadDB();
  const id = Number(req.params.id);
  if (!db.calendar) db.calendar = [];

  const idx = db.calendar.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Event tidak ditemukan' });

  const { date, title, description, user } = req.body;
  if (date) db.calendar[idx].date = date;
  if (title) db.calendar[idx].title = title;
  if (description) db.calendar[idx].description = description;
  if (user) db.calendar[idx].user = user;

  saveDB(db);
  res.json(db.calendar[idx]);
});

// DELETE EVENT
app.delete('/calendar/:id', (req, res) => {
  const db = loadDB();
  const id = Number(req.params.id);
  if (!db.calendar) db.calendar = [];

  const before = db.calendar.length;
  db.calendar = db.calendar.filter(e => e.id !== id);

  if (db.calendar.length === before)
    return res.status(404).json({ message: 'Event tidak ditemukan' });

  saveDB(db);
  res.json({ message: 'Event dihapus' });
});


// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
