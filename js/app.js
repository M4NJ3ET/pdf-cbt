window.AppState = {
  user: null,
  profile: null,
  parsedExamDraft: null
};

// UI Toast Utility
window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
};

// Global Modal Utility
window.showModal = function({ title, bodyHtml, confirmText = 'Confirm', onConfirm, danger = false }) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-box">
        <h3 style="margin-bottom:12px;">${title}</h3>
        <div style="margin-bottom:20px; color: var(--text-secondary);">${bodyHtml}</div>
        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button class="btn-secondary" id="modal-btn-cancel">Cancel</button>
          <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="modal-btn-confirm">${confirmText}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-btn-cancel').onclick = () => { modalRoot.innerHTML = ''; };
  document.getElementById('modal-btn-confirm').onclick = async () => {
    modalRoot.innerHTML = '';
    if (onConfirm) await onConfirm();
  };
};

// Dynamic Navigation Header
function renderNavbar() {
  const nav = document.getElementById('nav-actions');
  const user = window.AppState.user;
  const profile = window.AppState.profile;

  if (!user) {
    nav.innerHTML = `
      <a href="#/login">Login</a>
      <a href="#/register">Register</a>
    `;
    return;
  }

  const isHost = profile && profile.role === 'HOST';

  let links = `
    <span class="nav-badge">${profile ? profile.role : 'USER'}</span>
    <a href="#/take-key">Take Test</a>
    <a href="#/my-history">My History</a>
  `;

  if (isHost) {
    links += `
      <a href="#/host/upload">Upload Test</a>
      <a href="#/host/tests">My Tests</a>
      <a href="#/host/all-history">All Attempts</a>
      <a href="#/host/users">Manage Users</a>
    `;
  }

  links += `
    <a href="#/change-password">Settings</a>
    <button class="btn-secondary" style="padding:4px 10px; font-size:0.85rem;" onclick="Auth.logout()">Logout</button>
  `;

  nav.innerHTML = links;
}

// Router
async function router() {
  const hash = window.location.hash || '#/';
  const root = document.getElementById('app-root');

  // Verify Auth session
  const { data: { session } } = await window.sb.auth.getSession();
  window.AppState.user = session ? session.user : null;

  if (window.AppState.user && !window.AppState.profile) {
    const { data: prof } = await window.sb
      .from('profiles')
      .select('*')
      .eq('id', window.AppState.user.id)
      .single();
    window.AppState.profile = prof;
  } else if (!window.AppState.user) {
    window.AppState.profile = null;
  }

  renderNavbar();

  // Public Landing / Login / Register routes
  if (hash === '#/' || hash === '#/landing') {
    if (window.AppState.user) {
      window.location.hash = '#/take-key';
      return;
    }
    root.innerHTML = `
      <div class="card" style="text-align:center; padding: 60px 24px;">
        <h1 style="font-size:2.2rem; margin-bottom:12px;">Welcome to MockOrbit</h1>
        <p style="color:var(--text-secondary); max-width:620px; margin:0 auto 28px;">
          Practice high-stakes exams in a realistic testing environment with exact timekeeping, question status palettes, instant evaluations, and solutions.
        </p>
        <div style="display:flex; justify-content:center; gap:14px;">
          <a href="#/login"><button class="btn-primary" style="padding:10px 24px;">Log In to Account</button></a>
          <a href="#/register"><button class="btn-secondary" style="padding:10px 24px;">Register New Account</button></a>
        </div>
      </div>
    `;
    return;
  }

  if (hash === '#/login') {
    Auth.renderLogin(root);
    return;
  }

  if (hash === '#/register') {
    Auth.renderRegister(root);
    return;
  }

  // Guard: Must be authenticated
  if (!window.AppState.user) {
    window.location.hash = '#/login';
    return;
  }

  // Guard: Host-only routes
  if (hash.startsWith('#/host/')) {
    if (!window.AppState.profile || window.AppState.profile.role !== 'HOST') {
      window.showToast('Unauthorized: Host privileges required.', 'error');
      window.location.hash = '#/take-key';
      return;
    }
  }

  // Route Dispatcher
  if (hash === '#/take-key') {
    Exam.renderKeyPrompt(root);
  } else if (hash.startsWith('#/instructions/')) {
    const key = hash.replace('#/instructions/', '');
    Exam.renderInstructions(root, key);
  } else if (hash.startsWith('#/exam/')) {
    const testId = hash.replace('#/exam/', '');
    Exam.startTest(root, testId);
  } else if (hash.startsWith('#/results/')) {
    const attemptId = hash.replace('#/results/', '');
    Results.renderResults(root, attemptId);
  } else if (hash.startsWith('#/solutions/')) {
    const attemptId = hash.replace('#/solutions/', '');
    Results.renderSolutions(root, attemptId);
  } else if (hash === '#/my-history') {
    Results.renderUserHistory(root);
  } else if (hash === '#/change-password') {
    Auth.renderChangePassword(root);
  } else if (hash === '#/host/upload') {
    Host.renderUpload(root);
  } else if (hash === '#/host/review') {
    Host.renderReview(root);
  } else if (hash === '#/host/tests') {
    Host.renderMyTests(root);
  } else if (hash === '#/host/all-history') {
    Host.renderAllHistory(root);
  } else if (hash === '#/host/users') {
    Host.renderUserManager(root);
  } else {
    root.innerHTML = `<div class="card"><h3>Page Not Found</h3><p>The requested route does not exist.</p></div>`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
