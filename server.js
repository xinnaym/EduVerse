import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initDatabase } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB schema & seed
initDatabase();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(__dirname));

// Helper: parse Auth user from header or query (for flexible demo / cookie / token)
function getAuthUser(req) {
  const authHeader = req.headers['authorization'];
  let userId = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    userId = parseInt(authHeader.replace('Bearer ', ''), 10);
  } else if (req.headers['x-user-id']) {
    userId = parseInt(req.headers['x-user-id'], 10);
  } else if (req.query.userId) {
    userId = parseInt(req.query.userId, 10);
  }

  if (!userId || isNaN(userId)) return null;

  try {
    const user = db.prepare('SELECT id, full_name, email, role, avatar, bio, expertise, experience, is_blocked FROM users WHERE id = ?').get(userId);
    return user || null;
  } catch (err) {
    return null;
  }
}

/* ==========================================================================
   1. AUTHENTICATION & USERS API
   ========================================================================== */

// Register
app.post('/api/auth/register', (req, res) => {
  const { full_name, email, password, role } = req.body;
  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'Пожалуйста, заполните все обязательные поля.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const validRole = role === 'teacher' ? 'teacher' : 'student';

  // Check if exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    return res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован.' });
  }

  const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(full_name)}&backgroundColor=4f46e5`;

  const insert = db.prepare(`
    INSERT INTO users (full_name, email, password, role, avatar, bio, expertise, experience)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insert.run(
    full_name.trim(),
    cleanEmail,
    password,
    validRole,
    defaultAvatar,
    validRole === 'teacher' ? 'Преподаватель образовательной платформы EduVerse' : 'Студент платформы EduVerse',
    validRole === 'teacher' ? 'Образовательные программы' : 'Обучение',
    'Новый пользователь'
  );

  const newUser = db.prepare('SELECT id, full_name, email, role, avatar, bio, expertise, experience FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'Регистрация прошла успешно!', user: newUser, token: newUser.id.toString() });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Введите email и пароль' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Неверный адрес электронной почты или пароль' });
  }

  if (user.is_blocked) {
    return res.status(403).json({ error: 'Ваш аккаунт временно заблокирован администратором' });
  }

  const safeUser = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    bio: user.bio,
    expertise: user.expertise,
    experience: user.experience
  };

  res.json({ message: 'Успешный вход!', user: safeUser, token: user.id.toString() });
});

// Reset Password
app.post('/api/auth/reset-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Укажите адрес электронной почты' });
  }
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'Пользователь с указанным email не найден' });
  }

  res.json({ message: `Инструкция по восстановлению пароля отправлена на почту ${email}. Проверьте папку «Входящие».` });
});

// Current user profile
app.get('/api/auth/me', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  res.json({ user });
});

/* ==========================================================================
   2. CATEGORIES API
   ========================================================================== */
