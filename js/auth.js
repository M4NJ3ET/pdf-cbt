window.Auth = {
  renderLogin(container) {
    container.innerHTML = `
      <div class="card" style="max-width: 440px; margin: 40px auto;">
        <h2 style="margin-bottom: 20px;">Account Login</h2>
        <form id="login-form">
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="login-email" required placeholder="name@example.com" />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="login-password" required placeholder="••••••••" />
          </div>
          <button type="submit" class="btn-primary" style="width:100%; margin-top:10px;">Log In</button>
        </form>
        <p style="margin-top:16px; font-size:0.9rem; text-align:center;">
          Don't have an account? <a href="#/register">Register</a>
        </p>
      </div>
    `;

    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
      if (error) {
        window.showToast(error.message, 'error');
        return;
      }
      window.showToast('Login successful', 'success');
      window.location.hash = '#/take-key';
    };
  },

  renderRegister(container) {
    container.innerHTML = `
      <div class="card" style="max-width: 440px; margin: 40px auto;">
        <h2 style="margin-bottom: 8px;">Create an Account</h2>
        <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:20px;">
          Registration is gated. Only email addresses pre-authorized by an exam host can register.
        </p>
        <form id="register-form">
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="reg-email" required placeholder="name@example.com" />
          </div>
          <div class="form-group">
            <label>Choose Password</label>
            <input type="password" id="reg-password" required minlength="6" placeholder="At least 6 characters" />
          </div>
          <button type="submit" class="btn-primary" style="width:100%; margin-top:10px;">Register</button>
        </form>
        <p style="margin-top:16px; font-size:0.9rem; text-align:center;">
          Already have an account? <a href="#/login">Log In</a>
        </p>
      </div>
    `;

    document.getElementById('register-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;

      // 1. Client pre-check against authorized_emails
      const { data: authRecord, error: checkErr } = await window.sb
        .from('authorized_emails')
        .select('email')
        .ilike('email', email)
        .maybeSingle();

      if (checkErr || !authRecord) {
        window.showToast('Your email is not on the authorized list. Please contact an exam host.', 'error');
        return;
      }

      // 2. Sign up via Supabase Auth
      const { data, error } = await window.sb.auth.signUp({ email, password });
      if (error) {
        window.showToast(error.message, 'error');
        return;
      }

      window.showToast('Registration successful! You can now log in.', 'success');
      window.location.hash = '#/login';
    };
  },

  renderChangePassword(container) {
    container.innerHTML = `
      <div class="card" style="max-width: 440px; margin: 40px auto;">
        <h2 style="margin-bottom: 20px;">Change Password</h2>
        <form id="pwd-form">
          <div class="form-group">
            <label>Current Password</label>
            <input type="password" id="current-pwd" required />
          </div>
          <div class="form-group">
            <label>New Password</label>
            <input type="password" id="new-pwd" required minlength="6" />
          </div>
          <button type="submit" class="btn-primary" style="width:100%; margin-top:10px;">Update Password</button>
        </form>
      </div>
    `;

    document.getElementById('pwd-form').onsubmit = async (e) => {
      e.preventDefault();
      const currentPwd = document.getElementById('current-pwd').value;
      const newPwd = document.getElementById('new-pwd').value;

      // Supabase requires verifying old password by signing in again
      const { error: verifyErr } = await window.sb.auth.signInWithPassword({
        email: window.AppState.user.email,
        password: currentPwd
      });

      if (verifyErr) {
        window.showToast('Current password verification failed.', 'error');
        return;
      }

      const { error: updateErr } = await window.sb.auth.updateUser({ password: newPwd });
      if (updateErr) {
        window.showToast(updateErr.message, 'error');
        return;
      }

      window.showToast('Password successfully changed.', 'success');
      window.location.hash = '#/take-key';
    };
  },

  async logout() {
    await window.sb.auth.signOut();
    window.AppState.user = null;
    window.AppState.profile = null;
    window.location.hash = '#/login';
  }
};