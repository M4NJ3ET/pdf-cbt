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

  const hash = window.location.hash || '#/';
  const isAuth = !!window.AppState.user;

  // 1. When on Login or Register page: show only a clean "← Home" button
  if (hash === '#/login' || hash === '#/register') {
    navLinks.innerHTML = `
      <a href="#/" class="btn-secondary" style="padding:6px 14px; text-decoration:none; font-size:0.85rem; font-weight:600;">
        ← Home
      </a>
    `;
    return;
  }

  // 2. When Unauthenticated on Public Home: show nothing in the header (options are already front-and-center)
  if (!isAuth) {
    navLinks.innerHTML = ``;
    return;
  }

  // 3. Authenticated: Show Name/Email, Role Badge, and Logout strictly on the top-right
  const role = window.AppState.profile ? window.AppState.profile.role : 'USER';
  const isHost = role === 'HOST';
  const displayName = window.AppState.profile?.full_name || window.AppState.user.email;

  navLinks.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px;">
      <span class="nav-badge" style="${isHost ? 'background:#e6f4ea; color:#137333; border:1px solid #b7e1cd;' : 'background:#e8f0fe; color:#1a73e8; border:1px solid #c2e7ff;'} padding:4px 10px; border-radius:12px; font-weight:700; font-size:0.78rem;">
        ${role}
      </span>
      <span style="font-size:0.9rem; color:var(--text-secondary); max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500;">
        ${displayName}
      </span>
      <button class="btn-outline" style="padding:6px 14px; font-size:0.85rem; font-weight:600;" onclick="confirmLogout()">
        Logout ⎋
      </button>
    </div>
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

  // Public Landing / Auth Views
  if (!isAuth) {
    if (hash === '#/' || hash === '') { renderPublicLanding(root); return; }
    if (hash === '#/login') { Auth.renderLogin(root); return; }
    if (hash === '#/register') { Auth.renderRegister(root); return; }
    window.location.hash = '#/';
    return;
  }

  // Home Hub (Center Cards only, No left sidebar)
  if (hash === '#/' || hash === '' || hash === '#/hub' || hash === '#/host/dashboard') {
    if (isHost) renderHostHub(root);
    else renderUserHub(root);
    return;
  }

  // Settings View (Profile Name & Password)
  if (hash === '#/settings' || hash === '#/change-password') {
    wrapInAppShell(root, (el) => Auth.renderSettings(el), 'settings');
    return;
  }

  // Host Section Views (Wrapped in Left Sidebar)
  if (hash.startsWith('#/host/')) {
    if (!isHost) {
      window.showToast('Host authorization required.', 'error');
      window.location.hash = '#/hub';
      return;
    }

    if (hash === '#/host/upload') wrapInAppShell(root, (el) => Host.renderUpload(el), 'upload');
    else if (hash === '#/host/review') wrapInAppShell(root, (el) => Host.renderReview(el), 'upload');
    else if (hash === '#/host/tests') wrapInAppShell(root, (el) => Host.renderMyTests(el), 'tests');
    else if (hash === '#/host/users') wrapInAppShell(root, (el) => Host.renderUserManager(el), 'users');
    else if (hash === '#/host/all-history') wrapInAppShell(root, (el) => Host.renderAllHistory(el), 'all-history');
    return;
  }

  // Candidate Section Views (Wrapped in Left Sidebar)
  if (hash === '#/take-key') {
    wrapInAppShell(root, (el) => Exam.renderKeyPrompt(el), 'take');
    return;
  }
  if (hash.startsWith('#/instructions/')) {
    const key = hash.replace('#/instructions/', '').trim();
    wrapInAppShell(root, (el) => Exam.renderInstructions(el, key), 'take');
    return;
  }
  if (hash === '#/my-history') {
    wrapInAppShell(root, (el) => Results.renderMyHistory(el), 'history');
    return;
  }
  if (hash.startsWith('#/results/')) {
    const attemptId = hash.replace('#/results/', '').trim();
    wrapInAppShell(root, (el) => Results.renderResult(el, attemptId), 'history');
    return;
  }

  // Active Exam Simulation (Fullscreen, No sidebar distraction)
  if (hash.startsWith('#/exam/')) {
    const testId = hash.replace('#/exam/', '').trim();
    Exam.startTest(root, testId);
    return;
  }

  // 404 Fallback
  root.innerHTML = `
    <div class="card" style="max-width:440px; margin:40px auto; text-align:center;">
      <h2>404 - Not Found</h2>
      <p style="color:var(--text-secondary); margin:12px 0;">The requested page does not exist.</p>
      <a href="#/hub"><button class="btn-primary">Return to Hub</button></a>
    </div>
  `;
}