app.get('/api/categories', (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM courses WHERE category_id = c.id AND is_published = 1) AS courses_count
    FROM categories c
    ORDER BY c.id ASC
  `).all();
  res.json(categories);
});

/* ==========================================================================
   3. COURSES API (Search, Filter, Sort, Pagination)
   ========================================================================== */
app.get('/api/courses', (req, res) => {
  const {
    category,
    level,
    price_type, // 'free', 'paid'
    min_rating,
    search,
    sort, // 'popular', 'newest', 'price_asc', 'price_desc', 'rating'
    page = 1,
    limit = 6,
    recommended
  } = req.query;

  let query = `
    SELECT c.*,
           cat.name AS category_name,
           u.full_name AS teacher_name,
           u.avatar AS teacher_avatar
    FROM courses c
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN users u ON c.teacher_id = u.id
    WHERE c.is_published = 1
  `;
  const params = [];

  if (category) {
    // category could be comma separated or single
    const catList = category.split(',').map(s => s.trim());
    query += ` AND (cat.slug IN (${catList.map(() => '?').join(',')}) OR cat.name IN (${catList.map(() => '?').join(',')}))`;
    params.push(...catList, ...catList);
  }

  if (level) {
    query += ` AND c.level = ?`;
    params.push(level);
  }

  if (price_type === 'free') {
    query += ` AND (c.is_free = 1 OR c.price = 0)`;
  } else if (price_type === 'paid') {
    query += ` AND (c.is_free = 0 AND c.price > 0)`;
  }

  if (min_rating) {
    query += ` AND c.rating >= ?`;
    params.push(parseFloat(min_rating));
  }

  if (search) {
    query += ` AND (c.title LIKE ? OR c.short_description LIKE ? OR u.full_name LIKE ? OR cat.name LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  if (recommended) {
    query += ` ORDER BY c.rating DESC, c.students_count DESC LIMIT 4`;
    const courses = db.prepare(query).all(...params);
    return res.json({ courses, total: courses.length, page: 1, totalPages: 1 });
  }

  // Sorting
  switch (sort) {
    case 'newest':
      query += ` ORDER BY c.created_at DESC`;
      break;
    case 'price_asc':
      query += ` ORDER BY (CASE WHEN c.discount_price > 0 THEN c.discount_price ELSE c.price END) ASC`;
      break;
    case 'price_desc':
      query += ` ORDER BY (CASE WHEN c.discount_price > 0 THEN c.discount_price ELSE c.price END) DESC`;
      break;
    case 'rating':
      query += ` ORDER BY c.rating DESC`;
      break;
    case 'popular':
    default:
      query += ` ORDER BY c.students_count DESC, c.rating DESC`;
      break;
  }

  // Count total matching
  const allRows = db.prepare(query).all(...params);
  const total = allRows.length;
  const numLimit = parseInt(limit, 10);
  const numPage = parseInt(page, 10);
  const offset = (numPage - 1) * numLimit;

  query += ` LIMIT ? OFFSET ?`;
  params.push(numLimit, offset);

  const courses = db.prepare(query).all(...params);

  // Parse JSON fields
  const parsedCourses = courses.map(c => ({
    ...c,
    what_you_will_learn: safeParseJSON(c.what_you_will_learn, []),
    skills: safeParseJSON(c.skills, [])
  }));

  res.json({
    courses: parsedCourses,
    total,
    page: numPage,
    limit: numLimit,
    totalPages: Math.ceil(total / numLimit) || 1
  });
});

// Single course details (modules, lessons, teacher, reviews)
app.get('/api/courses/:id', (req, res) => {
  const { id } = req.params;
  const isNumeric = !isNaN(parseInt(id, 10));

  let course = null;
  if (isNumeric) {
    course = db.prepare(`
      SELECT c.*, cat.name AS category_name, cat.slug AS category_slug,
             u.full_name AS teacher_name, u.avatar AS teacher_avatar,
             u.bio AS teacher_bio, u.expertise AS teacher_expertise, u.experience AS teacher_experience
      FROM courses c
      LEFT JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN users u ON c.teacher_id = u.id
      WHERE c.id = ?
    `).get(parseInt(id, 10));
  } else {
    course = db.prepare(`
      SELECT c.*, cat.name AS category_name, cat.slug AS category_slug,
             u.full_name AS teacher_name, u.avatar AS teacher_avatar,
             u.bio AS teacher_bio, u.expertise AS teacher_expertise, u.experience AS teacher_experience
      FROM courses c
      LEFT JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN users u ON c.teacher_id = u.id
      WHERE c.slug = ?
    `).get(id);
  }

  if (!course) {
    return res.status(404).json({ error: 'Курс не найден' });
  }

  // Lessons grouped by module
  const lessons = db.prepare(`
    SELECT * FROM lessons WHERE course_id = ? ORDER BY module_order ASC, lesson_order ASC
  `).all(course.id);

  // Modules structure
  const modulesMap = {};
  lessons.forEach(l => {
    if (!modulesMap[l.module_title]) {
      modulesMap[l.module_title] = {
        title: l.module_title,
        order: l.module_order,
        lessons: []
      };
    }
    modulesMap[l.module_title].lessons.push(l);
  });
  const modules = Object.values(modulesMap).sort((a, b) => a.order - b.order);

  // Reviews
  const reviews = db.prepare(`
    SELECT r.*, u.full_name AS user_name, u.avatar AS user_avatar
    FROM reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.course_id = ?
    ORDER BY r.created_at DESC
  `).all(course.id);

  // Check if current user is enrolled
  const user = getAuthUser(req);
  let isEnrolled = false;
  if (user) {
    const order = db.prepare('SELECT id FROM orders WHERE user_id = ? AND course_id = ?').get(user.id, course.id);
    if (order || user.role === 'admin' || user.id === course.teacher_id) {
      isEnrolled = true;
    }
  }

  res.json({
    course: {
      ...course,
      what_you_will_learn: safeParseJSON(course.what_you_will_learn, []),
      skills: safeParseJSON(course.skills, []),
      modules,
      lessons,
      reviews,
      isEnrolled
    }
  });
});

