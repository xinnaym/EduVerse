/* =========================================================
   EduVerse — Основной клиентский скрипт
   Управление сессией, авторизацией, переключением ролей,
   уведомлениями, модальными окнами и общими функциями.
   ========================================================= */

window.EduVerse = {
  // Текущий пользователь
  currentUser: null,

  // Инициализация
  init() {
    this.loadUserSession();
    const oldBar = document.getElementById('demo-role-bar');
    if (oldBar) oldBar.remove();
    this.updateHeaderNav();
    this.initMobileMenu();
    this.initSmoothScroll();
    this.createToastContainer();
  },

  // Загрузка сессии из localStorage
  loadUserSession() {
    const saved = localStorage.getItem('eduverse_user');
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
        if (this.currentUser && this.currentUser.full_name && (this.currentUser.full_name.includes('Артём') || this.currentUser.full_name.includes('Луканов'))) {
          this.currentUser.full_name = 'Илья Лекалин';
          localStorage.setItem('eduverse_user', JSON.stringify(this.currentUser));
        }
      } catch (e) {
        this.currentUser = null;
      }
    }
    // По умолчанию авторизован студент Илья Лекалин
    if (!this.currentUser && localStorage.getItem('eduverse_initialized') !== 'true') {
      localStorage.setItem('eduverse_initialized', 'true');
      this.setUser({
        id: 6,
        full_name: 'Илья Лекалин',
        email: 'student@eduverse.ru',
        role: 'student',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80'
      });
    }
  },

  setUser(user) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem('eduverse_user', JSON.stringify(user));
      localStorage.setItem('eduverse_token', user.id.toString());
    } else {
      localStorage.removeItem('eduverse_user');
      localStorage.removeItem('eduverse_token');
    }
    this.updateHeaderNav();
  },

  logout() {
    this.setUser(null);
    this.showToast('Вы вышли из системы', 'info');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 400);
  },

  // API запрос с авторизацией
  async api(endpoint, options = {}) {
    const headers = options.headers || {};
    if (this.currentUser) {
      headers['Authorization'] = `Bearer ${this.currentUser.id}`;
      headers['x-user-id'] = this.currentUser.id.toString();
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const res = await fetch(endpoint, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при выполнении запроса');
      }
      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  },

  // Обновление навигации и шапки под авторизованного пользователя
  updateHeaderNav() {
    const actions = document.querySelector('.header__actions');
    if (!actions) return;

    const burger = document.getElementById('burger');
    const burgerHtml = burger ? burger.outerHTML : '<button class="burger" id="burger" aria-label="Открыть меню"><span></span><span></span><span></span></button>';

    if (!this.currentUser) {
      actions.innerHTML = `
        <a href="auth.html" class="btn btn--ghost btn--sm">Войти</a>
        <a href="auth.html#register" class="btn btn--primary btn--sm">Регистрация</a>
        ${burgerHtml}
      `;
    } else {
      let cabinetLink = 'my-courses.html';
      let cabinetLabel = 'Мои курсы';

      if (this.currentUser.role === 'teacher') {
        cabinetLink = 'teacher.html';
        cabinetLabel = 'Кабинет учителя';
      } else if (this.currentUser.role === 'admin') {
        cabinetLink = 'admin.html';
        cabinetLabel = 'Админ-панель';
      }

      const avatarSrc = this.currentUser.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';

      actions.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
          <a href="${cabinetLink}" class="btn btn--primary btn--sm" style="display:inline-flex;align-items:center;gap:6px">
            <img src="${avatarSrc}" alt="${this.currentUser.full_name}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;">
            <span>${cabinetLabel}</span>
          </a>
          <button onclick="EduVerse.logout()" class="btn btn--ghost btn--sm" title="Выйти из аккаунта" style="border:1px solid var(--color-border)">Выйти</button>
        </div>
        ${burgerHtml}
      `;
    }

    this.initMobileMenu();
  },

  // Мобильное меню
  initMobileMenu() {
    const burger = document.getElementById('burger');
    const nav = document.getElementById('nav');
    if (burger && nav) {
      burger.onclick = () => nav.classList.toggle('nav--open');
    }
  },

  // Плавная прокрутка для якорей
  initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const targetId = link.getAttribute('href');
        if (targetId && targetId.length > 1 && !targetId.includes('/')) {
          const target = document.querySelector(targetId);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });
  },

  // Всплывающие уведомления (Toasts)
  createToastContainer() {
    if (!document.getElementById('toast-container')) {
      const container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
  },

  showToast(message, type = 'info') {
    this.createToastContainer();
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // Модальные окна
  openModal(contentHtml) {
    let overlay = document.getElementById('app-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'app-modal-overlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="modal-box">
        <button class="modal-close" onclick="EduVerse.closeModal()" aria-label="Закрыть">✕</button>
        <div class="modal-body">${contentHtml}</div>
      </div>
    `;

    overlay.classList.add('active');
    overlay.onclick = (e) => {
      if (e.target === overlay) EduVerse.closeModal();
    };
  },

  closeModal() {
    const overlay = document.getElementById('app-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  },

  // Просмотр и печать сертификата
  openCertificate(studentName, courseTitle, dateStr = '14 октября 2026') {
    const certNumber = 'EV-' + Math.floor(100000 + Math.random() * 900000);
    const html = `
      <div class="certificate-frame">
        <div class="certificate-seal">🎓</div>
        <div class="certificate-title">Сертификат об окончании</div>
        <div class="certificate-sub">Настоящим подтверждается, что</div>
        <div class="certificate-name">${studentName || (this.currentUser ? this.currentUser.full_name : 'Студент EduVerse')}</div>
        <p style="color:#64748b;margin-bottom:12px">успешно освоил(а) образовательную программу курса</p>
        <div class="certificate-course">«${courseTitle || 'JavaScript с нуля до PRO'}»</div>
        <p style="font-size:13px;color:#94a3b8;margin-bottom:24px">и овладел(а) заявленными практическими компетенциями в полном объеме.</p>
        <div class="certificate-footer">
          <div>
            <strong>Платформа:</strong> EduVerse<br>
            <strong>Дата:</strong> ${dateStr}
          </div>
          <div>
            <strong>№ сертификата:</strong> ${certNumber}<br>
            <strong>Подпись:</strong> <em>EduVerse Academic Council</em>
          </div>
        </div>
      </div>
      <div style="margin-top:20px;display:flex;justify-content:center;gap:12px">
        <button class="btn btn--primary" onclick="window.print()">🖨️ Распечатать / Сохранить в PDF</button>
        <button class="btn btn--outline" onclick="EduVerse.closeModal()">Закрыть</button>
      </div>
    `;
    this.openModal(html);
  },

  // Оформление заказа / Покупка курса в 1 клик
  async purchaseCourse(courseId, courseTitle, price) {
    if (!this.currentUser) {
      this.showToast('Пожалуйста, войдите в аккаунт для записи на курс', 'info');
      setTimeout(() => location.href = `auth.html?redirect=course.html?id=${courseId}`, 800);
      return;
    }

    const priceText = price === 0 ? 'Бесплатно' : `${price.toLocaleString('ru-RU')} ₽`;

    const modalHtml = `
      <h2 style="font-size:22px;margin-bottom:12px">Оформление записи на курс</h2>
      <p style="color:var(--color-text-muted);margin-bottom:20px">Вы записываетесь на курс:</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:20px">
        <h3 style="font-size:18px;margin-bottom:6px">${courseTitle}</h3>
        <p style="font-size:15px;color:var(--color-primary);font-weight:700">Стоимость: ${priceText}</p>
      </div>

      <div style="margin-bottom:20px">
        <label style="display:block;font-size:14px;font-weight:600;margin-bottom:8px">Способ оплаты</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label style="border:1px solid var(--color-primary);background:var(--color-primary-light);padding:12px;border-radius:8px;display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="radio" name="pay-method" value="card" checked>
            <span>💳 Банковская карта</span>
          </label>
          <label style="border:1px solid #e2e8f0;padding:12px;border-radius:8px;display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="radio" name="pay-method" value="sbp">
            <span>⚡ СБП (Быстрый платеж)</span>
          </label>
        </div>
      </div>

      <button id="confirm-buy-btn" class="btn btn--primary btn--block">Подтвердить и получить доступ (${priceText})</button>
    `;

    this.openModal(modalHtml);

    document.getElementById('confirm-buy-btn').onclick = async () => {
      try {
        const res = await this.api('/api/orders/checkout', {
          method: 'POST',
          body: { course_id: courseId }
        });
        this.closeModal();
        this.showToast(res.message, 'success');
        setTimeout(() => {
          location.href = 'my-courses.html';
        }, 800);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  }
};

// Запуск при загрузке документа
document.addEventListener('DOMContentLoaded', () => {
  EduVerse.init();
});