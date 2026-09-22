window.Host = {
  // 1. Upload View (Supports PDF Drag-and-Drop & Direct AI JSON Import / File Upload)
  renderUpload(container) {
    container.innerHTML = `
      <div class="card" style="max-width: 650px; margin: 20px auto;">
        <h2>Create Exam Paper</h2>
        <p style="color:var(--text-secondary); margin-bottom: 20px; font-size:0.95rem;">
          Upload a question paper PDF or import AI-generated JSON directly.
        </p>

        <!-- Dropzone for PDF -->
        <div id="drop-zone" style="border: 2px dashed var(--border-color); border-radius: var(--radius-md); padding: 30px 20px; text-align: center; cursor: pointer; background: var(--bg-muted); margin-bottom: 20px;">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">📄</div>
          <p style="font-weight: 600; margin-bottom: 4px;">Click to browse or drop PDF here</p>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Supports multi-section question papers and linked statement questions</p>
          <input type="file" id="pdf-input" accept="application/pdf" style="display: none;" />
        </div>

        <div id="upload-status" style="margin-top: 15px; margin-bottom: 20px; display: none;">
          <p id="status-label" style="font-size: 0.9rem; font-weight: 600; margin-bottom: 6px;">Extracting content...</p>
          <div style="height: 8px; background: var(--border-color); border-radius: 4px; overflow: hidden;">
            <div id="progress-bar" style="width: 0%; height: 100%; background: var(--primary-accent); transition: width 0.2s ease;"></div>
          </div>
        </div>

        <div id="scanned-warning" style="display:none; margin-bottom:20px; padding:16px; background: var(--danger-soft); border-radius: var(--radius-sm); border:1px solid var(--danger);">
          <p style="font-weight:600; color:var(--danger);">Scanned or Image-only PDF Detected</p>
          <p style="font-size:0.9rem; margin-top:4px;">No text layer found. Enter questions manually or load an AI JSON file below.</p>
          <button class="btn-primary" style="margin-top:10px;" onclick="Host.startManualEntry()">Enter Questions Manually</button>
        </div>

        <!-- Section Divider -->
        <div style="text-align:center; margin-bottom:20px; position:relative;">
          <span style="background:#fff; padding:0 12px; color:var(--text-secondary); font-size:0.85rem; font-weight:600;">OR IMPORT AI JSON</span>
          <hr style="position:relative; top:-10px; z-index:-1; border:none; border-top:1px solid var(--border-color);" />
        </div>

        <!-- AI JSON Import (File Upload or Direct Paste) -->
        <div style="background:var(--bg-muted); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:16px;">
          <label style="font-weight:600; font-size:0.9rem; display:block; margin-bottom:6px;">Upload or Paste AI-Generated JSON</label>
          
          <div style="display:flex; gap:10px; margin-bottom:12px; align-items:center;">
            <input type="file" id="json-file-input" accept=".json" style="flex:1;" />
            <button type="button" class="btn-secondary" style="white-space:nowrap; padding:8px 14px;" onclick="Host.loadFromJsonFile()">Load JSON File</button>
          </div>

          <textarea id="json-paste-input" rows="4" placeholder='{"title": "Exam Title", "questions": [...]}' style="font-family:monospace; font-size:0.85rem; width:100%;"></textarea>
          <button type="button" class="btn-primary" style="margin-top:10px; width:100%; padding:10px;" onclick="Host.loadFromJson()">Load Pasted JSON</button>
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
          statusLabel.innerText = `Parsing sections, linked groups & questions... ${percent}%`;
        });

        parsed.originalFile = file;
        window.AppState.parsedExamDraft = parsed;
        window.showToast(`Extracted ${parsed.questions.length} questions across sections!`, 'success');
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

  loadFromJsonFile() {
    const fileInput = document.getElementById('json-file-input');
    const file = fileInput?.files[0];
    if (!file) {
      window.showToast('Please select a .json file first.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.questions || !Array.isArray(data.questions)) {
          throw new Error('Missing "questions" array in JSON');
        }
        window.AppState.parsedExamDraft = data;
        window.showToast(`Loaded ${data.questions.length} questions successfully!`, 'success');
        window.location.hash = '#/host/review';
      } catch (err) {
        window.showToast('JSON Syntax Error: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  },

  loadFromJson() {
    const raw = document.getElementById('json-paste-input').value.trim();
    if (!raw) {
      window.showToast('Please paste valid JSON first.', 'warning');
      return;
    }

    try {
      const data = JSON.parse(raw);
      if (!data.questions || !Array.isArray(data.questions)) {
        throw new Error('Invalid structure: "questions" array is required.');
      }
      window.AppState.parsedExamDraft = data;
      window.showToast(`Loaded ${data.questions.length} questions successfully!`, 'success');
      window.location.hash = '#/host/review';
    } catch (e) {
      window.showToast('JSON Syntax Error: ' + e.message, 'error');
    }
  },

  startManualEntry() {
    window.AppState.parsedExamDraft = {
      title: 'Manual Practice Test',
      questions: [
        {
          num: 1,
          section: 'Section A',
          group_id: null,
          shared_context: '',
          question_text: 'Enter your question text here',
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correct_option_index: 0,
          explanation: ''
        }
      ]
    };
    window.location.hash = '#/host/review';
  },

  // 2. Review & Advanced Sectional Settings View
  renderReview(container) {
    const draft = window.AppState.parsedExamDraft;
    if (!draft || !draft.questions) {
      window.location.hash = '#/host/upload';
      return;
    }

    const uniqueSecs = [];
    draft.questions.forEach(q => {
      const secName = (q.section || 'General').trim();
      if (!uniqueSecs.includes(secName)) uniqueSecs.push(secName);
    });

    let qHtml = draft.questions.map((q, qIndex) => {
      const isGrouped = !!q.group_id;
      return `
        <div class="card" style="margin-bottom:16px; ${isGrouped ? 'border-left: 4px solid var(--primary-accent);' : ''}" id="q-card-${qIndex}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <span style="font-weight:700;">Question #${qIndex + 1}</span>
              <span style="font-size:0.8rem; background:var(--accent-soft); color:var(--primary-accent); padding:2px 6px; border-radius:4px; margin-left:8px;">${q.section || 'General'}</span>
              ${isGrouped ? `<span style="font-size:0.75rem; background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; margin-left:6px; font-weight:600;">🔗 Linked Group</span>` : ''}
            </div>
            <button class="btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="Host.deleteQuestion(${qIndex})">Delete</button>
          </div>

          ${isGrouped ? `
            <div class="form-group" style="background:var(--bg-muted); padding:10px; border-radius:var(--radius-sm); margin-bottom:12px;">
              <label style="color:var(--text-secondary); font-size:0.8rem; margin-bottom:4px;">Shared Group Context / Passage (Linked across group)</label>
              <textarea rows="2" style="font-size:0.88rem;" onchange="Host.updateQGroupContext(${qIndex}, this.value)">${q.shared_context || ''}</textarea>
            </div>
          ` : ''}

          <div class="form-group">
            <label>Question Text</label>
            <textarea rows="3" onchange="Host.updateQText(${qIndex}, this.value)">${q.question_text}</textarea>
          </div>

          <div class="form-group">
            <label>Section Name</label>
            <input type="text" value="${q.section || 'General'}" onchange="Host.updateQSection(${qIndex}, this.value)" />
          </div>

          <label style="font-size:0.9rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:8px;">Options (Select Correct Answer)</label>
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            ${q.options.map((opt, oIndex) => `
              <div style="display:flex; align-items:center; gap:10px;">
                <input type="radio" name="correct-${qIndex}" style="width:20px; height:20px;" ${q.correct_option_index === oIndex ? 'checked' : ''} onchange="Host.setCorrectOption(${qIndex}, ${oIndex})">
                <input type="text" value="${opt}" onchange="Host.updateOptionText(${qIndex}, ${oIndex}, this.value)" />
                <button class="btn-secondary" style="padding:6px 10px;" onclick="Host.removeOption(${qIndex}, ${oIndex})">✕</button>
              </div>
            `).join('')}
          </div>
          <button class="btn-secondary" style="font-size:0.85rem; padding:4px 10px; margin-bottom:12px;" onclick="Host.addOption(${qIndex})">+ Add Option</button>

          <div class="form-group">
            <label>Explanation / Solution</label>
            <textarea rows="2" placeholder="Explanation..." onchange="Host.updateExplanation(${qIndex}, this.value)">${q.explanation || ''}</textarea>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="max-width: 960px; margin: 0 auto;">
        <h2>Review Questions (${draft.questions.length})</h2>
        <p style="color:var(--text-secondary); margin-bottom:20px;">Linked questions share identical statements and will be grouped together during the exam.</p>

        <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
          <button class="btn-secondary" onclick="Host.addQuestionManually()">+ Add Question</button>
          <a href="#settings-anchor"><button class="btn-primary">Proceed to Section & Exam Settings ↓</button></a>
        </div>

        <div>${qHtml}</div>

        <!-- Sectional Configuration Form -->
        <div class="card" id="settings-anchor" style="margin-top:40px; background:var(--bg-muted);">
          <h3 style="margin-bottom:8px;">Exam & Section Configuration</h3>
          <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:20px;">Configure section time limits, navigation rules, and intra-section shuffling.</p>

          <form id="exam-config-form">
            <div class="form-group">
              <label>Exam / Paper Title</label>
              <input type="text" id="cfg-title" value="${draft.title || 'Practice Mock Exam'}" required />
            </div>

            <!-- Section-Wise Setup Table -->
            <div style="margin:20px 0; background:#fff; padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-color);">
              <h4 style="margin-bottom:12px; color:var(--primary-accent);">📋 Sectional Rules & Time Limits</h4>
              <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:0.9rem; text-align:left;">
                  <thead>
                    <tr style="border-bottom:2px solid var(--border-color); color:var(--text-secondary);">
                      <th style="padding:8px;">Section</th>
                      <th style="padding:8px;">Questions</th>
                      <th style="padding:8px;">Duration (Mins)</th>
                      <th style="padding:8px;">Cutoff Score</th>
                      <th style="padding:8px;">Allow Switch?</th>
                      <th style="padding:8px;">Early Submit?</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${uniqueSecs.map((sec, sIdx) => {
                      const count = draft.questions.filter(q => (q.section || 'General').trim() === sec).length;
                      return `
                        <tr style="border-bottom:1px solid var(--border-color);">
                          <td style="padding:10px 8px;"><strong>${sec}</strong></td>
                          <td style="padding:10px 8px;">${count}</td>
                          <td style="padding:10px 8px;">
                            <input type="number" id="sec-time-${sIdx}" value="${sIdx === 0 ? 60 : 60}" min="1" required style="width:90px;" />
                          </td>
                          <td style="padding:10px 8px;">
                            <input type="number" id="sec-cutoff-${sIdx}" value="0" min="0" step="0.5" style="width:80px;" />
                          </td>
                          <td style="padding:10px 8px;">
                            <select id="sec-switch-${sIdx}" style="width:110px;">
                              <option value="false" selected>🔒 Locked</option>
                              <option value="true">🔓 Allowed</option>
                            </select>
                          </td>
                          <td style="padding:10px 8px;">
                            <select id="sec-early-${sIdx}" style="width:120px;">
                              <option value="true" selected>✅ Enabled</option>
                              <option value="false">⏳ Wait Timer</option>
                            </select>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Marking Scheme -->
            <div class="form-row">
              <div class="form-group">
                <label>Marks for Correct</label>
                <input type="number" step="0.01" id="cfg-marks-correct" value="1.0" required />
              </div>
              <div class="form-group">
                <label>Negative Marks for Wrong</label>
                <input type="number" step="0.01" id="cfg-marks-incorrect" value="0.25" required />
              </div>
              <div class="form-group">
                <label>Marks for Unattempted</label>
                <input type="number" step="0.01" id="cfg-marks-unatt" value="0" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Overall Passing Type</label>
                <select id="cfg-pass-type">
                  <option value="PERCENT" selected>Percentage (%)</option>
                  <option value="MARKS">Absolute Marks</option>
                </select>
              </div>
              <div class="form-group">
                <label>Overall Passing Threshold</label>
                <input type="number" step="0.1" id="cfg-pass-score" value="35" required />
              </div>
            </div>

            <div class="form-row" style="margin-top:10px;">
              <label style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="cfg-shuffle-q" style="width:auto;" checked /> 
                Intra-Section Shuffling (Shuffles questions within each section while keeping linked group questions together)
              </label>
            </div>

            <button type="submit" id="publish-submit-btn" class="btn-primary" style="width:100%; margin-top:24px; padding:14px; font-size:1.1rem;">
              Publish Exam & Generate Test Key
            </button>
          </form>
        </div>
      </div>
    `;

    document.getElementById('exam-config-form').onsubmit = (e) => {
      e.preventDefault();
      Host.saveAndPublishExam(uniqueSecs);
    };
  },

  updateQText(idx, val) { window.AppState.parsedExamDraft.questions[idx].question_text = val; },
  updateQSection(idx, val) {
    window.AppState.parsedExamDraft.questions[idx].section = val;
    Host.renderReview(document.getElementById('sub-view-root') || document.getElementById('app-root'));
  },
  updateQGroupContext(idx, val) { window.AppState.parsedExamDraft.questions[idx].shared_context = val; },
  setCorrectOption(qIdx, oIdx) { window.AppState.parsedExamDraft.questions[qIdx].correct_option_index = oIdx; },
  updateOptionText(qIdx, oIdx, val) { window.AppState.parsedExamDraft.questions[qIdx].options[oIdx] = val; },
  updateExplanation(idx, val) { window.AppState.parsedExamDraft.questions[idx].explanation = val; },
  deleteQuestion(idx) {
    window.AppState.parsedExamDraft.questions.splice(idx, 1);
    Host.renderReview(document.getElementById('sub-view-root') || document.getElementById('app-root'));
  },
  addOption(qIdx) {
    window.AppState.parsedExamDraft.questions[qIdx].options.push('New Option');
    Host.renderReview(document.getElementById('sub-view-root') || document.getElementById('app-root'));
  },
  removeOption(qIdx, oIdx) {
    window.AppState.parsedExamDraft.questions[qIdx].options.splice(oIdx, 1);
    Host.renderReview(document.getElementById('sub-view-root') || document.getElementById('app-root'));
  },
  addQuestionManually() {
    window.AppState.parsedExamDraft.questions.push({
      num: window.AppState.parsedExamDraft.questions.length + 1,
      section: 'Section A',
      group_id: null,
      shared_context: '',
      question_text: 'New Question Text',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correct_option_index: 0,
      explanation: ''
    });
    Host.renderReview(document.getElementById('sub-view-root') || document.getElementById('app-root'));
  },

  // 3. Save to Supabase with Sectional Timing & Linked Group Parameters
  async saveAndPublishExam(uniqueSecs) {
    const draft = window.AppState.parsedExamDraft;
    const title = document.getElementById('cfg-title').value.trim();
    const marksCorrect = parseFloat(document.getElementById('cfg-marks-correct').value);
    const marksIncorrect = parseFloat(document.getElementById('cfg-marks-incorrect').value);
    const marksUnatt = parseFloat(document.getElementById('cfg-marks-unatt').value);
    const passType = document.getElementById('cfg-pass-type').value;
    const passScore = parseFloat(document.getElementById('cfg-pass-score').value);
    const shuffleQ = document.getElementById('cfg-shuffle-q').checked;

    let totalExamDuration = 0;
    const sectionsConfig = uniqueSecs.map((secName, sIdx) => {
      const dur = parseInt(document.getElementById(`sec-time-${sIdx}`).value) || 60;
      const cut = parseFloat(document.getElementById(`sec-cutoff-${sIdx}`).value) || 0;
      const allowSwitch = document.getElementById(`sec-switch-${sIdx}`).value === 'true';
      const earlySubmit = document.getElementById(`sec-early-${sIdx}`).value === 'true';
      totalExamDuration += dur;
      return {
        title: secName,
        order_index: sIdx,
        duration_minutes: dur,
        cutoff_score: cut,
        allow_switching: allowSwitch,
        auto_advance: earlySubmit,
        marks_correct: marksCorrect,
        marks_incorrect: marksIncorrect,
        marks_unattempted: marksUnatt
      };
    });

    window.showLoading('Publishing Exam...', 'Saving sectional rules, linked question groups, and generating key...');

    try {
      const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const numbers = '23456789';
      let code = '';
      for (let i = 0; i < 3; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
      code += '-';
      for (let i = 0; i < 4; i++) code += numbers.charAt(Math.floor(Math.random() * numbers.length));

      let pdfUrl = null;
      if (draft.originalFile) {
        const filePath = `${code}_${draft.originalFile.name}`;
        const { error: upErr } = await window.sb.storage
          .from('exam-pdfs')
          .upload(filePath, draft.originalFile);
        if (!upErr) pdfUrl = filePath;
      }

      // Insert Test
      const { data: testRecord, error: testErr } = await window.sb
        .from('tests')
        .insert({
          test_key: code,
          title,
          duration_minutes: totalExamDuration,
          has_sections: true,
          shuffle_questions: shuffleQ,
          shuffle_options: false,
          passing_score_type: passType,
          passing_score: passScore,
          pdf_url: pdfUrl,
          created_by: window.AppState.user.id
        })
        .select()
        .single();

      if (testErr) throw new Error(testErr.message);

      // Insert Sections
      const secInsertPayload = sectionsConfig.map(sc => ({
        test_id: testRecord.id,
        title: sc.title,
        order_index: sc.order_index,
        duration_minutes: sc.duration_minutes,
        cutoff_score: sc.cutoff_score,
        allow_switching: sc.allow_switching,
        auto_advance: sc.auto_advance,
        marks_correct: sc.marks_correct,
        marks_incorrect: sc.marks_incorrect,
        marks_unattempted: sc.marks_unattempted
      }));

      const { data: insertedSections, error: secErr } = await window.sb
        .from('sections')
        .insert(secInsertPayload)
        .select();

      if (secErr) throw new Error(secErr.message);

      const secMap = {};
      insertedSections.forEach(s => { secMap[s.title] = s.id; });

      for (let qIdx = 0; qIdx < draft.questions.length; qIdx++) {
        const q = draft.questions[qIdx];
        const secId = secMap[(q.section || 'General').trim()] || insertedSections[0].id;

        // If a shared context exists, embed a clean header tag so it can be reconstructed seamlessly
        let formattedQuestionText = q.question_text;
        if (q.shared_context) {
          formattedQuestionText = `[SHARED_GROUP:${q.group_id || 'default'}|${q.shared_context}]\n${q.question_text}`;
        }

        const { data: qRecord } = await window.sb
          .from('questions')
          .insert({
            test_id: testRecord.id,
            section_id: secId,
            order_index: qIdx,
            question_text: formattedQuestionText,
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

      window.AppState.parsedExamDraft = null;
      window.hideLoading();

      const examUrl = `https://mockorbit-cbt.vercel.app/#/instructions/${code}`;
      const portalUrl = `https://mockorbit-cbt.vercel.app`;
      const shareMessage = `📝 *MockOrbit CBT Practice Exam Invitation*\n\n` +
        `📌 *Exam:* ${title}\n` +
        `⏱️ *Total Duration:* ${totalExamDuration} mins (${sectionsConfig.map(s => `${s.title}:${s.duration_minutes}m`).join(' | ')})\n` +
        `🎯 *Marking:* +${marksCorrect} / -${marksIncorrect}\n\n` +
        `🔑 *Test Key:* ${code}\n` +
        `🔗 *Direct Test Link:* ${examUrl}\n\n` +
        `Login and enter the key at: ${portalUrl}`;

      const targetRoot = document.getElementById('sub-view-root') || document.getElementById('app-root');
      targetRoot.innerHTML = `
        <div class="card" style="max-width:620px; margin:30px auto; text-align:center;">
          <div style="font-size:2.8rem; margin-bottom:8px;">🎉</div>
          <h2>Exam Published Successfully!</h2>
          <p style="color:var(--text-secondary); margin-bottom:20px;">Your sectional exam is live with linked group shuffling enabled.</p>
          
          <div style="background:var(--accent-soft); padding:14px; border-radius:var(--radius-md); font-family:monospace; font-size:2.2rem; font-weight:700; color:var(--primary-accent); margin-bottom:16px;">
            ${code}
          </div>

          <div style="background:var(--bg-muted); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:16px; text-align:left; font-size:0.95rem; line-height:1.6; margin-bottom:20px;">
            <p><strong>Exam Name:</strong> ${title}</p>
            <p><strong>Sections:</strong> ${sectionsConfig.map(s => `${s.title} (${s.duration_minutes}m)`).join(' → ')}</p>
            <p><strong>Total Duration:</strong> ${totalExamDuration} Minutes</p>
            <p><strong>Test Key:</strong> <span style="font-family:monospace; font-weight:700; color:var(--primary-accent);">${code}</span></p>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
            <button class="btn-primary" style="width:100%; padding:11px;" onclick="Host.copyInviteText(\`${encodeURIComponent(shareMessage)}\`)">
              📋 Copy Student Invitation
            </button>
            <button class="btn-secondary" style="width:100%;" onclick="Host.shareViaWhatsApp(\`${encodeURIComponent(shareMessage)}\`)">
              💬 Share on WhatsApp
            </button>
          </div>

          <a href="#/host/tests"><button class="btn-outline" style="width:100%;">View All My Tests</button></a>
        </div>
      `;
    } catch (err) {
      window.hideLoading();
      window.showToast('Failed to publish exam: ' + err.message, 'error');
    }
  },

  copyInviteText(encodedText) {
    const text = decodeURIComponent(encodedText);
    navigator.clipboard.writeText(text).then(() => {
      window.showToast('Invitation copied to clipboard!', 'success');
    }).catch(() => {
      window.showToast('Please copy manually.', 'warning');
    });
  },

  shareViaWhatsApp(encodedText) {
    const text = decodeURIComponent(encodedText);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  },

  // 4. My Tests List
  async renderMyTests(container) {
    container.innerHTML = `<div class="card"><p>Loading your exams...</p></div>`;

    const { data: tests, error } = await window.sb
      .from('tests')
      .select('*, attempts(count), sections(*)')
      .order('created_at', { ascending: false });

    if (error) {
      container.innerHTML = `<div class="card"><p>Error: ${error.message}</p></div>`;
      return;
    }

    if (!tests || tests.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:40px;">
          <h3>No Tests Uploaded Yet</h3>
          <p style="color:var(--text-secondary); margin:12px 0;">Upload your first exam paper to get started.</p>
          <a href="#/host/upload"><button class="btn-primary">Upload Test</button></a>
        </div>
      `;
      return;
    }

    const listHtml = tests.map(t => {
      const attemptCount = t.attempts && t.attempts[0] ? t.attempts[0].count : 0;
      const secSummary = t.sections && t.sections.length > 0
        ? t.sections.map(s => `${s.title} (${s.duration_minutes || t.duration_minutes}m)`).join(', ')
        : `${t.duration_minutes} min`;

      return `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:12px;">
          <div>
            <h3 style="margin-bottom:4px;">${t.title}</h3>
            <p style="color:var(--text-secondary); font-size:0.9rem;">
              Key: <strong style="color:var(--primary-accent); font-family:monospace;">${t.test_key}</strong> | Sections: ${secSummary} | Attempts: ${attemptCount}
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
      bodyHtml: 'Are you sure you want to permanently delete this test? All questions, sections, and candidate attempts will be removed.',
      confirmText: 'Delete Permanently',
      danger: true,
      onConfirm: async () => {
        const { error } = await window.sb.from('tests').delete().eq('id', testId);
        if (error) {
          window.showToast(error.message, 'error');
        } else {
          window.showToast('Test deleted successfully.', 'success');
          Host.renderMyTests(document.getElementById('sub-view-root') || document.getElementById('app-root'));
        }
      }
    });
  },

  // 5. User Access Management
  async renderUserManager(container) {
    container.innerHTML = `<div class="card"><p>Loading user list...</p></div>`;

    const [authRes, profRes] = await Promise.all([
      window.sb.from('authorized_emails').select('*').order('created_at', { ascending: false }),
      window.sb.from('profiles').select('*').order('created_at', { ascending: false })
    ]);

    const profiles = profRes.data || [];

    container.innerHTML = `
      <div style="max-width:900px; margin:0 auto;">
        <h2>User Access Management</h2>
        
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

        <div class="card">
          <h3 style="margin-bottom:14px;">Registered Users (${profiles.length})</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.95rem;">
              <thead>
                <tr style="border-bottom:2px solid var(--border-color); color:var(--text-secondary);">
                  <th style="padding:10px;">Name / Email</th>
                  <th style="padding:10px;">Role</th>
                  <th style="padding:10px; text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${profiles.map(p => `
                  <tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:10px;">
                      <strong>${p.full_name || 'No Name'}</strong>
                      <div style="font-size:0.82rem; color:var(--text-secondary);">${p.email}</div>
                    </td>
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
      bodyHtml: `Are you sure you want to remove <strong>${email}</strong>?`,
      confirmText: 'Remove User',
      danger: true,
      onConfirm: async () => {
        await window.sb.from('authorized_emails').delete().eq('email', email);
        const { error } = await window.sb.from('profiles').delete().eq('id', userId);
        if (error) {
          window.showToast(error.message, 'error');
        } else {
          window.showToast('User removed.', 'success');
          Host.renderUserManager(document.getElementById('sub-view-root') || document.getElementById('app-root'));
        }
      }
    });
  },

  // 6. View All Candidate Attempts
  async renderAllHistory(container) {
    container.innerHTML = `<div class="card"><p>Loading all attempt records...</p></div>`;

    const { data: attempts, error } = await window.sb
      .from('attempts')
      .select('*, tests(title, test_key), profiles(email, full_name)')
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
                  <td style="padding:10px;">
                    <strong>${a.profiles?.full_name || 'Student'}</strong>
                    <div style="font-size:0.82rem; color:var(--text-secondary);">${a.profiles?.email || 'Unknown'}</div>
                  </td>
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
          Host.renderAllHistory(document.getElementById('sub-view-root') || document.getElementById('app-root'));
        }
      }
    });
  }
};