/* ==========================================================================
   4. LESSON PLAYBACK & PROGRESS API (Personal Student Room)
   ========================================================================== */
app.get('/api/lessons/:id', (req, res) => {
  const lessonId = parseInt(req.params.id, 10);
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);

  if (!lesson) {
    return res.status(404).json({ error: 'Урок не найден' });
  }

  const course = db.prepare(`
    SELECT c.*, u.full_name as teacher_name
    FROM courses c
    LEFT JOIN users u ON c.teacher_id = u.id
    WHERE c.id = ?
  `).get(lesson.course_id);

  // All lessons in this course
  const allLessons = db.prepare(`
    SELECT id, module_title, module_order, title, lesson_order, duration, lesson_type
    FROM lessons
    WHERE course_id = ?
    ORDER BY module_order ASC, lesson_order ASC
  `).all(lesson.course_id);

  // Determine prev and next
  const currentIndex = allLessons.findIndex(l => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  // Student progress
  const user = getAuthUser(req);
  let completedLessonIds = [];
  let isCompletedCurrent = false;

  if (user) {
    const progressList = db.prepare('SELECT lesson_id FROM progress WHERE user_id = ? AND course_id = ? AND completed = 1').all(user.id, lesson.course_id);
    completedLessonIds = progressList.map(p => p.lesson_id);
    isCompletedCurrent = completedLessonIds.includes(lessonId);
  }

  const percent = allLessons.length > 0 ? Math.round((completedLessonIds.length / allLessons.length) * 100) : 0;

  // Questions for this lesson
  const questions = db.prepare(`
    SELECT q.*, s.full_name AS student_name, s.avatar AS student_avatar,
           t.full_name AS teacher_name, t.avatar AS teacher_avatar
    FROM questions q
    LEFT JOIN users s ON q.student_id = s.id
    LEFT JOIN users t ON q.answered_by = t.id
    WHERE q.lesson_id = ?
    ORDER BY q.created_at DESC
  `).all(lessonId);

  res.json({
    lesson,
    course,
    allLessons,
    prevLesson,
    nextLesson,
    completedLessonIds,
    isCompletedCurrent,
    progressPercent: percent,
    questions
  });
});

// Toggle completion of lesson
app.post('/api/lessons/:id/toggle-complete', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Войдите в систему для сохранения прогресса' });
  }

  const lessonId = parseInt(req.params.id, 10);
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);
  if (!lesson) return res.status(404).json({ error: 'Урок не найден' });

  const existing = db.prepare('SELECT * FROM progress WHERE user_id = ? AND lesson_id = ?').get(user.id, lessonId);

  if (existing) {
    db.prepare('DELETE FROM progress WHERE id = ?').run(existing.id);
    res.json({ completed: false, message: 'Урок помечен как незавершенный' });
  } else {
    db.prepare(`
      INSERT INTO progress (user_id, course_id, lesson_id, completed)
      VALUES (?, ?, ?, 1)
    `).run(user.id, lesson.course_id, lessonId);
    res.json({ completed: true, message: 'Урок успешно завершен! Отличная работа!' });
  }
});

