window.Host = {
  // 1. Upload View
  renderUpload(container) {
    container.innerHTML = `
      <div class="card" style="max-width: 650px; margin: 20px auto;">
        <h2>Upload Exam PDF</h2>
        <p style="color:var(--text-secondary); margin-bottom: 20px; font-size:0.95rem;">
          Select a computer-based question paper PDF. Standard single/multi-column Indian competitive formats are automatically structured.
        </p>

        <div id="drop-zone" style="border: 2px dashed var(--border-color); border-radius: var(--radius-md); padding: 40px 20px; text-align: center; cursor: pointer; background: var(--bg-muted);">
          <div style="font-size: 2.2rem; margin-bottom: 10px;">📄</div>
          <p style="font-weight: 600; margin-bottom: 4px;">Click to browse or drop PDF here</p>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Max size 25MB</p>
          <input type="file" id="pdf-input" accept="application/pdf" style="display: none;" />
        </div>

        <div id="upload-status" style="margin-top: 20px; display: none;">
          <p id="status-label" style="font-size: 0.9rem; font-weight: 600; margin-bottom: 6px;">Extracting content...</p>
          <div style="height: 8px; background: var(--border-color); border-radius: 4px; overflow: hidden;">
            <div id="progress-bar" style="width: 0%; height: 100%; background: var(--primary-accent); transition: width 0.2s ease;"></div>
          </div>
        </div>

        <div id="scanned-warning" style="display:none; margin-top:20px; padding:16px; background: var(--danger-soft); border-radius: var(--radius-sm); border:1px solid var(--danger);">
          <p style="font-weight:600; color:var(--danger);">Scanned or Image-only PDF Detected</p>
          <p style="font-size:0.9rem; margin-top:4px;">This PDF contains no extractable text layer. You can enter your questions manually instead.</p>
          <button class="btn-primary" style="margin-top:10px;" onclick="Host.startManualEntry()">Enter Questions Manually</button>
        </div>
      </div>
    `;

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('pdf-input');
    const uploadStatus = document.getElementById('upload-status');
    const progressBar = document.getElementById('progress-bar');
    const statusLabel = document.getElementById('status-label');
    const scannedWarning = document.getElementById('scanned-warning');

    dropZone.onclick = () => fileInput.click();

    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      uploadStatus.style.display = 'block';
      scannedWarning.style.display = 'none';

      try {
        const parsed = await PdfParser.parseFile(file, (percent) => {
          progressBar.style.width = percent + '%';
          statusLabel.innerText = `Processing PDF... ${percent}%`;
        });

        parsed.originalFile = file;
        window.AppState.parsedExamDraft = parsed;
        window.showToast('PDF parsed successfully! Please review questions.', 'success');
        window.location.hash = '#/host/review';
      } catch (err) {
        uploadStatus.style.display = 'none';
        if (err.message === 'EMPTY_OR_SCANNED_PDF') {
          scannedWarning.style.display = 'block';
        } else {
          window.showToast('Parsing error: ' + err.message, 'error');
        }
      }
    };
  },

  startManualEntry() {
    window.AppState.parsedExamDraft = {
      title: 'Manual Practice Test',
      sections: ['General'],
      questions: [
        {
          num: 1,
          section: 'General',
          question_text: 'Enter your question text here',
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correct_option_index: 0,
          explanation: '',
          warnings: []
        }
      ]
    };
    window.location.hash = '#/host/review';
  },

  // 2. Review, Edit & Exam Settings View
  renderReview(container) {
    const draft = window.AppState.parsedExamDraft;
    if (!draft || !draft.questions) {
      window.location.hash = '#/host/upload';
      return;
    }

    let qHtml = draft.questions.map((q, qIndex) => {
      const hasWarning = q.warnings && q.warnings.length > 0;
      return `
        <div class="card" style="margin-bottom:16px; ${hasWarning ? 'border:1.5px solid var(--warning);' : ''}" id="q-card-${qIndex}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-weight:700;">Question #${qIndex + 1}</span>
            <div style="display:flex; gap:8px; align-items:center;">
              ${hasWarning ? `<span style="color:var(--warning); font-size:0.85rem;" title="${q.warnings.join(' ')}">⚠️ Review Needed</span>` : ''}
              <button class="btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="Host.deleteQuestion(${qIndex})">Delete</button>
            </div>
          </div>

          <div class="form-group">
            <label>Question Text</label>
            <textarea rows="3" onchange="Host.updateQText(${qIndex}, this.value)">${q.question_text}</textarea>
          </div>

          <div class="form-group">
            <label>Section</label>
            <input type="text" value="${q.section || 'General'}" onchange="Host.updateQSection(${qIndex}, this.value)" />
          </div>

          <label style="font-size:0.9rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:8px;">Options & Correct Answer</label>
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            ${q.options.map((opt, oIndex) => `
              <div style="display:flex; align-items:center; gap:10px;">
                <input type="radio" name="correct-${qIndex}" style="width:20px; height:20px;" ${q.correct_option_index === oIndex ? 'checked' : ''} onchange="Host.setCorrectOption(${qIndex},${oIndex})">
                <input type="text" value="${opt}" onchange="Host.updateOptionText(${qIndex},${oIndex}, this.value)" />
                <button class="btn-secondary" style="padding:6px 10px;" onclick="Host.removeOption(${qIndex},${oIndex})">✕</button>
              </div>
            `).join('')}
          </div>
          <button class="btn-secondary" style="font-size:0.85rem; padding:4px 10px; margin-bottom:12px;" onclick="Host.addOption(${qIndex})">+ Add Option</button>

          <div class="form-group">
            <label>Explanation / Solution</label>
            <textarea rows="2" placeholder="Optional explanation..." onchange="Host.updateExplanation(${qIndex}, this.value)">${q.explanation || ''}</textarea>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="max-width: 900px; margin: 0 auto;">
        <h2>Review Questions (${draft.questions.length})</h2>
        <p style="color:var(--text-secondary); margin-bottom:20px;">Review, fix options, and select the correct answer for each question before publishing.</p>

        <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
          <button class="btn-secondary" onclick="Host.addQuestionManually()">+ Add Question Manually</button>
          <a href="#settings-anchor"><button class="btn-primary">Proceed to Exam Settings ↓</button></a>
        </div>

        <div>${qHtml}</div>

        <!-- Exam Settings Section -->
        <div class="card" id="settings-anchor" style="margin-top:40px; background:var(--bg-muted);">
          <h3 style="margin-bottom:16px;">Exam Configuration</h3>
          <form id="exam-config-form">
            <div class="form-row">
              <div class="form-group">
                <label>Exam / Topic Title</label>
                <input type="text" id="cfg-title" value="${draft.title || 'Practice Mock Exam'}" required />
              </div>
              <div class="form-group">
                <label>Total Duration (Minutes)</label>
                <input type="number" id="cfg-duration" value="60" min="1" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Marks for Correct Answer</label>
                <input type="number" step="0.01" id="cfg-marks-correct" value="1.0" required />
              </div>
              <div class="form-group">
                <label>Negative Marks for Wrong Answer</label>
                <input type="number" step="0.01" id="cfg-marks-incorrect" value="0.25" required />
              </div>
              <div class="form-group">
                <label>Marks for Unattempted</label>
                <input type="number" step="0.01" id="cfg-marks-unatt" value="0" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Passing Score Type</label>
                <select id="cfg-pass-type">
                  <option value="PERCENT">Percentage (%)</option>
                  <option value="MARKS">Absolute Marks</option>
                </select>
              </div>
              <div class="form-group">
                <label>Passing Threshold</label>
                <input type="number" step="0.1" id="cfg-pass-score" value="40" required />
              </div>
            </div>

            <div class="form-row" style="margin-top:10px;">
              <label style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="cfg-shuffle-q" style="width:auto;" /> Shuffle Questions
              </label>
              <label style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="cfg-shuffle-opt" style="width:auto;" /> Shuffle Options
              </label>
            </div>

            <button type="submit" class="btn-primary" style="width:100%; margin-top:24px; padding:12px; font-size:1.1rem;">Publish Exam & Generate Test Key</button>
          </form>
        </div>
      </div>
    `;

    document.getElementById('exam-config-form').onsubmit = (e) => {
      e.preventDefault();
      Host.saveAndPublishExam();
    };
  },

  updateQText(idx, val) { window.AppState.parsedExamDraft.questions[idx].question_text = val; },
  updateQSection(idx, val) { window.AppState.parsedExamDraft.questions[idx].section = val; },
  setCorrectOption(qIdx, oIdx) { window.AppState.parsedExamDraft.questions[qIdx].correct_option_index = oIdx; },
  updateOptionText(qIdx, oIdx, val) { window.AppState.parsedExamDraft.questions[qIdx].options[oIdx] = val; },
  updateExplanation(idx, val) { window.AppState.parsedExamDraft.questions[idx].explanation = val; },
  deleteQuestion(idx) {
    window.AppState.parsedExamDraft.questions.splice(idx, 1);
    Host.renderReview(document.getElementById('app-root'));
  },
  addOption(qIdx) {
    window.AppState.parsedExamDraft.questions[qIdx].options.push('New Option');
    Host.renderReview(document.getElementById('app-root'));
  },
  removeOption(qIdx, oIdx) {
    window.AppState.parsedExamDraft.questions[qIdx].options.splice(oIdx, 1);
    Host.renderReview(document.getElementById('app-root'));
  },
  addQuestionManually() {
    window.AppState.parsedExamDraft.questions.push({
      num: window.AppState.parsedExamDraft.questions.length + 1,
      section: 'General',
      question_text: 'New Question Text',
      options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
      correct_option_index: 0,
      explanation: '',
      warnings: []
    });
    Host.renderReview(document.getElementById('app-root'));
  },

  // 3. Save to Supabase and Generate Key
  async saveAndPublishExam() {
    const draft = window.AppState.parsedExamDraft;
    const title = document.getElementById('cfg-title').value.trim();
    const duration = parseInt(document.getElementById('cfg-duration').value);
    const marksCorrect = parseFloat(document.getElementById('cfg-marks-correct').value);
    const marksIncorrect = parseFloat(document.getElementById('cfg-marks-incorrect').value);
    const marksUnatt = parseFloat(document.getElementById('cfg-marks-unatt').value);
    const passType = document.getElementById('cfg-pass-type').value;
    const passScore = parseFloat(document.getElementById('cfg-pass-score').value);
    const shuffleQ = document.getElementById('cfg-shuffle-q').checked;
    const shuffleOpt = document.getElementById('cfg-shuffle-opt').checked;

    // Generate readable Unique Test Key (e.g. ABC-4821)
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const numbers = '23456789';
    let code = '';
    for (let i = 0; i < 3; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
    code += '-';
    for (let i = 0; i < 4; i++) code += numbers.charAt(Math.floor(Math.random() * numbers.length));

    // Upload PDF if present
    let pdfUrl = null;
    if (draft.originalFile) {
      const filePath = `${code}_${draft.originalFile.name}`;
      const { data: uploadData, error: upErr } = await window.sb.storage
        .from('exam-pdfs')
        .upload(filePath, draft.originalFile);
      if (!upErr) pdfUrl = filePath;
    }

    // Insert Test Record
    const { data: testRecord, error: testErr } = await window.sb
      .from('tests')
      .insert({
        test_key: code,
        title,
        duration_minutes: duration,
        has_sections: true,
        shuffle_questions: shuffleQ,
        shuffle_options: shuffleOpt,
        passing_score_type: passType,
        passing_score: passScore,
        pdf_url: pdfUrl,
        created_by: window.AppState.user.id
      })
      .select()
      .single();

    if (testErr) {
      window.showToast('Failed to create test: ' + testErr.message, 'error');
      return;
    }

    // Extract Unique Sections
    const uniqueSecs = Array.from(new Set(draft.questions.map(q => q.section || 'General')));
    const secInsertPayload = uniqueSecs.map((s, sIdx) => ({
      test_id: testRecord.id,
      title: s,
      order_index: sIdx,
      marks_correct: marksCorrect,
      marks_incorrect: marksIncorrect,
      marks_unattempted: marksUnatt
    }));

    const { data: insertedSections, error: secErr } = await window.sb
      .from('sections')
      .insert(secInsertPayload)
      .select();

    const secMap = {};
    if (insertedSections) {
      insertedSections.forEach(s => { secMap[s.title] = s.id; });
    }

    // Insert Questions & Options
    for (let qIdx = 0; qIdx < draft.questions.length; qIdx++) {
      const q = draft.questions[qIdx];
      const { data: qRecord, error: qErr } = await window.sb
        .from('questions')
        .insert({
          test_id: testRecord.id,
          section_id: secMap[q.section || 'General'] || null,
          order_index: qIdx,
          question_text: q.question_text,
          correct_option_index: q.correct_option_index,
          explanation: q.explanation
        })
        .select()
        .single();

      if (qRecord && q.options && q.options.length > 0) {
        const optPayload = q.options.map((optText, oIdx) => ({
          question_id: qRecord.id,
          option_index: oIdx,
          option_text: optText
        }));
        await window.sb.from('question_options').insert(optPayload);
      }
    }

    // Clean draft
    window.AppState.parsedExamDraft = null;

    // Show generated Key Screen
    document.getElementById('app-root').innerHTML = `
      <div class="card" style="max-width:550px; margin:40px auto; text-align:center;">
        <div style="font-size:2.8rem; margin-bottom:10px;">🎉</div>
        <h2>Exam Published Successfully!</h2>
        <p style="color:var(--text-secondary); margin-bottom:24px;">Share this Test Key with authorized students to take the exam.</p>
        
        <div style="background:var(--accent-soft); padding:16px; border-radius:var(--radius-md); font-family:monospace; font-size:2rem; font-weight:700; color:var(--primary-accent); margin-bottom:20px;">
          ${code}
        </div>

        <button class="btn-primary" style="margin-bottom:12px; width:100%;" onclick="navigator.clipboard.writeText('${code}'); window.showToast('Copied to clipboard!', 'success');">Copy Test Key</button>
        <a href="#/host/tests"><button class="btn-secondary" style="width:100%;">View My Tests</button></a>
      </div>
    `;
  },

  // 4. My Uploaded Tests List
  async renderMyTests(container) {
    container.innerHTML = `<div class="card"><p>Loading your exams...</p></div>`;

    const { data: tests, error } = await window.sb
      .from('tests')
      .select('*, attempts(count)')
      .order('created_at', { ascending: false });

    if (error) {
      container.innerHTML = `<div class="card"><p>Error: ${error.message}</p></div>`;
      return;
    }

    if (!tests || tests.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:40px;">
          <h3>No Tests Uploaded Yet</h3>
          <p style="color:var(--text-secondary); margin:12px 0;">Upload your first exam PDF to start practice tests.</p>
          <a href="#/host/upload"><button class="btn-primary">Upload Test</button></a>
        </div>
      `;
      return;
    }

    const listHtml = tests.map(t => {
      const attemptCount = t.attempts && t.attempts[0] ? t.attempts[0].count : 0;
      return `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <h3 style="margin-bottom:4px;">${t.title}</h3>
            <p style="color:var(--text-secondary); font-size:0.9rem;">
              Key: <strong style="color:var(--primary-accent);">${t.test_key}</strong> | Duration: ${t.duration_minutes} min | Attempts: ${attemptCount}
            </p>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-outline" onclick="navigator.clipboard.writeText('${t.test_key}'); window.showToast('Copied test key!', 'success');">Copy Key</button>
            <a href="#/instructions/${t.test_key}"><button class="btn-secondary">Test Preview</button></a>
            <button class="btn-danger" onclick="Host.deleteTest('${t.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="max-width:1000px; margin:0 auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h2>My Uploaded Tests</h2>
          <a href="#/host/upload"><button class="btn-primary">+ Upload New Test</button></a>
        </div>
        ${listHtml}
      </div>
    `;
  },

  deleteTest(testId) {
    window.showModal({
      title: 'Delete Test?',
      bodyHtml: 'Are you sure you want to permanently delete this test? All associated candidate attempts and question records will be deleted.',
      confirmText: 'Delete Permanently',
      danger: true,
      onConfirm: async () => {
        const { error } = await window.sb.from('tests').delete().eq('id', testId);
        if (error) {
          window.showToast(error.message, 'error');
        } else {
          window.showToast('Test deleted successfully.', 'success');
          Host.renderMyTests(document.getElementById('app-root'));
        }
      }
    });
  },

  // 5. User Management (Gated Access & Administrative Password Reset)
  async renderUserManager(container) {
    container.innerHTML = `<div class="card"><p>Loading user list...</p></div>`;

    const [authRes, profRes] = await Promise.all([
      window.sb.from('authorized_emails').select('*').order('created_at', { ascending: false }),
      window.sb.from('profiles').select('*').order('created_at', { ascending: false })
    ]);

    const authEmails = authRes.data || [];
    const profiles = profRes.data || [];

    container.innerHTML = `
      <div style="max-width:900px; margin:0 auto;">
        <h2>User Access Management</h2>
        
        <!-- Add Authorized Email Form -->
        <div class="card" style="margin:20px 0;">
          <h3>Authorize New Student Email</h3>
          <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:14px;">Only authorized emails can register on this portal.</p>
          <form id="add-auth-email-form" style="display:flex; gap:10px; flex-wrap:wrap;">
            <input type="email" id="auth-email-input" placeholder="student@example.com" required style="flex:1; min-width:240px;" />
            <select id="auth-role-input" style="width:140px;">
              <option value="USER">USER</option>
              <option value="HOST">HOST</option>
            </select>
            <button type="submit" class="btn-primary">Add Authorization</button>
          </form>
        </div>

        <!-- Registered Users Table -->
        <div class="card">
          <h3 style="margin-bottom:14px;">Registered Users (${profiles.length})</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.95rem;">
              <thead>
                <tr style="border-bottom:2px solid var(--border-color); color:var(--text-secondary);">
                  <th style="padding:10px;">Email</th>
                  <th style="padding:10px;">Role</th>
                  <th style="padding:10px; text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${profiles.map(p => `
                  <tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:10px;">${p.email}</td>
                    <td style="padding:10px;"><span class="nav-badge">${p.role}</span></td>
                    <td style="padding:10px; text-align:right;">
                      <button class="btn-secondary" style="padding:4px 8px; font-size:0.8rem;" onclick="Host.promptPasswordReset('${p.id}', '${p.email}')">Reset Password</button>
                      <button class="btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="Host.deleteUser('${p.id}', '${p.email}')">Remove</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.getElementById('add-auth-email-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email-input').value.trim().toLowerCase();
      const role = document.getElementById('auth-role-input').value;

      const { error } = await window.sb.from('authorized_emails').insert({ email, role });
      if (error) {
        window.showToast(error.message, 'error');
      } else {
        window.showToast(`Authorized ${email} successfully.`, 'success');
        Host.renderUserManager(container);
      }
    };
  },

  promptPasswordReset(userId, email) {
    const newPwd = prompt(`Enter new password for ${email}:`);
    if (!newPwd || newPwd.trim().length < 6) {
      if (newPwd !== null) window.showToast('Password must be at least 6 characters.', 'error');
      return;
    }

    Host.executePasswordReset(userId, newPwd);
  },

  async executePasswordReset(userId, newPassword) {
    const { error } = await window.sb.rpc('host_set_user_password', {
      target_user_id: userId,
      new_plain_password: newPassword
    });

    if (error) {
      window.showToast(error.message, 'error');
    } else {
      window.showToast('User password updated successfully.', 'success');
    }
  },

  deleteUser(userId, email) {
    window.showModal({
      title: 'Remove User?',
      bodyHtml: `Are you sure you want to remove <strong>${email}</strong>? Their profile and authorized email will be removed.`,
      confirmText: 'Remove User',
      danger: true,
      onConfirm: async () => {
        await window.sb.from('authorized_emails').delete().eq('email', email);
        const { error } = await window.sb.from('profiles').delete().eq('id', userId);
        if (error) {
          window.showToast(error.message, 'error');
        } else {
          window.showToast('User removed.', 'success');
          Host.renderUserManager(document.getElementById('app-root'));
        }
      }
    });
  },

  // 6. View All Candidate Attempts
  async renderAllHistory(container) {
    container.innerHTML = `<div class="card"><p>Loading all attempt records...</p></div>`;

    const { data: attempts, error } = await window.sb
      .from('attempts')
      .select('*, tests(title, test_key), profiles(email)')
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false });

    if (error) {
      container.innerHTML = `<div class="card"><p>Error: ${error.message}</p></div>`;
      return;
    }

    container.innerHTML = `
      <div style="max-width:1100px; margin:0 auto;">
        <h2>All Candidate Attempts (${attempts.length})</h2>
        <div class="card" style="margin-top:20px; overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.95rem;">
            <thead>
              <tr style="border-bottom:2px solid var(--border-color); color:var(--text-secondary);">
                <th style="padding:10px;">Candidate</th>
                <th style="padding:10px;">Exam</th>
                <th style="padding:10px;">Score</th>
                <th style="padding:10px;">Status</th>
                <th style="padding:10px;">Date</th>
                <th style="padding:10px; text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${attempts.map(a => `
                <tr style="border-bottom:1px solid var(--border-color);">
                  <td style="padding:10px;">${a.profiles ? a.profiles.email : 'Unknown'}</td>
                  <td style="padding:10px;">${a.tests ? a.tests.title : 'Test'}</td>
                  <td style="padding:10px; font-weight:600;">${a.total_score} /${a.max_score}</td>
                  <td style="padding:10px;">
                    <span style="font-weight:700; color:${a.is_passed ? 'var(--success)' : 'var(--danger)'};">
                      ${a.is_passed ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                  <td style="padding:10px; color:var(--text-secondary);">${new Date(a.submitted_at).toLocaleDateString()}</td>
                  <td style="padding:10px; text-align:right;">
                    <a href="#/results/${a.id}"><button class="btn-secondary" style="padding:4px 8px; font-size:0.8rem;">Results</button></a>
                    <button class="btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="Host.deleteAttemptRecord('${a.id}')">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  deleteAttemptRecord(attemptId) {
    window.showModal({
      title: 'Delete Attempt Record?',
      bodyHtml: 'Are you sure you want to delete this test attempt? This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        const { error } = await window.sb.from('attempts').delete().eq('id', attemptId);
        if (error) {
          window.showToast(error.message, 'error');
        } else {
          window.showToast('Attempt record deleted.', 'success');
          Host.renderAllHistory(document.getElementById('app-root'));
        }
      }
    });
  }
};