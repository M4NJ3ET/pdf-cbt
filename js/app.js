window.AppState = {
  user: null,
  profile: null,
  parsedExamDraft: null
};

window.addEventListener('DOMContentLoaded', async () => {
  await Auth.initAuth();
  setupNavigationRouting();
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
      <a href="#/login">Login</a>
      <a href="#/register">Register</a>
    `;
    return;
  }

  const role = window.AppState.profile ? window.AppState.profile.role : 'USER';
  const isHost = role === 'HOST';

  navLinks.innerHTML = `
    <span class="nav-badge" style="${isHost ? 'background:#e6f4ea; color:#137333; font-weight:700; border:1px solid #b7e1cd;' : ''}">
      ${role}
    </span>
    ${isHost ? `<a href="#/host/dashboard" style="font-weight:600; color:var(--primary-accent);">Host Dashboard</a>` : ''}
    <a href="#/take-key">Take Test</a>
    <a href="#/my-history">My History</a>
    <a href="#/change-password">Settings</a>
    <button class="btn-outline" style="padding:4px 10px; font-size:0.85rem;" onclick="confirmLogout()">Logout</button>
  `;
}

function confirmLogout() {
  window.showModal({
    title: 'Confirm Logout',
    bodyHtml: 'Are you sure you want to log out of MockOrbit? Any unsaved active screen actions will be closed.',
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
    if (isAuth) { window.location.hash = isHost ? '#/host/dashboard' : '#/take-key'; return; }
    Auth.renderLogin(root);
    return;
  }
  if (hash === '#/register') {
    if (isAuth) { window.location.hash = '#/take-key'; return; }
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

  // Student / Candidate Routes
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

// Interactive Host Control Hub
function renderHostDashboard(container) {
  container.innerHTML = `
    <div style="max-width: 960px; margin: 20px auto;">
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 1.8rem; margin-bottom: 6px;">Host Control Hub</h2>
        <p style="color: var(--text-secondary);">Manage exams, question papers, candidate attempts, and user authorizations.</p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
        <!-- Upload Test Card -->
        <div class="card" style="cursor:pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; border-top: 4px solid var(--primary-accent);" onclick="window.location.hash='#/host/upload'" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
          <div style="font-size: 2.4rem; margin-bottom: 8px;">📤</div>
          <h3 style="margin-bottom: 6px;">Upload Test</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">Parse a question paper PDF or compose questions manually.</p>
        </div>

        <!-- My Tests Card -->
        <div class="card" style="cursor:pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; border-top: 4px solid #1a73e8;" onclick="window.location.hash='#/host/tests'" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
          <div style="font-size: 2.4rem; margin-bottom: 8px;">📚</div>
          <h3 style="margin-bottom: 6px;">My Tests</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">View all published exams, copy test keys, and preview tests.</p>
        </div>

        <!-- Candidate Attempts Card -->
        <div class="card" style="cursor:pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; border-top: 4px solid #f2994a;" onclick="window.location.hash='#/host/all-history'" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
          <div style="font-size: 2.4rem; margin-bottom: 8px;">📊</div>
          <h3 style="margin-bottom: 6px;">All Attempts</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">Track student scores, submissions, accuracy, and pass/fail status.</p>
        </div>

        <!-- Manage Users Card -->
        <div class="card" style="cursor:pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; border-top: 4px solid #9b51e0;" onclick="window.location.hash='#/host/users'" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
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
        ${window.AppState.user ? `
          <a href="#/take-key"><button class="btn-primary" style="padding:12px 28px; font-size:1rem;">Launch Practice Test</button></a>
          ${window.AppState.profile && window.AppState.profile.role === 'HOST' ? `<a href="#/host/dashboard"><button class="btn-secondary" style="padding:12px 28px; font-size:1rem;">Host Control Hub</button></a>` : ''}
        ` : `
          <a href="#/login"><button class="btn-primary" style="padding:12px 28px; font-size:1rem;">Candidate Login</button></a>
          <a href="#/register"><button class="btn-outline" style="padding:12px 28px; font-size:1rem;">Register Account</button></a>
        `}
      </div>
    </div>
  `;
}

// Global UI Helper Functions
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
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-box">
        <h3 style="margin-bottom: 12px;">${title}</h3>
        <div style="margin-bottom: 20px; font-size: 0.95rem; color: var(--text-secondary); line-height: 1.6;">${bodyHtml}</div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button class="btn-secondary" id="modal-cancel-btn">Cancel</button>
          <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm-btn">${confirmText}</button>
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