// Ask question on lesson
app.post('/api/lessons/:id/questions', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Войдите, чтобы задать вопрос преподавателю' });
  }

  const lessonId = parseInt(req.params.id, 10);
  const { question_text } = req.body;
  if (!question_text || !question_text.trim()) {
    return res.status(400).json({ error: 'Текст вопроса не может быть пустым' });
  }

  const lesson = db.prepare('SELECT course_id FROM lessons WHERE id = ?').get(lessonId);
  if (!lesson) return res.status(404).json({ error: 'Урок не найден' });

  const insert = db.prepare(`
    INSERT INTO questions (lesson_id, course_id, student_id, question_text)
    VALUES (?, ?, ?, ?)
  `);
  const result = insert.run(lessonId, lesson.course_id, user.id, question_text.trim());

  const newQ = db.prepare(`
    SELECT q.*, s.full_name AS student_name, s.avatar AS student_avatar
    FROM questions q
    LEFT JOIN users s ON q.student_id = s.id
    WHERE q.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ message: 'Вопрос отправлен преподавателю!', question: newQ });
});

/* ==========================================================================
   5. MY COURSES & ORDERS (Student cabinet)
   ========================================================================== */
app.get('/api/my-courses', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Необходимо авторизоваться' });
  }

  // Get all purchased/enrolled courses
  const orders = db.prepare(`
    SELECT o.id AS order_id, o.price_paid, o.created_at AS purchased_at,
           c.*, cat.name AS category_name, u.full_name AS teacher_name
    FROM orders o
    JOIN courses c ON o.course_id = c.id
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN users u ON c.teacher_id = u.id
    WHERE o.user_id = ?
    ORDER BY o.created_at DESC
  `).all(user.id);

  // Compute progress for each course
  const coursesWithProgress = orders.map(course => {
    const totalLessons = db.prepare('SELECT COUNT(*) as count FROM lessons WHERE course_id = ?').get(course.id).count;
    const completedCount = db.prepare('SELECT COUNT(*) as count FROM progress WHERE user_id = ? AND course_id = ? AND completed = 1').get(user.id, course.id).count;
    const percent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
    const isCompleted = percent >= 100;

    // Get first unfinished lesson or first lesson
    const firstLesson = db.prepare('SELECT id FROM lessons WHERE course_id = ? ORDER BY module_order ASC, lesson_order ASC LIMIT 1').get(course.id);

    return {
      ...course,
      total_lessons: totalLessons,
      completed_lessons: completedCount,
      progress_percent: percent,
      status: isCompleted ? 'completed' : 'in_progress',
      next_lesson_id: firstLesson ? firstLesson.id : null,
      certificate_eligible: isCompleted
    };
  });

  // Personal recommendations: courses not yet purchased
  const purchasedIds = orders.map(o => o.id);
  let recQuery = `
    SELECT c.*, cat.name AS category_name, u.full_name AS teacher_name
    FROM courses c
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN users u ON c.teacher_id = u.id
    WHERE c.is_published = 1
  `;
  if (purchasedIds.length > 0) {
    recQuery += ` AND c.id NOT IN (${purchasedIds.join(',')})`;
  }
  recQuery += ` ORDER BY c.rating DESC, c.students_count DESC LIMIT 3`;
  const recommendations = db.prepare(recQuery).all();

  res.json({
    courses: coursesWithProgress,
    recommendations
  });
});

// Checkout / Enroll in course
app.post('/api/orders/checkout', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Войдите в систему для покупки курса' });
  }

  const { course_id, payment_method = 'card' } = req.body;
  if (!course_id) return res.status(400).json({ error: 'Укажите ID курса' });

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(course_id);
  if (!course) return res.status(404).json({ error: 'Курс не найден' });

  // Check if already purchased
  const existing = db.prepare('SELECT id FROM orders WHERE user_id = ? AND course_id = ?').get(user.id, course_id);
  if (existing) {
    return res.json({ message: 'Курс уже есть в вашем личном кабинете!', alreadyPurchased: true, orderId: existing.id });
  }

  const pricePaid = course.discount_price > 0 ? course.discount_price : (course.is_free ? 0 : course.price);

  const insert = db.prepare(`
    INSERT INTO orders (user_id, course_id, price_paid, status, payment_method)
    VALUES (?, ?, ?, 'completed', ?)
  `);
  insert.run(user.id, course_id, pricePaid, payment_method);

  // Increment student count on course
  db.prepare('UPDATE courses SET students_count = students_count + 1 WHERE id = ?').run(course_id);

  res.status(201).json({
    message: 'Поздравляем! Курс успешно добавлен в ваш личный кабинет.',
    success: true,
    courseTitle: course.title
  });
});

// Add course review
app.post('/api/courses/:id/reviews', (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Войдите в систему, чтобы оставить отзыв' });
  }

  const courseId = parseInt(req.params.id, 10);
  const { rating, comment } = req.body;

  const numRating = parseInt(rating, 10);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'Оценка должна быть от 1 до 5 звезд' });
  }
  if (!comment || !comment.trim()) {
    return res.status(400).json({ error: 'Напишите текст отзыва' });
  }

  // Insert review
  const insert = db.prepare('INSERT INTO reviews (course_id, user_id, rating, comment) VALUES (?, ?, ?, ?)');
  insert.run(courseId, user.id, numRating, comment.trim());

  // Recalculate average rating & reviews_count
  const stats = db.prepare(`
    SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE course_id = ?
  `).get(courseId);

  db.prepare('UPDATE courses SET rating = ?, reviews_count = ? WHERE id = ?')
    .run(Math.round((stats.avg_rating || 5) * 10) / 10, stats.count, courseId);

  res.status(201).json({ message: 'Спасибо за ваш отзыв!' });
});

/* ==========================================================================
   6. TEACHER DASHBOARD API
   ========================================================================== */
app.get('/api/teacher/dashboard', (req, res) => {
  const user = getAuthUser(req);
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только преподавателям' });
  }

  // Teacher courses
  const courses = db.prepare(`
    SELECT c.*, cat.name as category_name,
           (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as lessons_count,
           (SELECT COUNT(*) FROM orders WHERE course_id = c.id) as orders_count,
           (SELECT COALESCE(SUM(price_paid), 0) FROM orders WHERE course_id = c.id) as revenue
    FROM courses c
    LEFT JOIN categories cat ON c.category_id = cat.id
    WHERE c.teacher_id = ?
    ORDER BY c.created_at DESC
  `).all(user.id);

  // Overall statistics
  const totalStudents = db.prepare(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM orders
    WHERE course_id IN (SELECT id FROM courses WHERE teacher_id = ?)
  `).get(user.id).count;

  const totalRevenue = courses.reduce((sum, c) => sum + (c.revenue || 0), 0);
  const avgRating = courses.length > 0
    ? (courses.reduce((sum, c) => sum + c.rating, 0) / courses.length).toFixed(1)
    : '5.0';

  // Questions from students
  const questions = db.prepare(`
    SELECT q.*, l.title as lesson_title, c.title as course_title,
           s.full_name as student_name, s.avatar as student_avatar
    FROM questions q
    JOIN courses c ON q.course_id = c.id
    JOIN lessons l ON q.lesson_id = l.id
    JOIN users s ON q.student_id = s.id
    WHERE c.teacher_id = ?
    ORDER BY (q.answer_text IS NULL) DESC, q.created_at DESC
  `).all(user.id);

  res.json({
    stats: {
      totalCourses: courses.length,
      totalStudents,
      totalRevenue,
      avgRating
    },
    courses,
    questions,
    profile: user
  });
});

