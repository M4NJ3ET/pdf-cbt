window.AppState = {
  user: null,
  profile: null,
  parsedExamDraft: null
};

window.addEventListener('DOMContentLoaded', async () => {
  try {
    if (window.Auth && typeof window.Auth.initAuth === 'function') {
      await window.Auth.initAuth();
    }
  } catch (err) {
    console.error('Auth initialization error:', err);
  } finally {
    setupNavigationRouting();
  }
});

function setupNavigationRouting() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function updateNavigationUI() {
  const navLinks = document.getElementById('nav-links');
  if (!navLinks) return;

  if (!window.AppState.user) {
    navLinks.innerHTML = `
      <a href="#/" class="nav-item">Home</a>
      <a href="#/login" class="nav-item">Login</a>
      <a href="#/register" class="nav-item">Register</a>
    `;
    return;
  }

  const role = window.AppState.profile ? window.AppState.profile.role : 'USER';
  const isHost = role === 'HOST';

  navLinks.innerHTML = `
    <span class="nav-badge" style="${isHost ? 'background:#e6f4ea; color:#137333; font-weight:700; border:1px solid #b7e1cd;' : 'background:#e8f0fe; color:#1a73e8; font-weight:700; border:1px solid #c2e7ff;'} padding:3px 8px; border-radius:4px; font-size:0.8rem;">
      ${role}
    </span>
    ${isHost ? `<a href="#/host/dashboard" style="font-weight:600; color:var(--primary-accent); text-decoration:none;">Host Hub</a>` : ''}
    <a href="#/take-key" style="text-decoration:none; color:inherit;">Take Test</a>
    <a href="#/my-history" style="text-decoration:none; color:inherit;">My History</a>
    <a href="#/change-password" style="text-decoration:none; color:inherit;">Settings</a>
    <button class="btn-outline" style="padding:4px 12px; font-size:0.85rem; cursor:pointer;" onclick="confirmLogout()">Logout</button>
  `;
}

function confirmLogout() {
  window.showModal({
    title: 'Confirm Logout',
    bodyHtml: 'Are you sure you want to log out of MockOrbit?',
    confirmText: 'Yes, Log Out',
    danger: true,
    onConfirm: () => {
      Auth.signOut();
    }
  });
}

async function handleRoute() {
  updateNavigationUI();
  const hash = window.location.hash || '#/';
  const root = document.getElementById('app-root');
  if (!root) return;

  const isAuth = !!window.AppState.user;
  const isHost = window.AppState.profile && window.AppState.profile.role === 'HOST';

  // Landing Page
  if (hash === '#/' || hash === '') {
    renderLandingPage(root);
    return;
  }

  // Authentication Routes
  if (hash === '#/login') {
    Auth.renderLogin(root);
    return;
  }
  if (hash === '#/register') {
    Auth.renderRegister(root);
    return;
  }
  if (hash === '#/change-password') {
    if (!isAuth) { window.location.hash = '#/login'; return; }
    Auth.renderChangePassword(root);
    return;
  }

  // Host Routes
  if (hash.startsWith('#/host/')) {
    if (!isAuth) { window.location.hash = '#/login'; return; }
    if (!isHost) {
      window.showToast('Host authorization required.', 'error');
      window.location.hash = '#/take-key';
      return;
    }

    if (hash === '#/host/dashboard') renderHostDashboard(root);
    else if (hash === '#/host/upload') Host.renderUpload(root);
    else if (hash === '#/host/review') Host.renderReview(root);
    else if (hash === '#/host/tests') Host.renderMyTests(root);
    else if (hash === '#/host/users') Host.renderUserManager(root);
    else if (hash === '#/host/all-history') Host.renderAllHistory(root);
    return;
  }

  // Candidate / Exam Routes
  if (hash === '#/take-key') {
    if (!isAuth) { window.location.hash = '#/login'; return; }
    Exam.renderKeyPrompt(root);
    return;
  }
  if (hash.startsWith('#/instructions/')) {
    if (!isAuth) { window.location.hash = '#/login'; return; }
    const key = hash.replace('#/instructions/', '').trim();
    Exam.renderInstructions(root, key);
    return;
  }
  if (hash.startsWith('#/exam/')) {
    if (!isAuth) { window.location.hash = '#/login'; return; }
    const testId = hash.replace('#/exam/', '').trim();
    Exam.startTest(root, testId);
    return;
  }
  if (hash.startsWith('#/results/')) {
    if (!isAuth) { window.location.hash = '#/login'; return; }
    const attemptId = hash.replace('#/results/', '').trim();
    Results.renderResult(root, attemptId);
    return;
  }
  if (hash === '#/my-history') {
    if (!isAuth) { window.location.hash = '#/login'; return; }
    Results.renderMyHistory(root);
    return;
  }

  // 404 Fallback
  root.innerHTML = `
    <div class="card" style="max-width:440px; margin:40px auto; text-align:center;">
      <h2>404 - Not Found</h2>
      <p style="color:var(--text-secondary); margin:12px 0;">The requested view does not exist.</p>
      <a href="#/"><button class="btn-primary">Return Home</button></a>
    </div>
  `;
}