// Sidebar Shell Wrapper: Builds the left navigation bar with Home Hub at top and Logout pinned at bottom
function wrapInAppShell(root, renderCallback, activeKey) {
  const isHost = window.AppState.profile && window.AppState.profile.role === 'HOST';

  const hostNav = `
    <div class="side-group-title">Host Controls</div>
    <a href="#/host/upload" class="side-link ${activeKey === 'upload' ? 'active' : ''}">📤 Upload Test</a>
    <a href="#/host/tests" class="side-link ${activeKey === 'tests' ? 'active' : ''}">📚 My Tests</a>
    <a href="#/host/all-history" class="side-link ${activeKey === 'all-history' ? 'active' : ''}">📊 All Attempts</a>
    <a href="#/host/users" class="side-link ${activeKey === 'users' ? 'active' : ''}">👥 Manage Users</a>
    <div class="side-group-title">Practice</div>
    <a href="#/take-key" class="side-link ${activeKey === 'take' ? 'active' : ''}">📝 Take Test</a>
    <a href="#/my-history" class="side-link ${activeKey === 'history' ? 'active' : ''}">📈 My History</a>
    <a href="#/settings" class="side-link ${activeKey === 'settings' ? 'active' : ''}">⚙️ Settings</a>
  `;

  const userNav = `
    <div class="side-group-title">Student Portal</div>
    <a href="#/take-key" class="side-link ${activeKey === 'take' ? 'active' : ''}">📝 Take Test</a>
    <a href="#/my-history" class="side-link ${activeKey === 'history' ? 'active' : ''}">📈 My History</a>
    <a href="#/settings" class="side-link ${activeKey === 'settings' ? 'active' : ''}">⚙️ Settings</a>
  `;

  root.innerHTML = `
    <div class="app-layout-sidebar">
      <!-- Responsive Left Sidebar -->
      <aside class="app-sidebar">
        <div>
          <!-- Home Hub Button -->
          <a href="#/hub" class="side-link" style="font-weight:700; color:var(--primary-accent); margin-bottom:12px; background:var(--bg-muted);">
            🏠 Home Hub
          </a>
          <div class="side-nav-group">
            ${isHost ? hostNav : userNav}
          </div>
        </div>

        <!-- Pinned Logout at bottom of Left Sidebar -->
        <div style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 16px;">
          <button class="side-link" style="width:100%; border:none; background:transparent; color:var(--danger); font-weight:600;" onclick="confirmLogout()">
            🚪 Logout
          </button>
        </div>
      </aside>

      <!-- Main Feature Screen -->
      <main class="app-content-area" id="sub-view-root"></main>
    </div>
  `;

  const subRoot = document.getElementById('sub-view-root');
  renderCallback(subRoot);
}