// Teacher create new course
app.post('/api/teacher/courses', (req, res) => {
  const user = getAuthUser(req);
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Доступ разрешен только преподавателям' });
  }

  const {
    title, category_id, short_description, description,
    what_you_will_learn, target_audience, skills, level,
    price, discount_price, is_free, image, preview_video
  } = req.body;

  if (!title) return res.status(400).json({ error: 'Название курса обязательно' });

  const slug = title.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '-').replace(/-+/g, '-') + '-' + Date.now();

  const insert = db.prepare(`
    INSERT INTO courses (
      category_id, teacher_id, title, slug, short_description, description,
      what_you_will_learn, target_audience, skills, level, price, discount_price, is_free,
      image, preview_video, rating, reviews_count, students_count, is_published
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5.0, 0, 0, 1)
  `);

  const result = insert.run(
    category_id ? parseInt(category_id, 10) : 1,
    user.id,
    title,
    slug,
    short_description || '',
    description || '',
    JSON.stringify(Array.isArray(what_you_will_learn) ? what_you_will_learn : [what_you_will_learn || 'Освоение профессии']),
    target_audience || 'Для всех желающих учиться',
    JSON.stringify(Array.isArray(skills) ? skills : ['Практические навыки']),
    level || 'начальный',
    is_free ? 0 : (parseInt(price, 10) || 0),
    parseInt(discount_price, 10) || 0,
    is_free ? 1 : 0,
    image || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80',
    preview_video || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
  );

  res.status(201).json({ message: 'Курс успешно создан!', courseId: result.lastInsertRowid });
});