function renderHostDashboard(container) {
  container.innerHTML = `
    <div style="max-width: 960px; margin: 20px auto;">
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 1.8rem; margin-bottom: 6px;">Host Control Hub</h2>
        <p style="color: var(--text-secondary);">Manage exams, question papers, candidate attempts, and user authorizations.</p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
        <div class="card" style="cursor:pointer; border-top: 4px solid var(--primary-accent);" onclick="window.location.hash='#/host/upload'">
          <div style="font-size: 2.4rem; margin-bottom: 8px;">📤</div>
          <h3 style="margin-bottom: 6px;">Upload Test</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">Parse a question paper PDF or compose questions manually.</p>
        </div>

        <div class="card" style="cursor:pointer; border-top: 4px solid #1a73e8;" onclick="window.location.hash='#/host/tests'">
          <div style="font-size: 2.4rem; margin-bottom: 8px;">📚</div>
          <h3 style="margin-bottom: 6px;">My Tests</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">View all published exams, copy test keys, and preview tests.</p>
        </div>

        <div class="card" style="cursor:pointer; border-top: 4px solid #f2994a;" onclick="window.location.hash='#/host/all-history'">
          <div style="font-size: 2.4rem; margin-bottom: 8px;">📊</div>
          <h3 style="margin-bottom: 6px;">All Attempts</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">Track student scores, submissions, accuracy, and pass/fail status.</p>
        </div>

        <div class="card" style="cursor:pointer; border-top: 4px solid #9b51e0;" onclick="window.location.hash='#/host/users'">
          <div style="font-size: 2.4rem; margin-bottom: 8px;">👥</div>
          <h3 style="margin-bottom: 6px;">Manage Users</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">Authorize candidate emails and perform administrative password resets.</p>
        </div>
      </div>
    </div>
  `;
}

function renderLandingPage(container) {
  container.innerHTML = `
    <div style="max-width: 800px; margin: 40px auto; text-align:center;">
      <h1 style="font-size: 2.4rem; margin-bottom: 12px; color: var(--text-main);">Welcome to MockOrbit</h1>
      <p style="font-size: 1.15rem; color: var(--text-secondary); max-width: 600px; margin: 0 auto 30px auto; line-height: 1.6;">
        Standard Indian competitive Computer-Based Test practice environment. Parse PDF question papers, simulate real exam conditions, and get instant score evaluation.
      </p>

      <div style="display:flex; justify-content:center; gap:14px; flex-wrap:wrap;">
        <a href="#/take-key"><button class="btn-primary" style="padding:12px 28px; font-size:1rem;">Launch Practice Test</button></a>
        ${window.AppState.user ? `
          ${window.AppState.profile && window.AppState.profile.role === 'HOST' ? `<a href="#/host/dashboard"><button class="btn-secondary" style="padding:12px 28px; font-size:1rem;">Host Hub</button></a>` : ''}
        ` : `
          <a href="#/login"><button class="btn-secondary" style="padding:12px 28px; font-size:1rem;">Candidate Login</button></a>
          <a href="#/register"><button class="btn-outline" style="padding:12px 28px; font-size:1rem;">Register Account</button></a>
        `}
      </div>
    </div>
  `;
}

// Global UI Indicators
window.showLoading = function (title = 'Processing...', message = 'Please wait...') {
  const overlay = document.getElementById('global-loading-overlay');
  const titleEl = document.getElementById('global-loading-title');
  const msgEl = document.getElementById('global-loading-msg');
  if (overlay) {
    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;
    overlay.style.display = 'flex';
  }
};

window.hideLoading = function () {
  const overlay = document.getElementById('global-loading-overlay');
  if (overlay) overlay.style.display = 'none';
};

window.showToast = function (message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

window.showModal = function ({ title, bodyHtml, confirmText = 'Confirm', danger = false, onConfirm = () => {} }) {
  const container = document.getElementById('modal-container');
  if (!container) return;

  container.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center;">
      <div class="modal-box" style="background:#fff; border-radius:8px; padding:24px; max-width:440px; width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <h3 style="margin-bottom: 12px;">${title}</h3>
        <div style="margin-bottom: 20px; font-size: 0.95rem; color: var(--text-secondary); line-height: 1.6;">${bodyHtml}</div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button class="btn-secondary" id="modal-cancel-btn" type="button">Cancel</button>
          <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm-btn" type="button">${confirmText}</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-cancel-btn').onclick = () => { container.innerHTML = ''; };
  document.getElementById('modal-confirm-btn').onclick = () => {
    container.innerHTML = '';
    onConfirm();
  };
};
