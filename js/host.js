window.Host = {
  editingTestId: null,

  getTarget(container) {
    return container || document.getElementById('sub-view-root') || document.getElementById('app-root');
  },

  // 1. Upload View
  renderUpload(container) {
    this.editingTestId = null;
    const target = this.getTarget(container);
    if (!target) return;

    target.innerHTML = `
      <div class="card" style="max-width: 650px; margin: 20px auto;">
        <h2>Create Exam Paper</h2>
        <p style="color:var(--text-secondary); margin-bottom: 20px; font-size:0.95rem;">
          Upload a question paper PDF or import AI-generated JSON directly.
        </p>

        <!-- Dropzone for PDF -->
        <div id="drop-zone" style="border: 2px dashed var(--border-color); border-radius: var(--radius-md); padding: 30px 20px; text-align: center; cursor: pointer; background: var(--bg-muted); margin-bottom: 20px;">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">📄</div>
          <p style="font-weight: 600; margin-bottom: 4px;">Click to browse or drop PDF here</p>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Supports MCQ, MSQ, NAT question types and sections</p>
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

        <!-- AI JSON Import -->
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

    if (dropZone && fileInput) {
      dropZone.onclick = () => fileInput.click();

      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        uploadStatus.style.display = 'block';
        scannedWarning.style.display = 'none';

        try {
          const parsed = await PdfParser.parseFile(file, (percent) => {
            progressBar.style.width = percent + '%';
            statusLabel.innerText = `Parsing sections, question types & answers... ${percent}%`;
          });

          parsed.originalFile = file;
          window.AppState.parsedExamDraft = this.normalizeDraft(parsed);
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
    }
  },

  normalizeDraft(raw) {
    const title = raw.title || raw.test_title || raw.exam_title || 'Practice Mock Exam';
    const duration = raw.duration_minutes || raw.duration || 180;
    const questionsRaw = raw.questions || [];

    const charMap = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, '1': 0, '2': 1, '3': 2, '4': 3 };

    const questions = questionsRaw.map((q, idx) => {
      const qText = q.question_text || q.question || q.text || '';
      const section = q.section || q.section_name || 'General';
      const qType = q.question_type || (q.correct_option_indexes && q.correct_option_indexes.length > 1 ? 'MSQ' : (q.correct_numeric_min !== null && q.correct_numeric_min !== undefined ? 'NAT' : 'MCQ'));

      let opts = [];
      if (Array.isArray(q.options)) {
        opts = [...q.options];
      } else if (q.options && typeof q.options === 'object') {
        const keys = Object.keys(q.options).sort();
        opts = keys.map(k => String(q.options[k]).trim());
      }

      if (qType !== 'NAT') {
        while (opts.length < 4) {
          opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
        }
      }

      let correctIdx = 0;
      let correctIdxs = [];
      let numMin = q.correct_numeric_min !== undefined ? q.correct_numeric_min : null;
      let numMax = q.correct_numeric_max !== undefined ? q.correct_numeric_max : null;

      if (qType === 'MSQ') {
        correctIdxs = q.correct_option_indexes || [0];
        correctIdx = correctIdxs[0];
      } else if (qType === 'NAT') {
        if (numMin === null && q.correct_answer !== undefined) {
          const val = parseFloat(q.correct_answer);
          numMin = val;
          numMax = val;
        }
      } else {
        if (typeof q.correct_option_index === 'number') {
          correctIdx = q.correct_option_index;
        } else if (q.correct_answer !== undefined && q.correct_answer !== null) {
          const ansStr = String(q.correct_answer).trim().toUpperCase();
          if (charMap[ansStr] !== undefined) {
            correctIdx = charMap[ansStr];
          } else if (!isNaN(parseInt(ansStr))) {
            correctIdx = Math.max(0, parseInt(ansStr) - 1);
          }
        }
        correctIdxs = [correctIdx];
      }

      return {
        num: q.question_number || q.num || (idx + 1),
        section: section.trim(),
        group_id: q.group_id || null,
        shared_context: q.shared_context || '',
        question_text: qText.trim(),
        options: opts,
        question_type: qType,
        correct_option_index: correctIdx,
        correct_option_indexes: correctIdxs,
        correct_numeric_min: numMin,
        correct_numeric_max: numMax,
        explanation: q.explanation || ''
      };
    });

    return {
      title,
      duration_minutes: duration,
      questions
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
        window.AppState.parsedExamDraft = this.normalizeDraft(data);
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
      window.AppState.parsedExamDraft = this.normalizeDraft(data);
      window.showToast(`Loaded ${data.questions.length} questions successfully!`, 'success');
      window.location.hash = '#/host/review';
    } catch (e) {
      window.showToast('JSON Syntax Error: ' + e.message, 'error');
    }
  },

  startManualEntry() {
    this.editingTestId = null;
    window.AppState.parsedExamDraft = {
      title: 'Manual Practice Test',
      duration_minutes: 180,
      questions: [
        {
          num: 1,
          section: 'Section A',
          group_id: null,
          shared_context: '',
          question_text: 'Enter your question text here',
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          question_type: 'MCQ',
          correct_option_index: 0,
          correct_option_indexes: [0],
          correct_numeric_min: null,
          correct_numeric_max: null,
          explanation: ''
        }
      ]
    };
    window.location.hash = '#/host/review';
  },

  async loadTestForEdit(testId) {
    window.showLoading('Loading Test Details...', 'Fetching questions, sections, and marking rules...');
    try {
      const { data: test, error: tErr } = await window.sb
        .from('tests')
        .select('*, sections(*)')
        .eq('id', testId)
        .single();

      if (tErr || !test) throw new Error('Could not find test record.');

      const { data: questions, error: qErr } = await window.sb
        .from('questions')
        .select('*, question_options(*)')
        .eq('test_id', testId)
        .order('order_index', { ascending: true });

      if (qErr) throw qErr;

      const secMap = {};
      (test.sections || []).forEach(s => { secMap[s.id] = s.title; });

      const parsedQuestions = (questions || []).map((q, idx) => {
        let qText = q.question_text || '';
        let groupId = null;
        let sharedContext = '';

        if (qText.startsWith('[SHARED_GROUP:')) {
          const closeIdx = qText.indexOf(']\n');
          if (closeIdx !== -1) {
            const metaStr = qText.substring(14, closeIdx);
            const parts = metaStr.split('|');
            groupId = parts[0];
            sharedContext = parts.slice(1).join('|');
            qText = qText.substring(closeIdx + 2);
          }
        }

        const opts = (q.question_options || [])
          .sort((a, b) => a.option_index - b.option_index)
          .map(o => o.option_text);

        const qType = q.question_type || 'MCQ';
        if (qType !== 'NAT') {
          while (opts.length < 4) {
            opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
          }
        }

        return {
          num: idx + 1,
          section: secMap[q.section_id] || 'General',
          group_id: groupId,
          shared_context: sharedContext,
          question_text: qText,
          options: opts,
          question_type: qType,
          correct_option_index: q.correct_option_index || 0,
          correct_option_indexes: q.correct_option_indexes || [q.correct_option_index || 0],
          correct_numeric_min: q.correct_numeric_min !== undefined ? q.correct_numeric_min : null,
          correct_numeric_max: q.correct_numeric_max !== undefined ? q.correct_numeric_max : null,
          explanation: q.explanation || ''
        };
      });

      this.editingTestId = testId;
      window.AppState.parsedExamDraft = {
        title: test.title,
        folder_id: test.folder_id || null,
        duration_minutes: test.duration_minutes,
        existingSections: test.sections || [],
        passing_score_type: test.passing_score_type || 'PERCENT',
        passing_score: test.passing_score || 35,
        shuffle_questions: test.shuffle_questions !== false,
        questions: parsedQuestions
      };

      window.hideLoading();
      window.location.hash = '#/host/review';
    } catch (err) {
      window.hideLoading();
      window.showToast('Error loading test: ' + err.message, 'error');
    }
  },

  // 3. Review & Sectional Settings View with Section Renaming & Reordering
  async renderReview(container) {
    const target = this.getTarget(container);
    if (!target) return;

    const draft = window.AppState.parsedExamDraft;
    if (!draft || !draft.questions) {
      window.location.hash = '#/host/upload';
      return;
    }

    const { data: folders } = await window.sb.from('folders').select('*').order('name');
    const folderList = folders || [];

    const uniqueSecs = [];
    draft.questions.forEach(q => {
      const secName = (q.section || 'General').trim();
      if (!uniqueSecs.includes(secName)) uniqueSecs.push(secName);
    });

    const isEditing = !!this.editingTestId;
    const existingSecMap = {};
    if (draft.existingSections) {
      draft.existingSections.forEach(s => { existingSecMap[s.title] = s; });
    }

    const isGlobalMode = !draft.existingSections || draft.existingSections.every(s => s.allow_switching === true);

    let qHtml = draft.questions.map((q, qIndex) => {
      const isGrouped = !!q.group_id;
      const qType = q.question_type || 'MCQ';

      let answerConfigHtml = '';
      if (qType === 'NAT') {
        answerConfigHtml = `
          <div class="form-row" style="margin-top:10px;">
            <div class="form-group">
              <label>Min Acceptable Range (NAT)</label>
              <input type="number" step="any" value="${q.correct_numeric_min !== null ? q.correct_numeric_min : ''}" onchange="Host.updateNatMin(${qIndex}, this.value)" />
            </div>
            <div class="form-group">
              <label>Max Acceptable Range (NAT)</label>
              <input type="number" step="any" value="${q.correct_numeric_max !== null ? q.correct_numeric_max : ''}" onchange="Host.updateNatMax(${qIndex}, this.value)" />
            </div>
          </div>
        `;
      } else if (qType === 'MSQ') {
        answerConfigHtml = `
          <label style="font-size:0.9rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:8px;">Options (Check ALL Correct Answers for MSQ)</label>
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            ${(q.options || []).map((opt, oIndex) => {
              const isChecked = (q.correct_option_indexes || []).includes(oIndex);
              return `
                <div style="display:flex; align-items:center; gap:10px;">
                  <input type="checkbox" style="width:20px; height:20px;" ${isChecked ? 'checked' : ''} onchange="Host.toggleMsqOption(${qIndex},${oIndex}, this.checked)">
                  <input type="text" value="${opt}" onchange="Host.updateOptionText(${qIndex},${oIndex}, this.value)" />
                  <button class="btn-secondary" style="padding:6px 10px;" onclick="Host.removeOption(${qIndex},${oIndex})">✕</button>
                </div>
              `;
            }).join('')}
          </div>
          <button class="btn-secondary" style="font-size:0.85rem; padding:4px 10px; margin-bottom:12px;" onclick="Host.addOption(${qIndex})">+ Add Option</button>
        `;
      } else {
        answerConfigHtml = `
          <label style="font-size:0.9rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:8px;">Options (Select ONE Correct Answer for MCQ)</label>
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            ${(q.options || []).map((opt, oIndex) => `
              <div style="display:flex; align-items:center; gap:10px;">
                <input type="radio" name="correct-${qIndex}" style="width:20px; height:20px;" ${q.correct_option_index === oIndex ? 'checked' : ''} onchange="Host.setCorrectOption(${qIndex},${oIndex})">
                <input type="text" value="${opt}" onchange="Host.updateOptionText(${qIndex},${oIndex}, this.value)" />
                <button class="btn-secondary" style="padding:6px 10px;" onclick="Host.removeOption(${qIndex},${oIndex})">✕</button>
              </div>
            `).join('')}
          </div>
          <button class="btn-secondary" style="font-size:0.85rem; padding:4px 10px; margin-bottom:12px;" onclick="Host.addOption(${qIndex})">+ Add Option</button>
        `;
      }

      return `
        <div class="card" style="margin-bottom:16px; ${isGrouped ? 'border-left: 4px solid var(--primary-accent);' : ''}" id="q-card-${qIndex}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <span style="font-weight:700;">Question #${qIndex + 1}</span>
              <span style="font-size:0.8rem; background:var(--accent-soft); color:var(--primary-accent); padding:2px 6px; border-radius:4px; margin-left:8px;">${q.section || 'General'}</span>
              <span style="font-size:0.8rem; background:#f1f5f9; color:#0f172a; padding:2px 6px; border-radius:4px; margin-left:6px; font-weight:700;">${qType}</span>
              ${isGrouped ? `<span style="font-size:0.75rem; background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; margin-left:6px; font-weight:600;">🔗 Linked</span>` : ''}
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <select style="padding:3px 6px; font-size:0.80rem;" onchange="Host.changeQuestionType(${qIndex}, this.value)">
                <option value="MCQ" ${qType === 'MCQ' ? 'selected' : ''}>MCQ</option>
                <option value="MSQ" ${qType === 'MSQ' ? 'selected' : ''}>MSQ</option>
                <option value="NAT" ${qType === 'NAT' ? 'selected' : ''}>NAT</option>
              </select>
              <button class="btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="Host.deleteQuestion(${qIndex})">Delete</button>
            </div>
          </div>

          ${isGrouped ? `
            <div class="form-group" style="background:var(--bg-muted); padding:10px; border-radius:var(--radius-sm); margin-bottom:12px;">
              <label style="color:var(--text-secondary); font-size:0.80rem; margin-bottom:4px;">Shared Group Context / Passage</label>
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

          ${answerConfigHtml}

          <div class="form-group">
            <label>Explanation / Solution</label>
            <textarea rows="2" placeholder="Explanation..." onchange="Host.updateExplanation(${qIndex}, this.value)">${q.explanation || ''}</textarea>
          </div>
        </div>
      `;
    }).join('');

    target.innerHTML = `
      <div style="max-width: 960px; margin: 0 auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h2>${isEditing ? '✏ Edit Exam Paper' : 'Review Questions'} (${draft.questions.length})</h2>
          ${isEditing ? `<span style="background:#e0f2fe; color:#0369a1; padding:4px 12px; border-radius:14px; font-weight:700; font-size:0.85rem;">Editing Existing Test</span>` : ''}
        </div>
        <p style="color:var(--text-secondary); margin-bottom:20px;">Review question types, rename or reorder sections, and configure marking rules below.</p>

        <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
          <button class="btn-secondary" onclick="Host.addQuestionManually()">+ Add Question</button>
          <a href="#settings-anchor"><button class="btn-primary">Proceed to Section & Exam Settings ↓</button></a>
        </div>

        <div>${qHtml}</div>

        <!-- Sectional Configuration Form -->
        <div class="card" id="settings-anchor" style="margin-top:40px; background:var(--bg-muted);">
          <h3 style="margin-bottom:8px;">Exam & Section Configuration</h3>
          <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:20px;">Rename sections, reorder them using arrows, and set timing rules.</p>

          <form id="exam-config-form">
            <div class="form-row">
              <div class="form-group" style="flex:2;">
                <label>Exam / Paper Title</label>
                <input type="text" id="cfg-title" value="${draft.title || 'Practice Mock Exam'}" required />
              </div>
              <div class="form-group" style="flex:1;">
                <label>Assign to Folder</label>
                <select id="cfg-folder">
                  <option value="">(No Folder / Standalone)</option>
                  ${folderList.map(f => `
                    <option value="${f.id}" ${draft.folder_id === f.id ? 'selected' : ''}>📁 ${f.name}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- Global vs Sectional Duration Mode Toggle -->
            <div class="form-row" style="background:#fff; padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-color); margin-bottom:20px;">
              <div class="form-group" style="margin-bottom:0;">
                <label style="font-weight:700; color:var(--primary-accent); margin-bottom:6px;">⏱️ Exam Timing Mode</label>
                <select id="cfg-timing-mode" onchange="Host.toggleTimingMode(this.value)">
                  <option value="GLOBAL" ${isGlobalMode ? 'selected' : ''}>Global Combined Timer (e.g. 180 Mins across all sections)</option>
                  <option value="SECTIONAL" ${!isGlobalMode ? 'selected' : ''}>Sectional Timers (Locked individual section durations)</option>
                </select>
              </div>
              <div class="form-group" id="global-duration-wrapper" style="margin-bottom:0;">
                <label>Total Exam Duration (Mins)</label>
                <input type="number" id="cfg-global-duration" value="${draft.duration_minutes || 180}" min="1" required />
              </div>
            </div>

            <!-- Section-Wise Setup Table -->
            <div style="margin:20px 0; background:#fff; padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-color);">
              <h4 style="margin-bottom:12px; color:var(--primary-accent);">📋 Sectional Rules, Renaming & Reordering</h4>
              <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:0.9rem; text-align:left;" id="sections-table">
                  <thead>
                    <tr style="border-bottom:2px solid var(--border-color); color:var(--text-secondary);">
                      <th style="padding:8px;">Section Name (Editable)</th>
                      <th style="padding:8px;">Questions</th>
                      <th style="padding:8px;" class="sec-time-col">Duration</th>
                      <th style="padding:8px;">Correct (+Marks)</th>
                      <th style="padding:8px;">Incorrect (-Marks)</th>
                      <th style="padding:8px;">Section Total</th>
                      <th style="padding:8px;">Navigation</th>
                      <th style="padding:8px; text-align:right;">Slide</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${uniqueSecs.map((sec, sIdx) => {
                      const count = draft.questions.filter(q => (q.section || 'General').trim() === sec).length;
                      const ex = existingSecMap[sec] || {};
                      const durVal = ex.duration_minutes || 60;
                      const correctVal = ex.marks_correct !== undefined ? ex.marks_correct : 1.0;
                      const incorrectVal = ex.marks_incorrect !== undefined ? ex.marks_incorrect : 0.33;
                      const switchVal = ex.allow_switching !== false ? 'true' : 'false';

                      return `
                        <tr style="border-bottom:1px solid var(--border-color);" data-sec-index="${sIdx}">
                          <td style="padding:10px 8px;">
                            <input type="text" class="sec-name-input" value="${sec}" onchange="Host.renameSection(${sIdx}, this.value)" style="width:160px; font-weight:600;" required />
                          </td>
                          <td style="padding:10px 8px;" class="sec-q-count">${count}</td>
                          <td style="padding:10px 8px;" class="sec-time-col">
                            <input type="number" class="sec-time-input" value="${durVal}" min="1" style="width:70px;" />
                          </td>
                          <td style="padding:10px 8px;">
                            <input type="number" step="0.25" class="sec-correct-input" value="${correctVal}" oninput="Host.recalculateLiveMarks()" style="width:65px;" />
                          </td>
                          <td style="padding:10px 8px;">
                            <input type="number" step="0.01" class="sec-incorrect-input" value="${incorrectVal}" style="width:65px;" />
                          </td>
                          <td style="padding:10px 8px; font-weight:700; color:var(--primary-accent);" class="sec-total-marks">
                            ${(count * correctVal).toFixed(1)}
                          </td>
                          <td style="padding:10px 8px;">
                            <select class="sec-switch-select" style="width:95px;">
                              <option value="true" ${switchVal === 'true' ? 'selected' : ''}>🔓 Free</option>
                              <option value="false" ${switchVal === 'false' ? 'selected' : ''}>🔒 Locked</option>
                            </select>
                          </td>
                          <td style="padding:10px 8px; text-align:right; white-space:nowrap;">
                            <button type="button" class="btn-secondary" style="padding:2px 6px; font-size:0.75rem;" onclick="Host.moveSection(${sIdx}, -1)">▲</button>
                            <button type="button" class="btn-secondary" style="padding:2px 6px; font-size:0.75rem;" onclick="Host.moveSection(${sIdx}, 1)">▼</button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>

              <!-- Grand Total Marks Display -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:12px; border-top:1px dashed var(--border-color); font-size:1.05rem;">
                <span>🎯 <strong>Grand Total Exam Marks:</strong> <span id="grand-total-marks" style="color:var(--primary-accent); font-weight:800;">0.0</span></span>
                <span style="font-size:0.85rem; color:var(--text-secondary);">Calculated as sum of all section totals.</span>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Overall Passing Type</label>
                <select id="cfg-pass-type">
                  <option value="PERCENT" ${draft.passing_score_type === 'PERCENT' ? 'selected' : ''}>Percentage (%)</option>
                  <option value="MARKS" ${draft.passing_score_type === 'MARKS' ? 'selected' : ''}>Absolute Marks</option>
                </select>
              </div>
              <div class="form-group">
                <label>Overall Passing Threshold</label>
                <input type="number" step="0.1" id="cfg-pass-score" value="${draft.passing_score || 35}" required />
              </div>
            </div>

            <div class="form-row" style="margin-top:10px;">
              <label style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="cfg-shuffle-q" style="width:auto;" ${draft.shuffle_questions !== false ? 'checked' : ''} /> 
                Intra-Section Shuffling (Shuffles questions within each section while keeping linked group questions together)
              </label>
            </div>

            <button type="submit" id="publish-submit-btn" class="btn-primary" style="width:100%; margin-top:24px; padding:14px; font-size:1.1rem;">
              ${isEditing ? '💾 Update & Save Exam Changes' : 'Publish Exam & Generate Test Key'}
            </button>
          </form>
        </div>
      </div>
    `;

    Host.recalculateLiveMarks();
    Host.toggleTimingMode(document.getElementById('cfg-timing-mode').value);

    document.getElementById('exam-config-form').onsubmit = (e) => {
      e.preventDefault();
      Host.saveAndPublishExam(uniqueSecs);
    };
  },

  renameSection(oldIdx, newName) {
    const draft = window.AppState.parsedExamDraft;
    const uniqueSecs = [];
    draft.questions.forEach(q => {
      const sName = (q.section || 'General').trim();
      if (!uniqueSecs.includes(sName)) uniqueSecs.push(sName);
    });

    const oldName = uniqueSecs[oldIdx];
    if (!oldName) return;

    draft.questions.forEach(q => {
      if ((q.section || 'General').trim() === oldName.trim()) {
        q.section = newName.trim();
      }
    });

    Host.renderReview();
  },

  moveSection(secIdx, direction) {
    const draft = window.AppState.parsedExamDraft;
    const uniqueSecs = [];
    draft.questions.forEach(q => {
      const sName = (q.section || 'General').trim();
      if (!uniqueSecs.includes(sName)) uniqueSecs.push(sName);
    });

    const targetIdx = secIdx + direction;
    if (targetIdx < 0 || targetIdx >= uniqueSecs.length) return;

    const secToMove = uniqueSecs[secIdx];
    uniqueSecs.splice(secIdx, 1);
    uniqueSecs.splice(targetIdx, 0, secToMove);

    let reorderedQuestions = [];
    uniqueSecs.forEach(sName => {
      const matching = draft.questions.filter(q => (q.section || 'General').trim() === sName);
      reorderedQuestions = reorderedQuestions.concat(matching);
    });

    draft.questions = reorderedQuestions;
    Host.renderReview();
  },

  toggleTimingMode(mode) {
    const globalWrapper = document.getElementById('global-duration-wrapper');
    const timeCols = document.querySelectorAll('.sec-time-col');
    if (mode === 'GLOBAL') {
      if (globalWrapper) globalWrapper.style.display = 'block';
      timeCols.forEach(el => el.style.display = 'none');
    } else {
      if (globalWrapper) globalWrapper.style.display = 'none';
      timeCols.forEach(el => el.style.display = 'table-cell');
    }
  },

  recalculateLiveMarks() {
    let grandTotal = 0;
    const rows = document.querySelectorAll('#sections-table tbody tr');
    rows.forEach(row => {
      const qCount = parseFloat(row.querySelector('.sec-q-count')?.innerText || 0);
      const correctInput = parseFloat(row.querySelector('.sec-correct-input')?.value || 0);
      const secTotalElem = row.querySelector('.sec-total-marks');
      const secScore = qCount * correctInput;
      if (secTotalElem) secTotalElem.innerText = secScore.toFixed(1);
      grandTotal += secScore;
    });

    const grandTotalElem = document.getElementById('grand-total-marks');
    if (grandTotalElem) grandTotalElem.innerText = grandTotal.toFixed(1);
  },

  updateQText(idx, val) { window.AppState.parsedExamDraft.questions[idx].question_text = val; },
  updateQSection(idx, val) {
    window.AppState.parsedExamDraft.questions[idx].section = val;
    Host.renderReview();
  },
  updateQGroupContext(idx, val) { window.AppState.parsedExamDraft.questions[idx].shared_context = val; },
  setCorrectOption(qIdx, oIdx) { window.AppState.parsedExamDraft.questions[qIdx].correct_option_index = oIdx; },
  toggleMsqOption(qIdx, oIdx, isChecked) {
    let list = window.AppState.parsedExamDraft.questions[qIdx].correct_option_indexes || [];
    if (isChecked) {
      if (!list.includes(oIdx)) list.push(oIdx);
    } else {
      list = list.filter(i => i !== oIdx);
    }
    window.AppState.parsedExamDraft.questions[qIdx].correct_option_indexes = list;
  },
  updateNatMin(qIdx, val) { window.AppState.parsedExamDraft.questions[qIdx].correct_numeric_min = val !== '' ? parseFloat(val) : null; },
  updateNatMax(qIdx, val) { window.AppState.parsedExamDraft.questions[qIdx].correct_numeric_max = val !== '' ? parseFloat(val) : null; },
  changeQuestionType(qIdx, newType) {
    window.AppState.parsedExamDraft.questions[qIdx].question_type = newType;
    Host.renderReview();
  },
  updateOptionText(qIdx, oIdx, val) { window.AppState.parsedExamDraft.questions[qIdx].options[oIdx] = val; },
  updateExplanation(idx, val) { window.AppState.parsedExamDraft.questions[idx].explanation = val; },
  deleteQuestion(idx) {
    window.AppState.parsedExamDraft.questions.splice(idx, 1);
    Host.renderReview();
  },
  addOption(qIdx) {
    window.AppState.parsedExamDraft.questions[qIdx].options.push('New Option');
    Host.renderReview();
  },
  removeOption(qIdx, oIdx) {
    window.AppState.parsedExamDraft.questions[qIdx].options.splice(oIdx, 1);
    Host.renderReview();
  },
  addQuestionManually() {
    window.AppState.parsedExamDraft.questions.push({
      num: window.AppState.parsedExamDraft.questions.length + 1,
      section: 'Section A',
      group_id: null,
      shared_context: '',
      question_text: 'New Question Text',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      question_type: 'MCQ',
      correct_option_index: 0,
      correct_option_indexes: [0],
      correct_numeric_min: null,
      correct_numeric_max: null,
      explanation: ''
    });
    Host.renderReview();
  },

  async saveAndPublishExam(uniqueSecs) {
    const draft = window.AppState.parsedExamDraft;
    const isEditing = !!this.editingTestId;
    const title = document.getElementById('cfg-title').value.trim();
    const folderId = document.getElementById('cfg-folder').value || null;
    const timingMode = document.getElementById('cfg-timing-mode').value;
    const globalDur = parseInt(document.getElementById('cfg-global-duration')?.value) || 180;
    const passType = document.getElementById('cfg-pass-type').value;
    const passScore = parseFloat(document.getElementById('cfg-pass-score').value);
    const shuffleQ = document.getElementById('cfg-shuffle-q').checked;

    const rows = document.querySelectorAll('#sections-table tbody tr');
    let totalExamDuration = 0;

    const sectionsConfig = [];
    rows.forEach((row, sIdx) => {
      const secName = row.querySelector('.sec-name-input').value.trim() || `Section ${sIdx + 1}`;
      const dur = timingMode === 'GLOBAL' ? Math.round(globalDur / rows.length) : (parseInt(row.querySelector('.sec-time-input')?.value) || 60);
      const correctM = parseFloat(row.querySelector('.sec-correct-input')?.value) || 1.0;
      const incorrectRaw = row.querySelector('.sec-incorrect-input')?.value;
      const incorrectM = (incorrectRaw !== '' && !isNaN(parseFloat(incorrectRaw))) ? parseFloat(incorrectRaw) : 0.0;
      const cut = parseFloat(row.querySelector('.sec-cutoff-input')?.value) || 0;
      const allowSwitch = timingMode === 'GLOBAL' ? true : (row.querySelector('.sec-switch-select')?.value === 'true');

      totalExamDuration += dur;
      sectionsConfig.push({
        title: secName,
        order_index: sIdx,
        duration_minutes: dur,
        cutoff_score: cut,
        allow_switching: allowSwitch,
        auto_advance: true,
        marks_correct: correctM,
        marks_incorrect: incorrectM,
        marks_unattempted: 0
      });
    });

    if (timingMode === 'GLOBAL') {
      totalExamDuration = globalDur;
    }

    window.showLoading(
      isEditing ? 'Updating Exam Paper...' : 'Publishing Exam...',
      'Saving sectional configuration and marking formulas...'
    );

    try {
      let testRecord = null;
      let code = '';

      if (isEditing) {
        const { data: existingTest, error: getErr } = await window.sb
          .from('tests')
          .select('test_key')
          .eq('id', this.editingTestId)
          .single();

        if (getErr || !existingTest) throw new Error('Existing test not found.');
        code = existingTest.test_key;

        const { data: updatedTest, error: updateErr } = await window.sb
          .from('tests')
          .update({
            title,
            folder_id: folderId,
            duration_minutes: totalExamDuration,
            has_sections: true,
            shuffle_questions: shuffleQ,
            passing_score_type: passType,
            passing_score: passScore
          })
          .eq('id', this.editingTestId)
          .select()
          .single();

        if (updateErr) throw new Error(updateErr.message);
        testRecord = updatedTest;

        await window.sb.from('questions').delete().eq('test_id', this.editingTestId);
        await window.sb.from('sections').delete().eq('test_id', this.editingTestId);
      } else {
        const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const numbers = '23456789';
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

        const { data: newTest, error: insertErr } = await window.sb
          .from('tests')
          .insert({
            test_key: code,
            title,
            folder_id: folderId,
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

        if (insertErr) throw new Error(insertErr.message);
        testRecord = newTest;
      }

      // Insert Sections
      const { data: insertedSections, error: secErr } = await window.sb
        .from('sections')
        .insert(sectionsConfig.map(sc => ({
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
        })))
        .select();

      if (secErr) throw new Error(secErr.message);

      const secMap = {};
      insertedSections.forEach(s => { secMap[s.title] = s.id; });

      // Insert Questions
      for (let qIdx = 0; qIdx < draft.questions.length; qIdx++) {
        const q = draft.questions[qIdx];
        const secId = secMap[(q.section || 'General').trim()] || insertedSections[0].id;

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
            question_type: q.question_type || 'MCQ',
            correct_option_index: q.correct_option_index || 0,
            correct_option_indexes: q.correct_option_indexes || [q.correct_option_index || 0],
            correct_numeric_min: q.correct_numeric_min,
            correct_numeric_max: q.correct_numeric_max,
            explanation: q.explanation
          })
          .select()
          .single();

        if (qRecord && q.question_type !== 'NAT' && q.options && q.options.length > 0) {
          const optPayload = q.options.map((optText, oIdx) => ({
            question_id: qRecord.id,
            option_index: oIdx,
            option_text: optText
          }));
          await window.sb.from('question_options').insert(optPayload);
        }
      }

      this.editingTestId = null;
      window.AppState.parsedExamDraft = null;
      window.hideLoading();

      const examUrl = `https://mockorbit-cbt.vercel.app/#/instructions/${code}`;
      const portalUrl = `https://mockorbit-cbt.vercel.app`;
      const shareMessage = `📝 *MockOrbit CBT Practice Exam Invitation*\n\n` +
        `📌 *Exam:* ${title}\n` +
        `⏱️ *Total Duration:* ${totalExamDuration} mins\n\n` +
        `🔑 *Test Key:* ${code}\n` +
        `🔗 *Direct Test Link:* ${examUrl}\n\n` +
        `Login and enter the key at: ${portalUrl}`;

      const targetRoot = this.getTarget();
      targetRoot.innerHTML = `
        <div class="card" style="max-width:620px; margin:30px auto; text-align:center;">
          <div style="font-size:2.8rem; margin-bottom:8px;">${isEditing ? '💾' : '🎉'}</div>
          <h2>${isEditing ? 'Exam Updated Successfully!' : 'Exam Published Successfully!'}</h2>
          <p style="color:var(--text-secondary); margin-bottom:20px;">
            ${isEditing ? 'All section reordering, renaming, and configuration rules have been updated.' : 'Your exam is live. Share the key with candidates:'}
          </p>
          
          <div style="background:var(--accent-soft); padding:14px; border-radius:var(--radius-md); font-family:monospace; font-size:2.2rem; font-weight:700; color:var(--primary-accent); margin-bottom:16px;">
            ${code}
          </div>

          <div style="background:var(--bg-muted); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:16px; text-align:left; font-size:0.95rem; line-height:1.6; margin-bottom:20px;">
            <p><strong>Exam Name:</strong> ${title}</p>
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
      window.showToast('Failed to save exam: ' + err.message, 'error');
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

  async renderFolderManager(container) {
    const target = this.getTarget(container);
    if (!target) return;

    target.innerHTML = `<div class="card"><p>Loading folder management...</p></div>`;

    const [foldersRes, testsRes, allocRes, profRes] = await Promise.all([
      window.sb.from('folders').select('*').order('created_at', { ascending: false }),
      window.sb.from('tests').select('id, title, folder_id'),
      window.sb.from('folder_allocations').select('*'),
      window.sb.from('profiles').select('id, email, full_name, role').order('email')
    ]);

    const folders = foldersRes.data || [];
    const tests = testsRes.data || [];
    const allocations = allocRes.data || [];

    target.innerHTML = `
      <div style="max-width:1000px; margin:0 auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <div>
            <h2>Test Folders & Student Allocations</h2>
            <p style="color:var(--text-secondary); font-size:0.95rem;">Group your exams into folders and allocate them directly to students.</p>
          </div>
          <button class="btn-primary" onclick="Host.promptCreateFolder()">+ New Folder</button>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px;">
          ${folders.length === 0 ? `
            <div class="card" style="grid-column:1/-1; text-align:center; padding:40px;">
              <h3>No Folders Created Yet</h3>
              <p style="color:var(--text-secondary); margin:10px 0;">Create a folder like "GATE 2026 Series" to group tests and assign them to students.</p>
              <button class="btn-primary" onclick="Host.promptCreateFolder()">Create First Folder</button>
            </div>
          ` : folders.map(f => {
            const folderTests = tests.filter(t => t.folder_id === f.id);
            const folderAllocs = allocations.filter(a => a.folder_id === f.id);

            return `
              <div class="card" style="border-top:4px solid #0284c7; display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                    <div style="font-size:1.6rem;">📁</div>
                    <div style="display:flex; gap:6px;">
                      <button class="btn-outline" style="padding:3px 8px; font-size:0.75rem;" onclick="Host.promptEditFolder('${f.id}', '${f.name.replace(/'/g, "\\'")}')">Rename</button>
                      <button class="btn-danger" style="padding:3px 8px; font-size:0.75rem;" onclick="Host.deleteFolder('${f.id}', '${f.name.replace(/'/g, "\\'")}')">Delete</button>
                    </div>
                  </div>
                  <h3 style="margin-bottom:6px;">${f.name}</h3>
                  <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">
                    📚 <strong>${folderTests.length}</strong> Tests &nbsp;\vert{}&nbsp; 👥 <strong>${folderAllocs.length}</strong> Students Assigned
                  </p>
                </div>

                <div style="border-top:1px solid var(--border-color); padding-top:12px; margin-top:8px;">
                  <button class="btn-secondary" style="font-size:0.85rem; padding:6px 12px; width:100%;" onclick="Host.openAllocationModal('${f.id}', '${f.name.replace(/'/g, "\\'")}')">
                    👥 Manage Student Access
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  promptCreateFolder() {
    const name = prompt('Enter new folder name (e.g. "GATE Test Series"):');
    if (!name || !name.trim()) return;
    this.createFolder(name.trim());
  },

  async createFolder(name) {
    const { error } = await window.sb.from('folders').insert({
      name,
      created_by: window.AppState.user.id
    });
    if (error) {
      window.showToast(error.message, 'error');
    } else {
      window.showToast(`Folder "${name}" created!`, 'success');
      this.renderFolderManager();
    }
  },

  promptEditFolder(folderId, currentName) {
    const newName = prompt('Edit folder name:', currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) return;
    this.updateFolderName(folderId, newName.trim());
  },

  async updateFolderName(folderId, newName) {
    const { error } = await window.sb.from('folders').update({ name: newName }).eq('id', folderId);
    if (error) {
      window.showToast(error.message, 'error');
    } else {
      window.showToast('Folder renamed successfully.', 'success');
      this.renderFolderManager();
    }
  },

  deleteFolder(folderId, folderName) {
    window.showModal({
      title: `Delete Folder "${folderName}"?`,
      bodyHtml: `<p>Are you sure you want to delete this folder? Tests inside will become unfiled.</p>`,
      confirmText: 'Delete Folder',
      danger: true,
      onConfirm: async () => {
        await window.sb.from('folders').delete().eq('id', folderId);
        window.showToast('Folder deleted.', 'success');
        Host.renderFolderManager();
      }
    });
  },

  async openAllocationModal(folderId, folderName) {
    window.showLoading('Loading Students...', 'Fetching candidate list...');
    const [studentsRes, allocsRes] = await Promise.all([
      window.sb.from('profiles').select('id, email, full_name, role').order('email'),
      window.sb.from('folder_allocations').select('user_id').eq('folder_id', folderId)
    ]);
    window.hideLoading();

    const students = studentsRes.data || [];
    const assignedUserIds = new Set((allocsRes.data || []).map(a => a.user_id));

    const modalBody = `
      <p style="margin-bottom:12px; font-size:0.9rem; color:var(--text-secondary);">
        Select candidates for <strong>${folderName}</strong>:
      </p>
      <div style="max-height:280px; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px; padding:10px; background:var(--bg-muted);">
        ${students.map(s => `
          <label style="display:flex; align-items:center; gap:10px; padding:6px 8px; cursor:pointer; font-size:0.9rem;">
            <input type="checkbox" class="student-alloc-cb" value="${s.id}" ${assignedUserIds.has(s.id) ? 'checked' : ''} style="width:18px; height:18px;" />
            <div><strong>${s.full_name || s.email}</strong> <span style="font-size:0.8rem; color:var(--text-secondary);">(${s.role})</span></div>
          </label>
        `).join('')}
      </div>
    `;

    window.showModal({
      title: `Allocate "${folderName}"`,
      bodyHtml: modalBody,
      confirmText: 'Save Allocations',
      onConfirm: async () => {
        const checked = document.querySelectorAll('.student-alloc-cb:checked');
        const userIds = Array.from(checked).map(cb => cb.value);

        window.showLoading('Saving Allocations...', 'Updating access records...');
        await window.sb.from('folder_allocations').delete().eq('folder_id', folderId);
        if (userIds.length > 0) {
          await window.sb.from('folder_allocations').insert(userIds.map(uId => ({ folder_id: folderId, user_id: uId })));
        }
        window.hideLoading();
        window.showToast('Allocations updated successfully!', 'success');
        Host.renderFolderManager();
      }
    });
  },

  async renderMyTests(container) {
    const target = this.getTarget(container);
    if (!target) return;

    target.innerHTML = `<div class="card"><p>Loading your exams...</p></div>`;

    const [testsRes, foldersRes] = await Promise.all([
      window.sb.from('tests').select('*, attempts(count), sections(*)').order('created_at', { ascending: false }),
      window.sb.from('folders').select('*').order('name')
    ]);

    const tests = testsRes.data || [];
    const folders = foldersRes.data || [];

    const folderMap = { 'unfiled': { name: 'Standalone / Unfiled Tests', tests: [] } };
    folders.forEach(f => { folderMap[f.id] = { name: f.name, tests: [] }; });
    tests.forEach(t => {
      if (t.folder_id && folderMap[t.folder_id]) folderMap[t.folder_id].tests.push(t);
      else folderMap['unfiled'].tests.push(t);
    });

    const groupsHtml = Object.keys(folderMap).map(fId => {
      const group = folderMap[fId];
      if (group.tests.length === 0) return '';

      const testItems = group.tests.map(t => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:10px;">
          <div>
            <h4 style="margin-bottom:4px; font-size:1.05rem;">${t.title}</h4>
            <p style="color:var(--text-secondary); font-size:0.88rem;">Key: <strong style="color:var(--primary-accent); font-family:monospace;">${t.test_key}</strong> | Duration: ${t.duration_minutes}m</p>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-primary" style="padding:6px 12px; font-size:0.85rem;" onclick="Host.loadTestForEdit('${t.id}')">✏ Edit</button>
            <button class="btn-outline" onclick="navigator.clipboard.writeText('${t.test_key}'); window.showToast('Copied test key!', 'success');">Copy Key</button>
            <a href="#/instructions/${t.test_key}"><button class="btn-secondary">Preview</button></a>
            <button class="btn-danger" onclick="Host.deleteTest('${t.id}')">Delete</button>
          </div>
        </div>
      `).join('');

      return `
        <div style="margin-bottom:28px;">
          <h3 style="display:flex; align-items:center; gap:8px; margin-bottom:12px; font-size:1.2rem; color:var(--primary-accent);">
            <span>📁</span> ${group.name} (${group.tests.length})
          </h3>
          ${testItems}
        </div>
      `;
    }).join('');

    target.innerHTML = `
      <div style="max-width:1000px; margin:0 auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
          <div>
            <h2>My Uploaded Tests</h2>
            <p style="color:var(--text-secondary); font-size:0.95rem;">Manage published tests grouped by folders.</p>
          </div>
          <div style="display:flex; gap:10px;">
            <a href="#/host/folders"><button class="btn-secondary">📁 Manage Folders</button></a>
            <a href="#/host/upload"><button class="btn-primary">+ Upload New Test</button></a>
          </div>
        </div>
        ${groupsHtml}
      </div>
    `;
  },

  deleteTest(testId) {
    window.showModal({
      title: 'Delete Test?',
      bodyHtml: 'Are you sure you want to delete this test?',
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        await window.sb.from('tests').delete().eq('id', testId);
        window.showToast('Test deleted.', 'success');
        Host.renderMyTests();
      }
    });
  },

  async renderUserManager(container) {
    const target = this.getTarget(container);
    if (!target) return;

    target.innerHTML = `<div class="card"><p>Loading users...</p></div>`;
    const [authRes, profRes] = await Promise.all([
      window.sb.from('authorized_emails').select('*').order('created_at', { ascending: false }),
      window.sb.from('profiles').select('*').order('created_at', { ascending: false })
    ]);
    const profiles = profRes.data || [];

    target.innerHTML = `
      <div style="max-width:900px; margin:0 auto;">
        <h2>User Access Management</h2>
        <div class="card" style="margin:20px 0;">
          <h3>Authorize New Student Email</h3>
          <form id="add-auth-email-form" style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
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
                  <td style="padding:10px;"><strong>${p.full_name || 'No Name'}</strong><div style="font-size:0.82rem; color:var(--text-secondary);">${p.email}</div></td>
                  <td style="padding:10px;"><span class="nav-badge">${p.role}</span></td>
                  <td style="padding:10px; text-align:right;">
                    <button class="btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="Host.deleteUser('${p.id}', '${p.email}')">Remove</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('add-auth-email-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email-input').value.trim().toLowerCase();
      const role = document.getElementById('auth-role-input').value;
      await window.sb.from('authorized_emails').insert({ email, role });
      window.showToast(`Authorized ${email}!`, 'success');
      Host.renderUserManager();
    };
  },

  deleteUser(userId, email) {
    window.showModal({
      title: 'Remove User?',
      bodyHtml: `Remove <strong>${email}</strong>?`,
      confirmText: 'Remove',
      danger: true,
      onConfirm: async () => {
        await window.sb.from('profiles').delete().eq('id', userId);
        window.showToast('User removed.', 'success');
        Host.renderUserManager();
      }
    });
  },

  async renderAllHistory(container) {
    const target = this.getTarget(container);
    if (!target) return;

    target.innerHTML = `<div class="card"><p>Loading history...</p></div>`;
    const { data: attempts } = await window.sb.from('attempts').select('*, tests(title, test_key), profiles(email, full_name)').not('submitted_at', 'is', null).order('submitted_at', { ascending: false });

    target.innerHTML = `
      <div style="max-width:1100px; margin:0 auto;">
        <h2>All Candidate Attempts</h2>
        <div class="card" style="margin-top:20px; overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.95rem;">
            <thead>
              <tr style="border-bottom:2px solid var(--border-color); color:var(--text-secondary);">
                <th style="padding:10px;">Candidate</th>
                <th style="padding:10px;">Exam</th>
                <th style="padding:10px;">Score</th>
                <th style="padding:10px;">Status</th>
                <th style="padding:10px; text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${(attempts || []).map(a => `
                <tr style="border-bottom:1px solid var(--border-color);">
                  <td style="padding:10px;"><strong>${a.profiles?.full_name || 'Student'}</strong><div style="font-size:0.82rem; color:var(--text-secondary);">${a.profiles?.email}</div></td>
                  <td style="padding:10px;">${a.tests?.title || 'Test'}</td>
                  <td style="padding:10px; font-weight:600;">${a.total_score} /${a.max_score}</td>
                  <td style="padding:10px;"><span style="color:${a.is_passed ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${a.is_passed ? 'PASS' : 'FAIL'}</span></td>
                  <td style="padding:10px; text-align:right;"><a href="#/results/${a.id}"><button class="btn-secondary" style="padding:4px 8px; font-size:0.8rem;">Results</button></a></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
};
