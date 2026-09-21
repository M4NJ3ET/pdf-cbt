window.Auth = {
  async initAuth() {
    try {
      const { data: { session } } = await window.sb.auth.getSession();
      if (session && session.user) {
        window.AppState.user = session.user;
        await this.fetchProfile(session.user.id, session.user.email);
      } else {
        window.AppState.user = null;
        window.AppState.profile = null;
      }
    } catch (err) {
      console.warn('Session retrieval error:', err);
      window.AppState.user = null;
      window.AppState.profile = null;
    }
  },

  async fetchProfile(userId, fallbackEmail) {
    try {
      const { data: profile, error } = await window.sb
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profile) {
        window.AppState.profile = profile;
      } else {
        // Fallback: check role directly from authorized_emails if profile record is pending
        const { data: authRecord } = await window.sb
          .from('authorized_emails')
          .select('role')
          .ilike('email', fallbackEmail || '')
          .maybeSingle();

        const assignedRole = authRecord ? authRecord.role : 'USER';
        window.AppState.profile = { id: userId, email: fallbackEmail, role: assignedRole };
      }
    } catch (e) {
      console.warn('Error fetching profile:', e);
      window.AppState.profile = { id: userId, email: fallbackEmail, role: 'USER' };
    }
  },

  renderLogin(container) {
    container.innerHTML = `
      <div class="card" style="max-width: 440px; margin: 40px auto;">
        <h2 style="margin-bottom: 8px;">Account Login</h2>
        <p style="color:var(--text-secondary); margin-bottom: 24px; font-size:0.95rem;">
          Sign in to access tests and your performance history.
        </p>

        <form id="login-form">
          <div class="form-group">
            <label for="login-email">Email Address</label>
            <input type="email" id="login-email" placeholder="name@example.com" required autocomplete="email" />
          </div>

          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password" />
          </div>

          <button type="submit" class="btn-primary" id="login-btn" style="width:100%; padding:11px; margin-top:8px;">Log In</button>
        </form>

        <p style="text-align: center; margin-top: 20px; font-size: 0.9rem;">
          Don't have an account? <a href="#/register">Register</a>
        </p>
      </div>
    `;

    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const btn = document.getElementById('login-btn');

      btn.disabled = true;
      btn.innerText = 'Signing in...';

      try {
        const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
        if (error) {
          window.showToast(error.message, 'error');
          btn.disabled = false;
          btn.innerText = 'Log In';
          return;
        }

        window.AppState.user = data.user;
        await this.fetchProfile(data.user.id, data.user.email);
        window.showToast('Login successful!', 'success');

        const role = window.AppState.profile ? window.AppState.profile.role : 'USER';
        window.location.hash = role === 'HOST' ? '#/host/dashboard' : '#/take-key';
      } catch (err) {
        window.showToast('Login failed: ' + err.message, 'error');
        btn.disabled = false;
        btn.innerText = 'Log In';
      }
    };
  },

  renderRegister(container) {
    container.innerHTML = `
      <div class="card" style="max-width: 440px; margin: 40px auto;">
        <h2 style="margin-bottom: 8px;">Create an Account</h2>
        <p style="color:var(--text-secondary); margin-bottom: 24px; font-size:0.95rem;">
          Registration is gated. Only email addresses pre-authorized by an exam host can register.
        </p>

        <form id="register-form">
          <div class="form-group">
            <label for="reg-email">Email Address</label>
            <input type="email" id="reg-email" placeholder="name@example.com" required autocomplete="email" />
          </div>

          <div class="form-group">
            <label for="reg-password">Choose Password</label>
            <input type="password" id="reg-password" placeholder="••••••••" required minlength="6" autocomplete="new-password" />
          </div>

          <button type="submit" class="btn-primary" id="reg-btn" style="width:100%; padding:11px; margin-top:8px;">Register</button>
        </form>

        <p style="text-align: center; margin-top: 20px; font-size: 0.9rem;">
          Already have an account? <a href="#/login">Log In</a>
        </p>
      </div>
    `;

    document.getElementById('register-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('reg-email').value.trim().toLowerCase();
      const password = document.getElementById('reg-password').value;
      const btn = document.getElementById('reg-btn');

      btn.disabled = true;
      btn.innerText = 'Validating...';

      try {
        const { data: authRecord, error: authCheckErr } = await window.sb
          .from('authorized_emails')
          .select('email, role')
          .ilike('email', email)
          .maybeSingle();

        if (authCheckErr || !authRecord) {
          window.showToast('Your email is not on the authorized list. Please contact an exam host.', 'error');
          btn.disabled = false;
          btn.innerText = 'Register';
          return;
        }

        btn.innerText = 'Registering...';
        const { data, error } = await window.sb.auth.signUp({ email, password });
        if (error) {
          window.showToast(error.message, 'error');
          btn.disabled = false;
          btn.innerText = 'Register';
          return;
        }

        window.showToast('Registration successful! You can now log in.', 'success');
        window.location.hash = '#/login';
      } catch (err) {
        window.showToast(err.message, 'error');
        btn.disabled = false;
        btn.innerText = 'Register';
      }
    };
  },

  renderChangePassword(container) {
    container.innerHTML = `
      <div class="card" style="max-width: 440px; margin: 40px auto;">
        <h2 style="margin-bottom: 8px;">Change Password</h2>
        <p style="color:var(--text-secondary); margin-bottom: 24px; font-size:0.95rem;">
          Update your account password below.
        </p>

        <form id="change-pwd-form">
          <div class="form-group">
            <label for="new-password">New Password</label>
            <input type="password" id="new-password" placeholder="At least 6 characters" required minlength="6" />
          </div>

          <button type="submit" class="btn-primary" style="width:100%; padding:11px; margin-top:8px;">Update Password</button>
        </form>
      </div>
    `;

    document.getElementById('change-pwd-form').onsubmit = async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('new-password').value;

      const { error } = await window.sb.auth.updateUser({ password: newPassword });
      if (error) {
        window.showToast(error.message, 'error');
      } else {
        window.showToast('Password updated successfully.', 'success');
        window.location.hash = window.AppState.profile?.role === 'HOST' ? '#/host/dashboard' : '#/take-key';
      }
    };
  },

  async signOut() {
    await window.sb.auth.signOut();
    window.AppState.user = null;
    window.AppState.profile = null;
    window.location.hash = '#/login';
  }
};
