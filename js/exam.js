window.Exam = {
  currentTest: null,
  sections: [],
  questionsBySection: [],
  allQuestionsFlat: [],
  currentSectionIndex: 0,
  currentQuestionIndex: 0,
  answers: {},
  reviewMarked: {},
  visited: {},
  sectionTimeRemaining: {},
  timerInterval: null,
  attemptId: null,
  isPaused: false,

  // 1. Dual Mode: Key Prompt + Allocated Folders
  async renderKeyPrompt(container) {
    container.innerHTML = `<div class="card" style="text-align:center; padding:30px;"><p>Loading tests and assignments...</p></div>`;

    let allocatedFolders = [];
    const userId = window.AppState.user?.id;

    if (userId) {
      try {
        const { data: allocs } = await window.sb
          .from('folder_allocations')
          .select('folder_id, folders(id, name, tests(*, sections(*)))')
          .eq('user_id', userId);

        if (allocs) {
          allocatedFolders = allocs
            .map(a => a.folders)
            .filter(Boolean);
        }
      } catch (e) {
        console.warn('Error fetching allocated folders:', e);
      }
    }

    const hasAllocations = allocatedFolders.length > 0;

    container.innerHTML = `
      <div style="max-width: 900px; margin: 20px auto;">
        <div style="margin-bottom: 24px;">
          <h2>Candidate Practice Dashboard</h2>
          <p style="color:var(--text-secondary); font-size:0.95rem;">
            Launch practice exams allocated to your account by your exam host, or enter a private test access key.
          </p>
        </div>

        <div style="display:flex; flex-direction:column; gap:24px;">
          <!-- Manual Key Prompt Card -->
          <div class="card" style="border-left: 4px solid var(--primary-accent); padding:20px;">
            <h3 style="margin-bottom: 6px; font-size:1.15rem;">🔑 Enter Test Access Key</h3>
            <p style="color:var(--text-secondary); font-size:0.88rem; margin-bottom:14px;">
              Have a test key given by your host? Enter it here:
            </p>
            <form id="key-form" style="display:flex; gap:10px; max-width:480px;">
              <input type="text" id="test-key-input" placeholder="e.g. ABC-4821" required style="font-family:monospace; font-size:1.15rem; text-align:center; text-transform:uppercase; flex:1;" />
              <button type="submit" class="btn-primary" style="padding:10px 18px; white-space:nowrap;">Go to Test</button>
            </form>
          </div>

          <!-- Allocated Folders Section -->
          <div>
            <h3 style="margin-bottom: 12px; font-size:1.2rem; display:flex; align-items:center; gap:8px;">
              <span>📁</span> My Allocated Exam Folders
            </h3>

            ${!hasAllocations ? `
              <div class="card" style="text-align:center; padding:32px; background:var(--bg-muted);">
                <p style="color:var(--text-secondary); margin:0;">
                  No specific folders have been allocated to your account yet. Use the key box above to launch tests directly.
                </p>
              </div>
            ` : allocatedFolders.map(f => {
              const tests = f.tests || [];
              return `
                <div class="card" style="margin-bottom:16px; border-top: 3px solid #0284c7;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                    <h4 style="font-size:1.1rem; color:var(--text-main);">📁 ${f.name}</h4>
                    <span style="font-size:0.8rem; background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:12px; font-weight:600;">
                      ${tests.length}${tests.length === 1 ? 'Exam' : 'Exams'}
                    </span>
                  </div>

                  ${tests.length === 0 ? `
                    <p style="color:var(--text-secondary); font-size:0.88rem;">No exams have been uploaded into this folder yet.</p>
                  ` : `
                    <div style="display:flex; flex-direction:column; gap:8px;">
                      ${tests.map(t => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:var(--bg-muted); border-radius:6px; flex-wrap:wrap; gap:10px;">
                          <div>
                            <strong>${t.title}</strong>
                            <div style="font-size:0.82rem; color:var(--text-secondary); margin-top:2px;">
                              Duration: ${t.duration_minutes} Mins \vert{} Sections:${t.sections?.length || 1}
                            </div>
                          </div>
                          <a href="#/instructions/${t.test_key}">
                            <button class="btn-primary" style="padding:6px 14px; font-size:0.85rem;">Start Exam ➔</button>
                          </a>
                        </div>
                      `).join('')}
                    </div>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    document.getElementById('key-form').onsubmit = (e) => {
      e.preventDefault();
      const key = document.getElementById('test-key-input').value.trim().toUpperCase();
      window.location.hash = `#/instructions/${key}`;
    };
  },

  async renderInstructions(container, testKey) {
    container.innerHTML = `<div class="card"><p>Loading exam instructions...</p></div>`;

    const { data: test, error } = await window.sb
      .from('tests')
      .select('*, sections(*), questions(count)')
      .eq('test_key', testKey)
      .single();

    if (error || !test) {
      container.innerHTML = `
        <div class="card" style="text-align:center;">
          <h3>Invalid Test Key</h3>
          <p style="color:var(--text-secondary); margin:12px 0;">No test found for key "${testKey}".</p>
          <a href="#/take-key"><button class="btn-primary">Try Another Key</button></a>
        </div>
      `;
      return;
    }

    const sortedSections = (test.sections || []).sort((a, b) => a.order_index - b.order_index);

    const storageKey = `cbt_attempt_${test.id}_${window.AppState.user.id}`;
    const savedState = localStorage.getItem(storageKey);
    let resumeNotice = '';

    if (savedState) {
      try {
        resumeNotice = `
          <div style="background:#e8f0fe; border:1px solid #1a73e8; border-radius:var(--radius-sm); padding:12px; margin-bottom:20px; text-align:left;">
            <strong>📌 Resume Saved Attempt Available</strong>
            <p style="font-size:0.9rem; margin-top:4px;">You have an active in-progress attempt. Resuming will return you directly to your active section.</p>
          </div>
        `;
      } catch (e) {}
    }

    container.innerHTML = `
      <div class="card" style="max-width: 800px; margin: 20px auto;">
        <h2>${test.title}</h2>
        <p style="color:var(--text-secondary); margin-bottom: 20px;">Please read the following instructions carefully before starting the exam.</p>

        ${resumeNotice}

        <div style="background:var(--bg-muted); padding:16px; border-radius:var(--radius-md); margin-bottom:20px;">
          <h4 style="margin-bottom:8px;">Section Breakdown & Rules</h4>
          <table style="width:100%; border-collapse:collapse; font-size:0.9rem; margin-bottom:12px;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-color); color:var(--text-secondary); text-align:left;">
                <th style="padding:6px;">Section</th>
                <th style="padding:6px;">Time Limit</th>
                <th style="padding:6px;">Cutoff Score</th>
                <th style="padding:6px;">Navigation Rule</th>
              </tr>
            </thead>
            <tbody>
              ${sortedSections.map(s => `
                <tr style="border-bottom:1px solid var(--border-color);">
                  <td style="padding:8px 6px;"><strong>${s.title}</strong></td>
                  <td style="padding:8px 6px;">${s.duration_minutes || test.duration_minutes} Mins</td>
                  <td style="padding:8px 6px;">${s.cutoff_score > 0 ? `${s.cutoff_score} Marks` : 'None'}</td>
                  <td style="padding:8px 6px;">${s.allow_switching ? 'Free Navigation' : '🔒 Locked (Must complete in order)'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <p style="font-size:0.85rem; color:var(--text-secondary);">
            <strong>Marking Scheme:</strong> +${sortedSections[0]?.marks_correct || 1.0} for correct, -${sortedSections[0]?.marks_incorrect || 0.25} for wrong.
          </p>
        </div>

        <h3 style="margin-bottom:10px;">Question Palette Symbols:</h3>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:24px; font-size:0.9rem;">
          <div class="legend-item"><div class="legend-box p-not-visited"></div> You have not visited the question yet.</div>
          <div class="legend-item"><div class="legend-box p-unanswered"></div> You have not answered the question.</div>
          <div class="legend-item"><div class="legend-box p-answered"></div> You have answered the question.</div>
          <div class="legend-item"><div class="legend-box p-marked"></div> Marked for review (unanswered).</div>
          <div class="legend-item"><div class="legend-box p-marked-answered"></div> Answered & Marked for review.</div>
        </div>

        <button class="btn-primary" style="width:100%; padding:14px; font-size:1.1rem;" onclick="window.location.hash='#/exam/${test.id}'">
          ${savedState ? 'Resume In-Progress Exam' : 'I am ready to begin Section 1'}
        </button>
      </div>
    `;
  },

  async startTest(container, testId) {
    container.innerHTML = `<div class="card"><p>Preparing question paper and sections...</p></div>`;

    const { data: test, error: tErr } = await window.sb
      .from('tests')
      .select('*, sections(*)')
      .eq('id', testId)
      .single();

    const { data: questions, error: qErr } = await window.sb
      .from('questions')
      .select('*, question_options(*)')
      .eq('test_id', testId)
      .order('order_index', { ascending: true });

    if (tErr || qErr || !questions || questions.length === 0) {
      container.innerHTML = `<div class="card"><p>Failed to load questions for this test.</p></div>`;
      return;
    }

    this.currentTest = test;
    this.sections = (test.sections || []).sort((a, b) => a.order_index - b.order_index);
    if (this.sections.length === 0) {
      this.sections = [{ id: 'default', title: 'General', duration_minutes: test.duration_minutes, allow_switching: true, auto_advance: true }];
    }

    questions.forEach(q => {
      if (q.question_text && q.question_text.startsWith('[SHARED_GROUP:')) {
        const closeIdx = q.question_text.indexOf(']\n');
        if (closeIdx !== -1) {
          const metaStr = q.question_text.substring(14, closeIdx);
          const parts = metaStr.split('|');
          q.group_id = parts[0];
          q.shared_context = parts.slice(1).join('|');
          q.question_text = q.question_text.substring(closeIdx + 2);
        }
      }
    });

    this.questionsBySection = this.sections.map(sec => {
      let secQuestions = questions.filter(q => q.section_id === sec.id);
      if (secQuestions.length === 0 && this.sections.length === 1) secQuestions = [...questions];

      if (test.shuffle_questions) {
        secQuestions = this.shufflePreservingGroups(secQuestions);
      }

      return secQuestions;
    });

    this.allQuestionsFlat = this.questionsBySection.flat();
    this.currentSectionIndex = 0;
    this.currentQuestionIndex = 0;
    this.answers = {};
    this.reviewMarked = {};
    this.visited = {};
    this.sectionTimeRemaining = {};
    this.isPaused = false;

    this.sections.forEach(sec => {
      this.sectionTimeRemaining[sec.id] = (sec.duration_minutes || test.duration_minutes) * 60;
    });

    const storageKey = `cbt_attempt_${testId}_${window.AppState.user.id}`;
    const savedState = localStorage.getItem(storageKey);

    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        this.answers = parsed.answers || {};
        this.reviewMarked = parsed.reviewMarked || {};
        this.visited = parsed.visited || {};
        this.currentSectionIndex = parsed.currentSectionIndex || 0;
        this.currentQuestionIndex = parsed.currentQuestionIndex || 0;
        this.sectionTimeRemaining = parsed.sectionTimeRemaining || this.sectionTimeRemaining;
        this.attemptId = parsed.attemptId;
      } catch (e) {
        await this.initNewAttempt(test);
      }
    } else {
      await this.initNewAttempt(test);
    }

    window.onbeforeunload = () => "Your exam answers might not be submitted if you leave now.";

    this.renderExamInterface(container);
    this.startSectionTimer();
  },

  shufflePreservingGroups(questions) {
    const blocks = [];
    let currentGroup = null;
    let currentGroupItems = [];

    questions.forEach(q => {
      if (q.group_id) {
        if (currentGroup === q.group_id) {
          currentGroupItems.push(q);
        } else {
          if (currentGroupItems.length > 0) blocks.push(currentGroupItems);
          currentGroup = q.group_id;
          currentGroupItems = [q];
        }
      } else {
        if (currentGroupItems.length > 0) {
          blocks.push(currentGroupItems);
          currentGroup = null;
          currentGroupItems = [];
        }
        blocks.push([q]);
      }
    });
    if (currentGroupItems.length > 0) blocks.push(currentGroupItems);

    for (let i = blocks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    }

    return blocks.flat();
  },

  async initNewAttempt(test) {
    const { data: attempt } = await window.sb
      .from('attempts')
      .insert({
        test_id: test.id,
        user_id: window.AppState.user.id,
        started_at: new Date().toISOString()
      })
      .select()
      .single();
    if (attempt) this.attemptId = attempt.id;
  },

  saveLocalProgress() {
    const storageKey = `cbt_attempt_${this.currentTest.id}_${window.AppState.user.id}`;
    localStorage.setItem(storageKey, JSON.stringify({
      answers: this.answers,
      reviewMarked: this.reviewMarked,
      visited: this.visited,
      currentSectionIndex: this.currentSectionIndex,
      currentQuestionIndex: this.currentQuestionIndex,
      sectionTimeRemaining: this.sectionTimeRemaining,
      attemptId: this.attemptId
    }));
  },

  saveForLater() {
    this.saveLocalProgress();
    clearInterval(this.timerInterval);
    window.onbeforeunload = null;

    window.showModal({
      title: 'Progress Saved',
      bodyHtml: `
        <p>Your exam progress, answers, and remaining section time have been saved safely.</p>
        <p style="margin-top:8px; font-size:0.9rem; color:var(--text-secondary);">
          You can resume anytime by returning to <strong>Take Test</strong> and entering key: 
          <strong style="color:var(--primary-accent); font-family:monospace;">${this.currentTest.test_key}</strong>.
        </p>
      `,
      confirmText: 'Exit to Dashboard',
      onConfirm: () => {
        window.location.hash = '#/hub';
      }
    });
  },

  renderExamInterface(container) {
    const activeSec = this.sections[this.currentSectionIndex];
    const isLastSection = this.currentSectionIndex === this.sections.length - 1;

    container.innerHTML = `
      <div class="exam-layout" style="position:relative;">
        <div id="exam-pause-overlay" style="display:none; position:absolute; inset:0; background:rgba(255, 255, 255, 0.96); backdrop-filter:blur(6px); z-index:999; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:20px;">
          <div style="font-size:3.5rem; margin-bottom:12px;">☕</div>
          <h2 style="font-size:1.8rem; margin-bottom:8px;">Exam Paused</h2>
          <p style="color:var(--text-secondary); max-width:440px; margin-bottom:24px;">The timer has stopped and question content is hidden.</p>
          <button class="btn-primary" style="padding:14px 32px; font-size:1.1rem;" onclick="Exam.resumeTest()">
            ▶️ Resume Test
          </button>
        </div>

        <div class="exam-main">
          <div class="exam-header">
            <div>
              <strong style="font-size:1.1rem;">${this.currentTest.title}</strong>
              <div id="section-nav-tabs" style="margin-top:8px; display:flex; gap:8px;"></div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <button class="btn-secondary" style="padding:6px 10px; font-size:0.85rem;" onclick="Exam.pauseTest()">☕ Break</button>
              <button class="btn-outline" style="padding:6px 10px; font-size:0.85rem;" onclick="Exam.saveForLater()">💾 Save for Later</button>
              <div id="exam-timer" class="timer-box">00:00:00</div>
            </div>
          </div>

          <div class="exam-question-area" id="question-render-target"></div>

          <div class="exam-footer">
            <div style="display:flex; gap:8px;">
              <button class="btn-secondary" onclick="Exam.markForReviewAndNext()">Mark for Review & Next</button>
              <button class="btn-outline" onclick="Exam.clearResponse()">Clear Response</button>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn-secondary" onclick="Exam.prevQuestion()">Previous</button>
              <button class="btn-primary" onclick="Exam.saveAndNext()">Save & Next</button>
              ${isLastSection ? `
                <button class="btn-danger" style="margin-left:12px;" onclick="Exam.confirmSubmissionDialog()">Submit Final Exam</button>
              ` : `
                <button class="btn-secondary" style="margin-left:12px; background:var(--accent-soft); border-color:var(--primary-accent); color:var(--primary-accent); font-weight:700;" onclick="Exam.confirmAdvanceSection()">
                  Submit Section & Next ➔
                </button>
              `}
            </div>
          </div>
        </div>

        <div class="exam-sidebar">
          <div style="font-weight:700; font-size:0.95rem; margin-bottom:10px; color:var(--primary-accent);">
            Active: ${activeSec.title}
          </div>
          <div class="palette-legend" id="legend-counts-target"></div>
          <div class="palette-grid" id="palette-target"></div>
        </div>
      </div>
    `;

    this.renderSectionTabs();
    this.renderCurrentQuestion();
    this.renderPalette();
  },

  renderSectionTabs() {
    const tabsContainer = document.getElementById('section-nav-tabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = this.sections.map((sec, idx) => {
      const isActive = idx === this.currentSectionIndex;
      const isPast = idx < this.currentSectionIndex;
      const isFuture = idx > this.currentSectionIndex;
      const canSwitch = sec.allow_switching === true;

      let style = 'padding:4px 10px; border-radius:4px; font-size:0.85rem; font-weight:600; cursor:default;';
      if (isActive) {
        style += 'background:var(--primary-accent); color:#fff;';
      } else if (isPast) {
        style += 'background:#e2e8f0; color:#64748b; text-decoration:line-through;';
      } else if (isFuture && !canSwitch) {
        style += 'background:#f1f5f9; color:#94a3b8; border:1px dashed #cbd5e1;';
      } else {
        style += 'background:#fff; border:1px solid #cbd5e1; color:#0f172a; cursor:pointer;';
      }

      const clickHandler = (canSwitch && !isPast) ? `onclick="Exam.switchSection(${idx})"` : '';
      return `<div style="${style}" ${clickHandler}>${sec.title} ${isPast ? '✓' : ''}</div>`;
    }).join('');
  },

  renderCurrentQuestion() {
    const activeQuestions = this.questionsBySection[this.currentSectionIndex] || [];
    if (activeQuestions.length === 0) return;

    const q = activeQuestions[this.currentQuestionIndex];
    this.visited[q.id] = true;
    const target = document.getElementById('question-render-target');
    const selectedOpt = this.answers[q.id];

    const sharedBanner = q.shared_context ? `
      <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:var(--radius-sm); padding:14px 16px; margin-bottom:16px; line-height:1.6; font-size:0.95rem; color:#0369a1;">
        <strong style="display:block; margin-bottom:4px; font-size:0.88rem; text-transform:uppercase; letter-spacing:0.5px;">📌 Linked Instruction / Passage</strong>
        ${q.shared_context}
      </div>
    ` : '';

    target.innerHTML = `
      <div style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:8px;">
        ${this.sections[this.currentSectionIndex].title} — Question ${this.currentQuestionIndex + 1} of ${activeQuestions.length}
      </div>
      ${sharedBanner}
      <div class="exam-question-text">${q.question_text}</div>
      <div class="options-list">
        ${q.question_options.map(opt => `
          <div class="option-item ${selectedOpt === opt.option_index ? 'selected' : ''}" onclick="Exam.selectOption(${opt.option_index})">
            <div class="option-badge">${String.fromCharCode(65 + opt.option_index)}</div>
            <div>${opt.option_text}</div>
          </div>
        `).join('')}
      </div>
    `;

    this.renderPalette();
  },

  selectOption(optIndex) {
    if (this.isPaused) return;
    const q = this.questionsBySection[this.currentSectionIndex][this.currentQuestionIndex];
    this.answers[q.id] = optIndex;
    this.renderCurrentQuestion();
    this.saveLocalProgress();
  },

  clearResponse() {
    if (this.isPaused) return;
    const q = this.questionsBySection[this.currentSectionIndex][this.currentQuestionIndex];
    delete this.answers[q.id];
    this.renderCurrentQuestion();
    this.saveLocalProgress();
  },

  saveAndNext() {
    if (this.isPaused) return;
    this.saveLocalProgress();
    const activeQuestions = this.questionsBySection[this.currentSectionIndex];
    if (this.currentQuestionIndex < activeQuestions.length - 1) {
      this.currentQuestionIndex++;
      this.renderCurrentQuestion();
    }
  },

  prevQuestion() {
    if (this.isPaused) return;
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      this.renderCurrentQuestion();
    }
  },

  markForReviewAndNext() {
    if (this.isPaused) return;
    const q = this.questionsBySection[this.currentSectionIndex][this.currentQuestionIndex];
    this.reviewMarked[q.id] = true;
    this.saveLocalProgress();
    const activeQuestions = this.questionsBySection[this.currentSectionIndex];
    if (this.currentQuestionIndex < activeQuestions.length - 1) {
      this.currentQuestionIndex++;
      this.renderCurrentQuestion();
    } else {
      this.renderPalette();
    }
  },

  jumpToQuestion(idx) {
    if (this.isPaused) return;
    this.currentQuestionIndex = idx;
    this.renderCurrentQuestion();
  },

  switchSection(newSecIndex) {
    const targetSec = this.sections[newSecIndex];
    if (!targetSec.allow_switching && newSecIndex !== this.currentSectionIndex) {
      window.showToast('Section switching is locked for this exam.', 'warning');
      return;
    }
    this.currentSectionIndex = newSecIndex;
    this.currentQuestionIndex = 0;
    this.renderExamInterface(document.getElementById('app-root'));
    this.startSectionTimer();
  },

  confirmAdvanceSection() {
    const currentSec = this.sections[this.currentSectionIndex];
    if (currentSec.auto_advance === false) {
      window.showToast('Early section submission is disabled. You must wait for the section timer to finish.', 'warning');
      return;
    }

    const nextSec = this.sections[this.currentSectionIndex + 1];
    window.showModal({
      title: `Submit ${currentSec.title}?`,
      bodyHtml: `
        <p>Are you sure you want to finish <strong>${currentSec.title}</strong>?</p>
        <p style="margin-top:8px; color:var(--danger); font-size:0.9rem;">
          ⚠️ <strong>Notice:</strong> Once you advance to ${nextSec.title}, you CANNOT return to ${currentSec.title}.
        </p>
      `,
      confirmText: `Yes, Proceed to ${nextSec.title}`,
      onConfirm: () => {
        this.advanceToNextSection();
      }
    });
  },

  advanceToNextSection() {
    if (this.currentSectionIndex < this.sections.length - 1) {
      this.currentSectionIndex++;
      this.currentQuestionIndex = 0;
      this.renderExamInterface(document.getElementById('app-root'));
      this.startSectionTimer();
      window.showToast(`Started ${this.sections[this.currentSectionIndex].title}`, 'info');
    } else {
      this.submitExam();
    }
  },

  renderPalette() {
    const paletteTarget = document.getElementById('palette-target');
    const legendTarget = document.getElementById('legend-counts-target');
    if (!paletteTarget) return;

    const activeQuestions = this.questionsBySection[this.currentSectionIndex] || [];
    let counts = { answered: 0, unanswered: 0, notVisited: 0, marked: 0, markedAnswered: 0 };

    paletteTarget.innerHTML = activeQuestions.map((q, idx) => {
      let stateClass = 'p-not-visited';
      const isAnswered = this.answers[q.id] !== undefined;
      const isMarked = this.reviewMarked[q.id] === true;
      const isVisited = this.visited[q.id] === true;

      if (isMarked && isAnswered) {
        stateClass = 'p-marked-answered';
        counts.markedAnswered++;
      } else if (isMarked) {
        stateClass = 'p-marked';
        counts.marked++;
      } else if (isAnswered) {
        stateClass = 'p-answered';
        counts.answered++;
      } else if (isVisited) {
        stateClass = 'p-unanswered';
        counts.unanswered++;
      } else {
        stateClass = 'p-not-visited';
        counts.notVisited++;
      }

      const isCurrent = idx === this.currentQuestionIndex;

      return `
        <button class="palette-btn ${stateClass} ${isCurrent ? 'current' : ''}" onclick="Exam.jumpToQuestion(${idx})">
          ${idx + 1}
        </button>
      `;
    }).join('');

    if (legendTarget) {
      legendTarget.innerHTML = `
        <div class="legend-item"><div class="legend-box p-answered"></div> Answered (${counts.answered})</div>
        <div class="legend-item"><div class="legend-box p-unanswered"></div> Not Answered (${counts.unanswered})</div>
        <div class="legend-item"><div class="legend-box p-not-visited"></div> Not Visited (${counts.notVisited})</div>
        <div class="legend-item"><div class="legend-box p-marked"></div> Marked (${counts.marked})</div>
        <div class="legend-item" style="grid-column: span 2;"><div class="legend-box p-marked-answered"></div> Answered & Marked (${counts.markedAnswered})</div>
      `;
    }
  },

  startSectionTimer() {
    clearInterval(this.timerInterval);
    const activeSec = this.sections[this.currentSectionIndex];
    const timerElem = document.getElementById('exam-timer');

    this.timerInterval = setInterval(() => {
      if (this.isPaused) return;

      this.sectionTimeRemaining[activeSec.id]--;
      this.saveLocalProgress();

      const remaining = this.sectionTimeRemaining[activeSec.id];

      if (remaining <= 0) {
        clearInterval(this.timerInterval);
        if (this.currentSectionIndex < this.sections.length - 1) {
          window.showModal({
            title: `${activeSec.title} Time Expired`,
            bodyHtml: `<p>Time allocated for <strong>${activeSec.title}</strong> has ended. Advancing to the next section now.</p>`,
            confirmText: 'Continue',
            onConfirm: () => this.advanceToNextSection()
          });
        } else {
          window.showToast('Exam time expired! Submitting your test...', 'warning');
          this.submitExam();
        }
        return;
      }

      const hrs = Math.floor(remaining / 3600);
      const mins = Math.floor((remaining % 3600) / 60);
      const secs = remaining % 60;

      if (timerElem) {
        timerElem.innerText = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        if (remaining < 300) {
          timerElem.classList.add('timer-warning');
        } else {
          timerElem.classList.remove('timer-warning');
        }
      }
    }, 1000);
  },

  pauseTest() {
    this.isPaused = true;
    clearInterval(this.timerInterval);
    this.saveLocalProgress();
    const overlay = document.getElementById('exam-pause-overlay');
    if (overlay) overlay.style.display = 'flex';
  },

  resumeTest() {
    this.isPaused = false;
    const overlay = document.getElementById('exam-pause-overlay');
    if (overlay) overlay.style.display = 'none';
    this.startSectionTimer();
  },

  confirmSubmissionDialog() {
    let answered = 0;
    let marked = 0;
    this.allQuestionsFlat.forEach(q => {
      if (this.answers[q.id] !== undefined) answered++;
      if (this.reviewMarked[q.id]) marked++;
    });
    const unanswered = this.allQuestionsFlat.length - answered;

    window.showModal({
      title: 'Submit Final Exam',
      bodyHtml: `
        <p style="margin-bottom:12px;">Are you sure you want to complete and submit your final examination?</p>
        <div style="background:var(--bg-muted); border:1px solid var(--border-color); padding:12px; border-radius:var(--radius-sm); font-size:0.95rem; line-height:1.7;">
          <p>📝 <strong>Total Questions:</strong> ${this.allQuestionsFlat.length}</p>
          <p>✅ <strong>Answered:</strong> ${answered}</p>
          <p>❌ <strong>Unanswered:</strong> ${unanswered}</p>
          <p>🔖 <strong>Marked for Review:</strong> ${marked}</p>
        </div>
      `,
      confirmText: 'Yes, Submit Final Exam',
      onConfirm: () => this.submitExam()
    });
  },

  async submitExam() {
    clearInterval(this.timerInterval);
    window.onbeforeunload = null;
    window.showLoading('Evaluating Exam...', 'Grading sections, calculating sectional cutoffs, and finalizing result...');

    const storageKey = `cbt_attempt_${this.currentTest.id}_${window.AppState.user.id}`;
    localStorage.removeItem(storageKey);

    let totalScore = 0;
    let maxScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;
    const answerInserts = [];

    const secObjMap = {};
    this.sections.forEach(s => { secObjMap[s.id] = s; });

    this.allQuestionsFlat.forEach(q => {
      const sec = secObjMap[q.section_id] || this.sections[0] || { marks_correct: 1.0, marks_incorrect: 0.25, marks_unattempted: 0 };
      maxScore += Number(sec.marks_correct);
      const selected = this.answers[q.id];

      if (selected === undefined || selected === null) {
        unattemptedCount++;
        totalScore += Number(sec.marks_unattempted);
        answerInserts.push({
          attempt_id: this.attemptId,
          question_id: q.id,
          selected_option_index: null,
          is_correct: false,
          marks_awarded: Number(sec.marks_unattempted)
        });
      } else if (selected === q.correct_option_index) {
        correctCount++;
        totalScore += Number(sec.marks_correct);
        answerInserts.push({
          attempt_id: this.attemptId,
          question_id: q.id,
          selected_option_index: selected,
          is_correct: true,
          marks_awarded: Number(sec.marks_correct)
        });
      } else {
        incorrectCount++;
        totalScore -= Number(sec.marks_incorrect);
        answerInserts.push({
          attempt_id: this.attemptId,
          question_id: q.id,
          selected_option_index: selected,
          is_correct: false,
          marks_awarded: -Number(sec.marks_incorrect)
        });
      }
    });

    const attemptedCount = correctCount + incorrectCount;
    const accuracy = attemptedCount > 0 ? (correctCount / attemptedCount) * 100 : 0;
    const isOverallPassed = this.currentTest.passing_score_type === 'PERCENT'
      ? (totalScore / (maxScore || 1)) * 100 >= this.currentTest.passing_score
      : totalScore >= this.currentTest.passing_score;

    try {
      await window.sb.from('attempt_answers').insert(answerInserts);

      await window.sb
        .from('attempts')
        .update({
          submitted_at: new Date().toISOString(),
          total_score: totalScore,
          max_score: maxScore,
          correct_count: correctCount,
          incorrect_count: incorrectCount,
          unattempted_count: unattemptedCount,
          accuracy_percentage: accuracy,
          time_taken_seconds: this.currentTest.duration_minutes * 60,
          is_passed: isOverallPassed
        })
        .eq('id', this.attemptId);

      window.hideLoading();

      document.getElementById('app-root').innerHTML = `
        <div class="card" style="max-width:520px; margin:60px auto; text-align:center;">
          <div style="font-size:3rem; margin-bottom:12px;">✅</div>
          <h2>Exam Submitted Successfully</h2>
          <p style="color:var(--text-secondary); margin-bottom:24px;">All sections have been evaluated.</p>
          <a href="#/results/${this.attemptId}"><button class="btn-primary" style="width:100%; padding:12px; font-size:1.1rem;">View Full Scorecard</button></a>
        </div>
      `;
    } catch (err) {
      window.hideLoading();
      window.showToast('Submission error: ' + err.message, 'error');
    }
  }
};
