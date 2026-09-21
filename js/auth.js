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
      const { data: profile } = await window.sb
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profile) {
        window.AppState.profile = profile;
      } else {
        const { data: authRecord } = await window.sb
          .from('authorized_emails')
          .select('role')
          .ilike('email', fallbackEmail || '')
          .maybeSingle();

        const assignedRole = authRecord ? authRecord.role : 'USER';
        window.AppState.profile = { id: userId, email: fallbackEmail, full_name: '', role: assignedRole };
      }
    } catch (e) {
      window.AppState.profile = { id: userId, email: fallbackEmail, full_name: '', role: 'USER' };
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
          Don't have an account? <a href="#/register" style="color:var(--primary-accent); font-weight:600;">Register</a>
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
        window.location.hash = role === 'HOST' ? '#/host/dashboard' : '#/hub';
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
            <label for="reg-name">Full Name</label>
            <input type="text" id="reg-name" placeholder="e.g. John Doe" required autocomplete="name" />
          </div>

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
          Already have an account? <a href="#/login" style="color:var(--primary-accent); font-weight:600;">Log In</a>
        </p>
      </div>
    `;

    document.getElementById('register-form').onsubmit = async (e) => {
      e.preventDefault();
      const fullName = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim().toLowerCase();
      const password = document.getElementById('reg-password').value;
      const btn = document.getElementById('reg-btn');

      btn.disabled = true;
      btn.innerText = 'Validating authorization...';

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

        btn.innerText = 'Creating account...';
        const { data, error } = await window.sb.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName }
          }
        });

        if (error) {
          window.showToast(error.message, 'error');
          btn.disabled = false;
          btn.innerText = 'Register';
          return;
        }

        // Save full name to profile
        if (data.user) {
          await window.sb
            .from('profiles')
            .upsert({ id: data.user.id, email, full_name: fullName, role: authRecord.role });
        }

        window.showToast('Registration successful! Please log in.', 'success');
        window.location.hash = '#/login';
      } catch (err) {
        window.showToast(err.message, 'error');
        btn.disabled = false;
        btn.innerText = 'Register';
      }
    };
  },

  renderSettings(container) {
    const profile = window.AppState.profile || {};
    const currentName = profile.full_name || '';

    container.innerHTML = `
      <div style="max-width: 600px; margin: 10px auto;">
        <h2 style="margin-bottom: 6px;">Account Settings</h2>
        <p style="color:var(--text-secondary); margin-bottom: 24px; font-size:0.95rem;">
          Update your profile details and password.
        </p>

        <!-- Edit Profile Name Card -->
        <div class="card" style="margin-bottom: 24px;">
          <h3 style="margin-bottom: 14px;">Personal Information</h3>
          <form id="edit-profile-form">
            <div class="form-group">
              <label for="profile-name">Full Name</label>
              <input type="text" id="profile-name" value="${currentName}" placeholder="Your Full Name" required />
            </div>

            <div class="form-group">
              <label>Email Address</label>
              <input type="text" value="${window.AppState.user?.email || ''}" disabled style="background:var(--bg-muted); color:var(--text-secondary);" />
            </div>

            <button type="submit" class="btn-primary" id="save-name-btn" style="padding:9px 18px;">Save Name</button>
          </form>
        </div>

        <!-- Change Password Card -->
        <div class="card">
          <h3 style="margin-bottom: 14px;">Change Password</h3>
          <form id="change-pwd-form">
            <div class="form-group">
              <label for="new-password">New Password</label>
              <input type="password" id="new-password" placeholder="At least 6 characters" required minlength="6" />
            </div>

            <button type="submit" class="btn-primary" id="save-pwd-btn" style="padding:9px 18px;">Update Password</button>
          </form>
        </div>
      </div>
    `;

    // Save Name handler
    document.getElementById('edit-profile-form').onsubmit = async (e) => {
      e.preventDefault();
      const updatedName = document.getElementById('profile-name').value.trim();
      const btn = document.getElementById('save-name-btn');

      btn.disabled = true;
      btn.innerText = 'Saving...';

      const { error } = await window.sb
        .from('profiles')
        .update({ full_name: updatedName })
        .eq('id', window.AppState.user.id);

      if (error) {
        window.showToast('Failed to update name: ' + error.message, 'error');
      } else {
        if (window.AppState.profile) window.AppState.profile.full_name = updatedName;
        window.showToast('Name updated successfully!', 'success');
        updateNavigationUI();
      }
      btn.disabled = false;
      btn.innerText = 'Save Name';
    };

    // Change Password handler
    document.getElementById('change-pwd-form').onsubmit = async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('new-password').value;
      const btn = document.getElementById('save-pwd-btn');

      btn.disabled = true;
      btn.innerText = 'Updating...';

      const { error } = await window.sb.auth.updateUser({ password: newPassword });
      if (error) {
        window.showToast(error.message, 'error');
      } else {
        window.showToast('Password updated successfully!', 'success');
        document.getElementById('new-password').value = '';
      }
      btn.disabled = false;
      btn.innerText = 'Update Password';
    };
  },

  async signOut() {
    await window.sb.auth.signOut();
    window.AppState.user = null;
    window.AppState.profile = null;
    window.location.hash = '#/';
  }
};