// 1. Host Card Hub (Home View)
function renderHostHub(container) {
  container.innerHTML = `
    <div style="max-width: 980px; margin: 36px auto; padding: 0 16px;">
      <div style="margin-bottom: 28px;">
        <h1 style="font-size: 2rem; margin-bottom: 6px; font-weight:700;">Host Control Hub</h1>
        <p style="color: var(--text-secondary); font-size:1rem;">Manage exams, question papers, candidate attempts, and user authorizations.</p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px;">
        <!-- Upload Test Card -->
        <div class="card hub-card" style="border-top: 5px solid #137333;" onclick="window.location.hash='#/host/upload'">
          <div style="font-size: 2.6rem; margin-bottom: 12px;">📤</div>
          <h3 style="margin-bottom: 8px;">Upload Test</h3>
          <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">Parse a question paper PDF or compose questions manually.</p>
        </div>

        <!-- My Tests Card -->
        <div class="card hub-card" style="border-top: 5px solid #1a73e8;" onclick="window.location.hash='#/host/tests'">
          <div style="font-size: 2.6rem; margin-bottom: 12px;">📚</div>
          <h3 style="margin-bottom: 8px;">My Tests</h3>
          <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">View all published exams, copy test keys, and preview tests.</p>
        </div>

        <!-- All Attempts Card -->
        <div class="card hub-card" style="border-top: 5px solid #f2994a;" onclick="window.location.hash='#/host/all-history'">
          <div style="font-size: 2.6rem; margin-bottom: 12px;">📊</div>
          <h3 style="margin-bottom: 8px;">All Attempts</h3>
          <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">Track candidate scores, submissions, accuracy, and pass/fail status.</p>
        </div>

        <!-- Manage Users Card -->
        <div class="card hub-card" style="border-top: 5px solid #9b51e0;" onclick="window.location.hash='#/host/users'">
          <div style="font-size: 2.6rem; margin-bottom: 12px;">👥</div>
          <h3 style="margin-bottom: 8px;">Manage Users</h3>
          <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">Authorize candidate emails and perform administrative password resets.</p>
        </div>
      </div>
    </div>
  `;
}

// 2. Candidate Card Hub (Home View)
function renderUserHub(container) {
  container.innerHTML = `
    <div style="max-width: 860px; margin: 40px auto; padding: 0 16px;">
      <div style="margin-bottom: 28px;">
        <h1 style="font-size: 2rem; margin-bottom: 6px; font-weight:700;">Candidate Portal</h1>
        <p style="color: var(--text-secondary); font-size:1rem;">Launch practice tests using your host's test key or review your performance history.</p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px;">
        <!-- Take Test Card -->
        <div class="card hub-card" style="border-top: 5px solid var(--primary-accent);" onclick="window.location.hash='#/take-key'">
          <div style="font-size: 2.8rem; margin-bottom: 12px;">📝</div>
          <h3 style="margin-bottom: 8px;">Take Practice Test</h3>
          <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">Enter an exam test key provided by your host to launch your test.</p>
        </div>

        <!-- My History Card -->
        <div class="card hub-card" style="border-top: 5px solid #1a73e8;" onclick="window.location.hash='#/my-history'">
          <div style="font-size: 2.8rem; margin-bottom: 12px;">📈</div>
          <h3 style="margin-bottom: 8px;">My Performance History</h3>
          <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">Review past scorecards, accuracy, detailed explanations, and solutions.</p>
        </div>

        <!-- Settings Card -->
        <div class="card hub-card" style="border-top: 5px solid #9b51e0;" onclick="window.location.hash='#/settings'">
          <div style="font-size: 2.8rem; margin-bottom: 12px;">⚙️</div>
          <h3 style="margin-bottom: 8px;">Account Settings</h3>
          <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">Update your full name and change account credentials.</p>
        </div>
      </div>
    </div>
  `;
}

// 3. Public Landing (Clean Header, Options front-and-center)
function renderPublicLanding(container) {
  container.innerHTML = `
    <div style="max-width: 800px; margin: 60px auto; text-align:center; padding: 0 16px;">
      <h1 style="font-size: 2.6rem; margin-bottom: 14px; font-weight:800; color: var(--text-main);">Welcome to MockOrbit</h1>
      <p style="font-size: 1.15rem; color: var(--text-secondary); max-width: 600px; margin: 0 auto 36px auto; line-height: 1.6;">
        Indian competitive Computer-Based Test practice environment. Parse PDF question papers, simulate real exam conditions, and get instant scorecards.
      </p>

      <div style="display:flex; justify-content:center; gap:16px; flex-wrap:wrap;">
        <a href="#/login"><button class="btn-primary" style="padding:14px 34px; font-size:1.05rem;">Candidate / Host Login</button></a>
        <a href="#/register"><button class="btn-secondary" style="padding:14px 34px; font-size:1.05rem;">Register Account</button></a>
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