// Teacher update course
app.put('/api/teacher/courses/:id', (req, res) => {
  const user = getAuthUser(req);
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }

  const courseId = parseInt(req.params.id, 10);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return res.status(404).json({ error: 'Курс не найден' });
  if (user.role !== 'admin' && course.teacher_id !== user.id) {
    return res.status(403).json({ error: 'Вы можете редактировать только свои курсы' });
  }

  const {
    title, category_id, short_description, description,
    level, price, discount_price, is_free, image, is_published
  } = req.body;

  db.prepare(`
    UPDATE courses
    SET title = COALESCE(?, title),
        category_id = COALESCE(?, category_id),
        short_description = COALESCE(?, short_description),
        description = COALESCE(?, description),
        level = COALESCE(?, level),
        price = COALESCE(?, price),
        discount_price = COALESCE(?, discount_price),
        is_free = COALESCE(?, is_free),
        image = COALESCE(?, image),
        is_published = COALESCE(?, is_published)
    WHERE id = ?
  `).run(
    title, category_id, short_description, description,
    level, price !== undefined ? parseInt(price, 10) : null,
    discount_price !== undefined ? parseInt(discount_price, 10) : null,
    is_free !== undefined ? (is_free ? 1 : 0) : null,
    image,
    is_published !== undefined ? (is_published ? 1 : 0) : null,
    courseId
  );

  res.json({ message: 'Курс обновлен!' });
});

// Teacher delete course
app.delete('/api/teacher/courses/:id', (req, res) => {
  const user = getAuthUser(req);
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }

  const courseId = parseInt(req.params.id, 10);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return res.status(404).json({ error: 'Курс не найден' });
  if (user.role !== 'admin' && course.teacher_id !== user.id) {
    return res.status(403).json({ error: 'Вы можете удалять только свои курсы' });
  }

  db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
  res.json({ message: 'Курс успешно удален' });
});

// Teacher add lesson to course
app.post('/api/teacher/courses/:id/lessons', (req, res) => {
  const user = getAuthUser(req);
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }

  const courseId = parseInt(req.params.id, 10);
  const { module_title, title, lesson_type, duration, video_url, code_snippet, materials_name, materials_url } = req.body;

  if (!title || !module_title) {
    return res.status(400).json({ error: 'Укажите название модуля и урока' });
  }

  const lastOrder = db.prepare('SELECT MAX(lesson_order) as maxOrder FROM lessons WHERE course_id = ?').get(courseId);
  const lessonOrder = (lastOrder.maxOrder || 0) + 1;

  const insert = db.prepare(`
    INSERT INTO lessons (
      course_id, module_title, module_order, title, lesson_order, duration,
      video_url, code_snippet, lesson_type, materials_url, materials_name
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    courseId,
    module_title,
    title,
    lessonOrder,
    duration || '15:00',
    video_url || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    code_snippet || '// Напишите решение здесь',
    lesson_type || 'video',
    materials_url || '#/materials.pdf',
    materials_name || 'Материалы к уроку'
  );

  res.status(201).json({ message: 'Урок успешно добавлен в программу курса!' });
});

// Teacher answer student question
app.post('/api/teacher/questions/:id/answer', (req, res) => {
  const user = getAuthUser(req);
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }

  const qId = parseInt(req.params.id, 10);
  const { answer_text } = req.body;

  if (!answer_text || !answer_text.trim()) {
    return res.status(400).json({ error: 'Введите текст ответа' });
  }

  db.prepare(`
    UPDATE questions
    SET answer_text = ?, answered_by = ?, answered_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(answer_text.trim(), user.id, qId);

  res.json({ message: 'Ответ сохранен и отправлен студенту!' });
});

