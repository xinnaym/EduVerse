import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'eduverse.db');

export const db = new DatabaseSync(dbPath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      avatar TEXT,
      bio TEXT,
      expertise TEXT,
      experience TEXT,
      is_blocked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      short_description TEXT,
      description TEXT,
      what_you_will_learn TEXT,
      target_audience TEXT,
      skills TEXT,
      level TEXT DEFAULT 'начальный',
      price INTEGER NOT NULL DEFAULT 0,
      discount_price INTEGER DEFAULT 0,
      is_free INTEGER DEFAULT 0,
      image TEXT,
      preview_video TEXT,
      rating REAL DEFAULT 5.0,
      reviews_count INTEGER DEFAULT 0,
      students_count INTEGER DEFAULT 0,
      is_published INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      module_title TEXT NOT NULL,
      module_order INTEGER DEFAULT 1,
      title TEXT NOT NULL,
      lesson_order INTEGER DEFAULT 1,
      duration TEXT DEFAULT '15:00',
      video_url TEXT,
      code_snippet TEXT,
      lesson_type TEXT DEFAULT 'video',
      materials_url TEXT,
      materials_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      price_paid INTEGER NOT NULL,
      status TEXT DEFAULT 'completed',
      payment_method TEXT DEFAULT 'card',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
      completed INTEGER DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, lesson_id)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      answer_text TEXT,
      answered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      answered_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS blog_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      summary TEXT,
      content TEXT NOT NULL,
      image TEXT,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      views INTEGER DEFAULT 140,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS blog_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER REFERENCES blog_posts(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Check if categories already seeded
  const catCount = db.prepare('SELECT count(*) as count FROM categories').get().count;
  if (catCount === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  // 1. Categories
  const insertCat = db.prepare('INSERT INTO categories (slug, name, icon, description) VALUES (?, ?, ?, ?)');
  insertCat.run('programming', 'Программирование', '💻', 'Frontend, Backend, мобильная разработка и алгоритмы');
  insertCat.run('design', 'Дизайн', '🎨', 'UI/UX дизайн в Figma, графический дизайн, анимация и 3D');
  insertCat.run('marketing', 'Маркетинг', '📈', 'Интернет-маркетинг, SEO, таргетированная реклама и SMM');
  insertCat.run('languages', 'Языки', '🌍', 'Английский для IT, деловой английский, китайский и немецкий');
  insertCat.run('soft-skills', 'Личностный рост', '🚀', 'Тайм-менеджмент, публичные выступления, лидерство и переговоры');

  // 2. Users (Admin, Teachers, Student)
  const insertUser = db.prepare(`
    INSERT INTO users (full_name, email, password, role, avatar, bio, expertise, experience)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    'Алексей Волков (Администратор)',
    'admin@eduverse.ru',
    'admin123',
    'admin',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    'Главный администратор платформы EduVerse. Координация образовательных программ и качества.',
    'Управление образовательными продуктами',
    '12 лет в EdTech'
  );

  insertUser.run(
    'Анна Смирнова',
    'teacher@eduverse.ru',
    'teacher123',
    'teacher',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
    'Senior Frontend разработчик и тимлид. 10 лет опыта в коммерческой разработке. Автор бестселлеров по веб-разработке.',
    'JavaScript, TypeScript, React, Архитектура веб-приложений',
    '10 лет в веб-разработке, бывший техлид в крупных IT-компаниях'
  );

  insertUser.run(
    'Игорь Петров',
    'petrov@eduverse.ru',
    'teacher123',
    'teacher',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    'Ведущий продуктовый дизайнер (Lead Product Designer). Работал над финтех и SaaS сервисами с аудиторией более 5 млн человек.',
    'UI/UX дизайн, Figma, Дизайн-системы, UX-исследования',
    '8 лет в продуктовом дизайне, спикер конференций'
  );

  insertUser.run(
    'Михаил Соколов',
    'sokolov@eduverse.ru',
    'teacher123',
    'teacher',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
    'Data Scientist & Python архитектор. Разрабатывает ML-модели и системы предиктивной аналитики.',
    'Python, Data Science, Pandas, Machine Learning',
    '7 лет в машинном обучении и анализе больших данных'
  );

  insertUser.run(
    'Елена Ковалева',
    'kovaleva@eduverse.ru',
    'teacher123',
    'teacher',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=300&q=80',
    'Директор по маркетингу (CMO) в международных проектах. Эксперт по сквозной аналитике и перформанс-маркетингу.',
    'Интернет-маркетинг, SEO, Таргет, Unit-экономика',
    '9 лет в digital-маркетинге'
  );

  insertUser.run(
    'Илья Лекалин',
    'student@eduverse.ru',
    'student123',
    'student',
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
    'Студент платформы EduVerse. Изучает фронтенд и дизайн цифровых продуктов.',
    'Веб-разработка, JavaScript',
    'Начинающий специалист'
  );

  // 3. Courses
  const insertCourse = db.prepare(`
    INSERT INTO courses (
      category_id, teacher_id, title, slug, short_description, description,
      what_you_will_learn, target_audience, skills, level, price, discount_price, is_free,
      image, preview_video, rating, reviews_count, students_count, is_published
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Course 1
  insertCourse.run(
    1, 2,
    'JavaScript с нуля до PRO',
    'javascript-from-zero-to-pro',
    'Полный курс по современному JavaScript: от базового синтаксиса до асинхронного программирования, DOM и реальных проектов.',
    'Этот курс научит вас уверенно программировать на JavaScript с нуля. Вы освоите современный синтаксис ES6+, работу с DOM-деревом, событиями браузера, асинхронными запросами Fetch API, промисами, async/await, сборщиками модулей и напишете 5 практических портфолио-проектов под руководством опытного наставника.',
    JSON.stringify([
      'Писать чистый, надежный и современный JavaScript (ES6+)',
      'Работать с DOM, браузерными событиями и формами без библиотек',
      'Освоить асинхронность: Promise, async/await, REST API запросы',
      'Применять паттерны проектирования и ООП в JavaScript',
      'Создавать интерактивные одностраничные веб-приложения'
    ]),
    'Для начинающих разработчиков, верстальщиков, желающих перейти в программирование, и студентов технических специальностей.',
    JSON.stringify(['JavaScript', 'ES6+', 'DOM API', 'Async/Await', 'REST API', 'Git', 'Vite']),
    'начальный',
    4990, 3990, 0,
    'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?auto=format&fit=crop&w=800&q=80',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    4.9, 128, 420, 1
  );

  // Course 2
  insertCourse.run(
    2, 3,
    'UI/UX дизайн в Figma: от идеи до прототипа',
    'ui-ux-design-in-figma',
    'Изучите создание современных интерфейсов, адаптивных сеток, интерактивных прототипов и дизайн-систем в Figma.',
    'Практический интенсив по созданию пользовательских интерфейсов мобильных и веб-приложений. Вы пройдете все этапы продуктового дизайна: анализ аудитории, CJM, создание wireframes, визуальный дизайн по сеткам 8pt, компоненты с автолейаутами (Auto Layout), варианты и интерактивные прототипы.',
    JSON.stringify([
      'Работать в Figma на уровне продвинутого продуктового дизайнера',
      'Создавать сложные гибкие компоненты с Auto Layout и Variants',
      'Проектировать дизайн-системы, токены и библиотеки стилей',
      'Проводить качественные UX-исследования и тестировать гипотезы',
      'Готовить макеты к передаче в разработку'
    ]),
    'Для начинающих дизайнеров, графических дизайнеров, желающих уйти в digital, а также frontend-разработчиков и продакт-менеджеров.',
    JSON.stringify(['Figma', 'UI Design', 'UX Research', 'Auto Layout', 'Design Systems', 'Prototyping']),
    'начальный',
    5490, 4290, 0,
    'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=800&q=80',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    4.8, 96, 310, 1
  );

  // Course 3
  insertCourse.run(
    3, 5,
    'Интернет-маркетинг с нуля: быстрый старт',
    'internet-marketing-quickstart',
    'Комплексный курс по привлечению клиентов: таргетированная реклама, контекст, SEO-оптимизация и веб-аналитика.',
    'Курс научит вас выстраивать стратегию digital-маркетинга для любого бизнеса. Вы научитесь анализировать конкурентов, настраивать контекстную и таргетированную рекламу, управлять бюджетами, считать юнит-экономику (CAC, LTV, ROI) и оптимизировать конверсию посадочных страниц.',
    JSON.stringify([
      'Разрабатывать комплексную маркетинговую стратегию бренда',
      'Настраивать рекламу в Яндекс.Директ и соцсетях',
      'Работать с Яндекс.Метрикой и Google Analytics 4',
      'Проводить A/B тестирование и увеличивать конверсию сайта',
      'Считать юнит-экономику и окупаемость каналов продвижения'
    ]),
    'Для начинающих маркетологов, предпринимателей, фрилансеров и специалистов смежных направлений.',
    JSON.stringify(['Яндекс.Директ', 'Таргет', 'SEO', 'Google Analytics', 'A/B тесты', 'CJM']),
    'средний',
    4490, 0, 0,
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    4.7, 74, 245, 1
  );

  // Course 4 (Free!)
  insertCourse.run(
    1, 2,
    'Основы HTML и CSS: быстрый старт в веб',
    'html-css-free-fundamentals',
    'Бесплатный практический вводный курс для тех, кто делает первые шаги в создании сайтов и верстке.',
    'Узнайте основы веб-технологий: структура HTML5 документа, семантические теги, каскадные таблицы стилей CSS3, блочная модель, flexbox и основы адаптивности под мобильные экраны.',
    JSON.stringify([
      'Понимать, как устроен веб и браузерный рендеринг',
      'Писать валидный семантический HTML5 код',
      'Стилизовать элементы с помощью современного CSS3 и Flexbox',
      'Создавать первые адаптивные страницы для портфолио'
    ]),
    'Для абсолютных новичков без опыта в программировании.',
    JSON.stringify(['HTML5', 'CSS3', 'Flexbox', 'Responsive Web']),
    'начальный',
    0, 0, 1,
    'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=800&q=80',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    4.9, 310, 1150, 1
  );

  // Course 5
  insertCourse.run(
    1, 4,
    'Python для анализа данных и автоматизации',
    'python-data-analysis',
    'Освойте Python, библиотеки NumPy, Pandas, визуализацию в Matplotlib и автоматизацию рутинных задач.',
    'Интенсивный курс для тех, кто хочет научиться работать с большими таблицами, парсить сайты, строить аналитические дашборды и автоматизировать обработку информации.',
    JSON.stringify([
      'Основы синтаксиса Python 3: функции, структуры данных, классы',
      'Обработка и очистка данных в библиотеке Pandas',
      'Визуализация в Matplotlib и Seaborn',
      'Сбор данных с сайтов с помощью BeautifulSoup и API'
    ]),
    'Аналитикам, экономистам, менеджерам и будущим дата-сайентистам.',
    JSON.stringify(['Python', 'Pandas', 'NumPy', 'Data Analysis', 'Automation']),
    'средний',
    6490, 4990, 0,
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=800&q=80',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    4.8, 85, 290, 1
  );

  // Course 6
  insertCourse.run(
    4, 2,
    'Деловой английский для IT-специалистов',
    'business-english-for-it',
    'Пройдите международное собеседование, общайтесь с иностранными коллегами и пишите техническую документацию.',
    'Курс разработан специально для программистов, дизайнеров и проектных менеджеров. Фокус на реальных диалогах, Scrum-митингах, презентациях решений и переписке в Slack и Jira.',
    JSON.stringify([
      'Уверенно проходить скрининг и техническое интервью на английском',
      'Вести дейли, демо и ретроспективы на зарубежных проектах',
      'Грамотно формулировать задачи, баг-репорты и code review',
      'Расширить профессиональный словарный запас IT-терминологии'
    ]),
    'Разработчикам уровня Pre-Intermediate и выше, планирующим международную карьеру.',
    JSON.stringify(['English in IT', 'Interviews', 'Tech Writing', 'Communication']),
    'средний',
    3990, 0, 0,
    'https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=800&q=80',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
    4.6, 52, 180, 1
  );

  // Course 7
  insertCourse.run(
    5, 2,
    'Тайм-менеджмент и личная продуктивность',
    'time-management-and-productivity',
    'Научитесь управлять временем без выгорания, выстраивать систему привычек и достигать карьерных целей.',
    'Практический тренинг по прикладным системам планирования: Time-blocking, GTD, матрица Эйзенхауэра и методы глубокой концентрации (Deep Work).',
    JSON.stringify([
      'Выстроить персональную систему управления задачами в Notion/Todoist',
      'Избавиться от прокрастинации и хронической перегрузки',
      'Сохранять баланс между интенсивной учебой, работой и отдыхом'
    ]),
    'Для всех, кто хочет успевать больше и снизить уровень стресса.',
    JSON.stringify(['Productivity', 'GTD', 'Notion', 'Habits', 'Focus']),
    'начальный',
    2490, 1990, 0,
    'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=800&q=80',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    4.9, 114, 520, 1
  );

  // 4. Lessons for Course 1 (JavaScript)
  const insertLesson = db.prepare(`
    INSERT INTO lessons (
      course_id, module_title, module_order, title, lesson_order, duration,
      video_url, code_snippet, lesson_type, materials_url, materials_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertLesson.run(
    1, 'Модуль 1. Введение в JavaScript', 1,
    'Урок 1. Введение и настройка окружения (VS Code, Node, DevTools)', 1, '14:20',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    '// Проверка окружения\nconsole.log("EduVerse JavaScript Environment Ready!");\nconst platform = "EduVerse";\nconsole.log(`Добро пожаловать на платформу ${platform}!`);',
    'video',
    '#/downloads/lesson1-cheatsheet.pdf', 'Презентация и шпаргалка по настройке VS Code (PDF)'
  );

  insertLesson.run(
    1, 'Модуль 1. Введение в JavaScript', 1,
    'Урок 2. Переменные (let, const) и базовые типы данных', 2, '18:45',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    '// Типы данных в JS\nconst courseName = "JavaScript с нуля до PRO";\nlet lessonsCount = 24;\nlet isCompleted = false;\n\nconsole.log(typeof courseName); // string\nconsole.log(typeof lessonsCount); // number',
    'video',
    '#/downloads/lesson2-types.pdf', 'Таблица типов данных и преобразований (PDF)'
  );

  insertLesson.run(
    1, 'Модуль 1. Введение в JavaScript', 1,
    'Урок 3. Операторы, ветвления (if/else, switch) и тернарный оператор', 3, '16:10',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    '// Интерактивное упражнение: проверка оценки\nfunction checkProgress(percent) {\n  if (percent >= 100) return "Курс успешно завершен! 🎓";\n  if (percent >= 50) return "Экватор пройден! 💪";\n  return "Отличное начало! Продолжайте обучение 🚀";\n}\n\nconsole.log(checkProgress(65));',
    'code',
    '#/downloads/lesson3-operators.zip', 'Практические задачи с автопроверкой (ZIP)'
  );

  insertLesson.run(
    1, 'Модуль 2. Функции и структуры данных', 2,
    'Урок 4. Функции: объявление, стрелочные функции и области видимости', 1, '21:30',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    'const calculateDiscount = (price, percent) => price - (price * percent / 100);\nconsole.log("Цена со скидкой:", calculateDiscount(4990, 20), "₽");',
    'video',
    '#/downloads/lesson4-functions.pdf', 'Конспект лекции по стрелочным функциям (PDF)'
  );

  insertLesson.run(
    1, 'Модуль 2. Функции и структуры данных', 2,
    'Урок 5. Массивы и высшие методы (map, filter, reduce)', 2, '24:15',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    'const courses = [\n  { title: "JS", price: 4990 },\n  { title: "Design", price: 5490 },\n  { title: "HTML", price: 0 }\n];\nconst paidCourses = courses.filter(c => c.price > 0);\nconsole.log("Платные курсы:", paidCourses);',
    'code',
    '#/downloads/lesson5-array-methods.pdf', 'Шпаргалка методов массивов (PDF)'
  );

  insertLesson.run(
    1, 'Модуль 3. DOM и работа с браузером', 3,
    'Урок 6. Поиск элементов в DOM и обработка событий клика и ввода', 1, '19:40',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
    '// Работа с DOM\nconst btn = document.createElement("button");\nbtn.textContent = "Нажми меня!";\nbtn.onclick = () => console.log("Кнопка нажата!");\nconsole.log("Элемент создан:", btn);',
    'video',
    '#/downloads/lesson6-dom-events.zip', 'Стартовый проект интерактивного калькулятора (ZIP)'
  );

  // Lessons for Course 2 (UI/UX Figma)
  insertLesson.run(
    2, 'Модуль 1. Основы Figma', 1,
    'Урок 1. Интерфейс Figma, фреймы и группы', 1, '15:10',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    '', 'video', '#/downloads/figma-shortcuts.pdf', 'Горячие клавиши Figma (PDF)'
  );
  insertLesson.run(
    2, 'Модуль 1. Основы Figma', 1,
    'Урок 2. Auto Layout и адаптивные карточки', 2, '22:40',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    '', 'video', '#/downloads/figma-ui-kit.fig', 'UI-Kit компонентной системы (FIG)'
  );

  // Lessons for Course 4 (HTML & CSS Free)
  insertLesson.run(
    4, 'Модуль 1. HTML основы', 1,
    'Урок 1. Структура веб-страницы и теги разметки', 1, '12:00',
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    '<!DOCTYPE html>\n<html>\n  <body>\n    <h1>Привет, EduVerse!</h1>\n    <p>Мой первый HTML сайт.</p>\n  </body>\n</html>',
    'code', '#/downloads/html-cheatsheet.pdf', 'Справочник HTML5 тегов'
  );

  // 5. Orders (User 6 - Student has purchased Course 1, 2, 3)
  const insertOrder = db.prepare('INSERT INTO orders (user_id, course_id, price_paid, status) VALUES (?, ?, ?, ?)');
  insertOrder.run(6, 1, 3990, 'completed');
  insertOrder.run(6, 2, 4290, 'completed');
  insertOrder.run(6, 3, 4490, 'completed');

  // 6. Progress (Student has completed some lessons)
  const insertProgress = db.prepare('INSERT INTO progress (user_id, course_id, lesson_id, completed) VALUES (?, ?, ?, ?)');
  insertProgress.run(6, 1, 1, 1);
  insertProgress.run(6, 1, 2, 1);
  // Course 2 completed 100%
  insertProgress.run(6, 2, 7, 1);
  insertProgress.run(6, 2, 8, 1);

  // 7. Reviews
  const insertReview = db.prepare('INSERT INTO reviews (course_id, user_id, rating, comment) VALUES (?, ?, ?, ?)');
  insertReview.run(1, 6, 5, 'Превосходный курс! Материал подается структурно, без лишней воды. Уроки по асинхронности наконец разложили все по полочкам.');
  insertReview.run(1, 1, 5, 'Отличный базовый курс для старта карьеры в веб-разработке. Практические задания с кодом очень помогают закрепить навыки.');
  insertReview.run(2, 6, 5, 'Благодаря этому курсу я собрал первое полноценное портфолио в Figma и научился строить адаптивные макеты с Auto Layout.');
  insertReview.run(3, 6, 4, 'Хороший обзор digital-маркетинга, много реальных кейсов и примеров расчёта юнит-экономики.');

  // 8. Questions from students
  const insertQuestion = db.prepare(`
    INSERT INTO questions (lesson_id, course_id, student_id, question_text, answer_text, answered_by, answered_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  insertQuestion.run(
    3, 1, 6,
    'В чем принципиальное отличие оператора == от строгого === в сложных условиях?',
    'Оператор == приводит типы перед сравнением (type coercion), а === сравнивает значения без приведения типов (и тип, и значение должны совпадать). В современном JS всегда рекомендуется использовать строгое равенство ===.',
    2
  );
  insertQuestion.run(
    2, 1, 6,
    'Можно ли объявлять объект через const и потом менять свойства внутри объекта?',
    'Да! const фиксирует саму ссылку на объект в памяти. Менять свойства объекта (user.age = 25) можно, но присвоить переменной новый объект (user = {}) нельзя.',
    2
  );

  // 9. Blog posts
  const insertBlog = db.prepare(`
    INSERT INTO blog_posts (title, slug, category, summary, content, image, author_id, views)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertBlog.run(
    '10 навыков, которые будут востребованы в IT и дизайне в 2025–2026 годах',
    '10-skills-in-demand-2025-2026',
    'Карьера',
    'Разбираем, какие компетенции помогут оставаться конкурентоспособным специалистом на глобальном рынке труда.',
    `Индустрия технологий развивается с беспрецедентной скоростью. Сегодня просто знать один синтаксис языка программирования или уметь рисовать формы в редакторе уже недостаточно.

Ключевыми факторами успеха становятся:
1. Системное инженерное мышление: умение декомпозировать сложные бизнес-требования на понятные модули.
2. Продуктовый подход: понимание метрик бизнеса, потребностей конечных пользователей и юнит-экономики.
3. Интеграция современных инструментов автоматизации в ежедневный рабочий процесс.
4. Навыки работы с асинхронными API и распределенными системами.
5. Soft skills: умение аргументировать архитектурные решения и работать в кросс-функциональной распределенной команде.

На платформе EduVerse мы выстраиваем все программы обучения с акцентом именно на эти долгосрочные практические навыки.`,
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80',
    2, 342
  );

  insertBlog.run(
    'Как составить портфолио начинающему разработчику и дизайнеру',
    'how-to-build-a-stellar-portfolio',
    'Образование',
    'Практическое руководство по отбору проектов, оформлению кейсов и подготовке к техническим собеседованиям.',
    `Портфолио — это ваше главное резюме. Работодатели хотят видеть не просто скриншоты, а то, как вы мыслите и решаете реальные инженерные задачи.

Что должно быть в хорошем кейсе:
- Краткая формулировка задачи: какую проблему решает этот проект.
- Используемый стек технологий и аргументация выбора.
- Сложности, с которыми вы столкнулись при реализации, и как вы их преодолели.
- Живая рабочая ссылка (Demo) и чистый, задокументированный репозиторий кода.

Не стремитесь добавить 10 шаблонных учебных проектов. 2–3 глубоких, отполированных проекта дадут многократно больший отклик от тимлидов.`,
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80',
    3, 218
  );

  insertBlog.run(
    'Секреты эффективного онлайн-обучения: как доходить курсы до конца',
    'how-to-finish-online-courses',
    'Саморазвитие',
    'Методы преодоления прокрастинации, составление учебного расписания и сохранение мотивации на длинной дистанции.',
    `По статистике онлайн-платформ, лишь 10-15% студентов завершают длительные образовательные программы. Но эту статистику можно обмануть, используя проверенные приемы когнитивной психологии:

1. Правило 30 минут: занимайтесь каждый день по чуть-чуть вместо одного 6-часового марафона на выходных.
2. Учеба через практику: сразу применяйте теорию в интерактивном редакторе или мини-проекте.
3. Задавайте вопросы преподавателю: не оставайтесь один на один с багом или сложной концепцией.
4. Отслеживайте свой прогресс: визуальные шкалы и чек-листы в личном кабинете дают регулярный дофаминовый заряд.`,
    'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=80',
    2, 195
  );

  // 10. Blog comments
  const insertBlogComment = db.prepare(`
    INSERT INTO blog_comments (post_id, user_id, user_name, content)
    VALUES (?, ?, ?, ?)
  `);
  insertBlogComment.run(1, 6, 'Илья Лекалин', 'Очень вовремя вышла статья! Действительно, акцент на системное мышление и практику очень помогает при прохождении курсов.');
  insertBlogComment.run(2, 6, 'Илья Лекалин', 'Отличный совет про живую ссылку и описание сложностей. Добавил это в свой проект на GitHub!');
}