// Teacher update profile
app.put('/api/teacher/profile', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });

  const { full_name, bio, expertise, experience, avatar } = req.body;

  db.prepare(`
    UPDATE users
    SET full_name = COALESCE(?, full_name),
        bio = COALESCE(?, bio),
        expertise = COALESCE(?, expertise),
        experience = COALESCE(?, experience),
        avatar = COALESCE(?, avatar)
    WHERE id = ?
  `).run(full_name, bio, expertise, experience, avatar, user.id);

  const updated = db.prepare('SELECT id, full_name, email, role, avatar, bio, expertise, experience FROM users WHERE id = ?').get(user.id);
  res.json({ message: 'Профиль успешно обновлен!', user: updated });
});

/* ==========================================================================
   7. ADMIN PANEL API
   ========================================================================== */
app.get('/api/admin/dashboard', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам платформы' });
  }

  // Platform stats
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalTeachers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'teacher'").get().count;
  const totalStudents = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get().count;
  const totalCourses = db.prepare('SELECT COUNT(*) as count FROM courses').get().count;
  const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(price_paid), 0) as total FROM orders').get().total;

  // Users list
  const users = db.prepare('SELECT id, full_name, email, role, is_blocked, created_at FROM users ORDER BY created_at DESC').all();

  // Courses list
  const courses = db.prepare(`
    SELECT c.*, cat.name as category_name, u.full_name as teacher_name
    FROM courses c
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN users u ON c.teacher_id = u.id
    ORDER BY c.created_at DESC
  `).all();

  // Categories list
  const categories = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM courses WHERE category_id = c.id) as courses_count
    FROM categories c
    ORDER BY c.name ASC
  `).all();

  // Blog posts
  const blogPosts = db.prepare(`
    SELECT b.*, u.full_name as author_name
    FROM blog_posts b
    LEFT JOIN users u ON b.author_id = u.id
    ORDER BY b.created_at DESC
  `).all();

  res.json({
    stats: {
      totalUsers,
      totalTeachers,
      totalStudents,
      totalCourses,
      totalOrders,
      totalRevenue
    },
    users,
    courses,
    categories,
    blogPosts
  });
});

// Admin toggle block user
app.post('/api/admin/users/:id/toggle-block', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' });

  const targetId = parseInt(req.params.id, 10);
  const target = db.prepare('SELECT id, is_blocked FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  const newStatus = target.is_blocked ? 0 : 1;
  db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(newStatus, targetId);

  res.json({ message: newStatus ? 'Пользователь заблокирован' : 'Пользователь разблокирован', is_blocked: newStatus });
});

// Admin change user role
app.post('/api/admin/users/:id/role', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' });

  const targetId = parseInt(req.params.id, 10);
  const { role } = req.body;
  if (!['student', 'teacher', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Некорректная роль' });
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
  res.json({ message: `Роль пользователя изменена на «${role}»` });
});

// Admin create / edit / delete category
app.post('/api/admin/categories', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' });

  const { name, slug, icon, description } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Укажите название и slug' });

  try {
    const insert = db.prepare('INSERT INTO categories (name, slug, icon, description) VALUES (?, ?, ?, ?)');
    insert.run(name, slug, icon || '📚', description || '');
    res.status(201).json({ message: 'Категория успешно создана' });
  } catch (err) {
    res.status(400).json({ error: 'Ошибка создания: возможно, slug уже существует' });
  }
});

app.delete('/api/admin/categories/:id', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' });

  const catId = parseInt(req.params.id, 10);
  db.prepare('DELETE FROM categories WHERE id = ?').run(catId);
  res.json({ message: 'Категория удалена' });
});

// Admin create blog post
app.post('/api/admin/blog', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' });

  const { title, category, summary, content, image } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Заполните заголовок и текст статьи' });

  const slug = title.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '-').replace(/-+/g, '-') + '-' + Date.now();

  const insert = db.prepare(`
    INSERT INTO blog_posts (title, slug, category, summary, content, image, author_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    title,
    slug,
    category || 'Образование',
    summary || title,
    content,
    image || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80',
    user.id
  );

  res.status(201).json({ message: 'Статья успешно опубликована в блоге!' });
});

app.delete('/api/admin/blog/:id', (req, res) => {
  const user = getAuthUser(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Недостаточно прав' });

  const postId = parseInt(req.params.id, 10);
  db.prepare('DELETE FROM blog_posts WHERE id = ?').run(postId);
  res.json({ message: 'Статья удалена' });
});

/* ==========================================================================
   8. TEACHERS LIST & PROFILE API
   ========================================================================== */
app.get('/api/teachers', (req, res) => {
  const teachers = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.avatar, u.bio, u.expertise, u.experience,
           (SELECT COUNT(*) FROM courses WHERE teacher_id = u.id AND is_published = 1) as courses_count,
           (SELECT COALESCE(ROUND(AVG(rating), 1), 5.0) FROM courses WHERE teacher_id = u.id AND is_published = 1) as avg_rating
    FROM users u
    WHERE u.role = 'teacher' AND u.is_blocked = 0
    ORDER BY u.id ASC
  `).all();

  // Attach courses to each teacher
  const fullTeachers = teachers.map(t => {
    const courses = db.prepare(`
      SELECT id, title, slug, price, discount_price, is_free, rating, image
      FROM courses
      WHERE teacher_id = ? AND is_published = 1
    `).all(t.id);
    return { ...t, courses };
  });

  res.json(fullTeachers);
});

/* ==========================================================================
   9. BLOG & COMMENTS API
   ========================================================================== */
app.get('/api/blog', (req, res) => {
  const { search, category } = req.query;
  let query = `
    SELECT b.*, u.full_name as author_name, u.avatar as author_avatar,
           (SELECT COUNT(*) FROM blog_comments WHERE post_id = b.id) as comments_count
    FROM blog_posts b
    LEFT JOIN users u ON b.author_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (category) {
    query += ` AND b.category = ?`;
    params.push(category);
  }

  if (search) {
    query += ` AND (b.title LIKE ? OR b.summary LIKE ? OR b.content LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  query += ` ORDER BY b.created_at DESC`;

  const posts = db.prepare(query).all(...params);
  res.json(posts);
});

app.get('/api/blog/:id', (req, res) => {
  const { id } = req.params;
  const isNumeric = !isNaN(parseInt(id, 10));

  let post = null;
  if (isNumeric) {
    post = db.prepare(`
      SELECT b.*, u.full_name as author_name, u.avatar as author_avatar
      FROM blog_posts b
      LEFT JOIN users u ON b.author_id = u.id
      WHERE b.id = ?
    `).get(parseInt(id, 10));
  } else {
    post = db.prepare(`
      SELECT b.*, u.full_name as author_name, u.avatar as author_avatar
      FROM blog_posts b
      LEFT JOIN users u ON b.author_id = u.id
      WHERE b.slug = ?
    `).get(id);
  }

  if (!post) {
    return res.status(404).json({ error: 'Статья не найдена' });
  }

  // Increment views
  db.prepare('UPDATE blog_posts SET views = views + 1 WHERE id = ?').run(post.id);

  // Comments
  const comments = db.prepare(`
    SELECT c.*, u.avatar as user_avatar
    FROM blog_comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(post.id);

  res.json({ post, comments });
});

app.post('/api/blog/:id/comments', (req, res) => {
  const { id } = req.params;
  const { content, user_name } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Комментарий не может быть пустым' });
  }

  const user = getAuthUser(req);
  const authorName = user ? user.full_name : (user_name && user_name.trim() ? user_name.trim() : 'Гость');
  const userId = user ? user.id : null;

  const insert = db.prepare('INSERT INTO blog_comments (post_id, user_id, user_name, content) VALUES (?, ?, ?, ?)');
  insert.run(parseInt(id, 10), userId, authorName, content.trim());

  res.status(201).json({ message: 'Комментарий добавлен!' });
});

/* ==========================================================================
   Fallback to index.html for SPA-style links if needed
   ========================================================================== */
app.get('*', (req, res, next) => {
  // If request has extension like .html, .css, .js, .png, pass along
  if (path.extname(req.path)) {
    return next();
  }
  // Otherwise serve index.html
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper function
function safeParseJSON(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`EduVerse backend server running on http://0.0.0.0:${PORT}`);
});
