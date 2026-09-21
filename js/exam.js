window.Exam = {
  currentTest: null,
  questions: [],
  sections: [],
  answers: {},
  reviewMarked: {},
  visited: {},
  currentIndex: 0,
  timerInterval: null,
  secondsRemaining: 0,
  attemptId: null,
  isPaused: false,

  renderKeyPrompt(container) {
    container.innerHTML = `
      <div class="card" style="max-width: 460px; margin: 40px auto; text-align:center;">
        <h2 style="margin-bottom: 12px;">Enter Test Key</h2>
        <p style="color:var(--text-secondary); margin-bottom: 24px; font-size:0.95rem;">
          Enter the access key provided by your host to launch the test.
        </p>
        <form id="key-form">
          <input type="text" id="test-key-input" placeholder="e.g. ABC-4821" required style="font-family:monospace; font-size:1.3rem; text-align:center; text-transform:uppercase; margin-bottom:16px;" />
          <button type="submit" class="btn-primary" style="width:100%; padding:10px;">Proceed to Instructions</button>
        </form>
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

    const qCount = test.questions && test.questions[0] ? test.questions[0].count : 0;
    const defaultSec = test.sections && test.sections[0] ? test.sections[0] : { marks_correct: 1, marks_incorrect: 0.25 };

    const storageKey = `cbt_attempt_${test.id}_${window.AppState.user.id}`;
    const savedState = localStorage.getItem(storageKey);
    let resumeNotice = '';

    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        const remMins = Math.floor(parsed.secondsRemaining / 60);
        resumeNotice = `
          <div style="background:#e8f0fe; border:1px solid #1a73e8; border-radius:var(--radius-sm); padding:12px; margin-bottom:20px; text-align:left;">
            <strong>📌 Resume Saved Progress Available</strong>
            <p style="font-size:0.9rem; margin-top:4px;">You have an active in-progress attempt for this exam with ~${remMins} minutes remaining.</p>
          </div>
        `;
      } catch (e) {}
    }

    container.innerHTML = `
      <div class="card" style="max-width: 780px; margin: 20px auto;">
        <h2>${test.title}</h2>
        <p style="color:var(--text-secondary); margin-bottom: 20px;">Please read the following instructions carefully before starting the exam.</p>

        ${resumeNotice}

        <div style="background:var(--bg-muted); padding:16px; border-radius:var(--radius-md); margin-bottom:20px;">
          <p><strong>Duration:</strong> ${test.duration_minutes} minutes</p>
          <p><strong>Total Questions:</strong> ${qCount}</p>
          <p><strong>Marking Scheme:</strong> +${defaultSec.marks_correct} for correct, -${defaultSec.marks_incorrect} for incorrect</p>
          <p><strong>Passing Criteria:</strong> ${test.passing_score} ${test.passing_score_type === 'PERCENT' ? '%' : 'Marks'}</p>
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
          ${savedState ? 'Resume In-Progress Exam' : 'I am ready to begin'}
        </button>
      </div>
    `;
  },

  async startTest(container, testId) {
    container.innerHTML = `<div class="card"><p>Preparing question paper...</p></div>`;

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
    this.sections = test.sections || [];
    this.questions = questions;
    this.currentIndex = 0;
    this.answers = {};
    this.reviewMarked = {};
    this.visited = {};
    this.isPaused = false;

    const storageKey = `cbt_attempt_${testId}_${window.AppState.user.id}`;
    const savedState = localStorage.getItem(storageKey);

    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        this.answers = parsed.answers || {};
        this.reviewMarked = parsed.reviewMarked || {};
        this.visited = parsed.visited || {};
        this.secondsRemaining = parsed.secondsRemaining;
        this.attemptId = parsed.attemptId;
      } catch (e) {
        await this.initNewAttempt(test);
      }
    } else {
      await this.initNewAttempt(test);
    }

    window.onbeforeunload = () => "Your exam answers might not be submitted if you leave now.";

    this.renderExamInterface(container);
    this.startTimer();
  },

  async initNewAttempt(test) {
    this.secondsRemaining = test.duration_minutes * 60;
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
      secondsRemaining: this.secondsRemaining,
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
        <p>Your current answers and exact remaining time are saved safely.</p>
        <p style="margin-top:8px; font-size:0.9rem; color:var(--text-secondary);">
          You can resume this test anytime by navigating to <strong>Take Test</strong> and entering key: 
          <strong style="color:var(--primary-accent); font-family:monospace;">${this.currentTest.test_key}</strong>.
        </p>
      `,
      confirmText: 'Exit to Dashboard',
      onConfirm: () => {
        window.location.hash = '#/take-key';
      }
    });
  },

  renderExamInterface(container) {
    container.innerHTML = `
      <div class="exam-layout" style="position:relative;">
        <div id="exam-pause-overlay" style="display:none; position:absolute; inset:0; background:rgba(255, 255, 255, 0.96); backdrop-filter:blur(6px); z-index:999; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:20px;">
          <div style="font-size:3.5rem; margin-bottom:12px;">☕</div>
          <h2 style="font-size:1.8rem; margin-bottom:8px;">Exam Paused</h2>
          <p style="color:var(--text-secondary); max-width:440px; margin-bottom:24px; font-size:1rem; line-height:1.6;">
            You are currently on a break. The countdown timer has stopped and question content is hidden.
          </p>
          <div style="background:var(--bg-muted); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:12px 24px; margin-bottom:24px; font-size:1.1rem;">
            ⏱️ Time Left: <strong id="overlay-timer-display" style="font-family:monospace; color:var(--primary-accent);">00:00:00</strong>
          </div>
          <button class="btn-primary" style="padding:14px 32px; font-size:1.1rem; box-shadow:0 4px 12px rgba(0,0,0,0.15);" onclick="Exam.resumeTest()">
            ▶️ Resume Test
          </button>
        </div>

        <div class="exam-main">
          <div class="exam-header">
            <div>
              <strong style="font-size:1.1rem;">${this.currentTest.title}</strong>
              <div id="section-bar" style="margin-top:6px; display:flex; gap:8px;"></div>
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
              <button class="btn-danger" style="margin-left:12px;" onclick="Exam.confirmSubmissionDialog()">Submit Exam</button>
            </div>
          </div>
        </div>

        <div class="exam-sidebar">
          <div class="palette-legend" id="legend-counts-target"></div>
          <div class="palette-grid" id="palette-target"></div>
        </div>
      </div>
    `;

    this.renderCurrentQuestion();
    this.renderPalette();
  },

  renderCurrentQuestion() {
    const q = this.questions[this.currentIndex];
    this.visited[q.id] = true;
    const target = document.getElementById('question-render-target');
    const selectedOpt = this.answers[q.id];

    target.innerHTML = `
      <div style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:8px;">Question ${this.currentIndex + 1} of ${this.questions.length}</div>
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
    const q = this.questions[this.currentIndex];
    this.answers[q.id] = optIndex;
    this.renderCurrentQuestion();
    this.saveLocalProgress();
  },

  clearResponse() {
    if (this.isPaused) return;
    const q = this.questions[this.currentIndex];
    delete this.answers[q.id];
    this.renderCurrentQuestion();
    this.saveLocalProgress();
  },

  saveAndNext() {
    if (this.isPaused) return;
    this.saveLocalProgress();
    if (this.currentIndex < this.questions.length - 1) {
      this.currentIndex++;
      this.renderCurrentQuestion();
    }
  },

  prevQuestion() {
    if (this.isPaused) return;
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderCurrentQuestion();
    }
  },

  markForReviewAndNext() {
    if (this.isPaused) return;
    const q = this.questions[this.currentIndex];
    this.reviewMarked[q.id] = true;
    this.saveLocalProgress();
    if (this.currentIndex < this.questions.length - 1) {
      this.currentIndex++;
      this.renderCurrentQuestion();
    } else {
      this.renderPalette();
    }
  },

  jumpToQuestion(idx) {
    if (this.isPaused) return;
    this.currentIndex = idx;
    this.renderCurrentQuestion();
  },

  renderPalette() {
    const paletteTarget = document.getElementById('palette-target');
    const legendTarget = document.getElementById('legend-counts-target');
    if (!paletteTarget) return;

    let counts = { answered: 0, unanswered: 0, notVisited: 0, marked: 0, markedAnswered: 0 };

    paletteTarget.innerHTML = this.questions.map((q, idx) => {
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

      const isCurrent = idx === this.currentIndex;

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
        <div class="legend-item"><div class="legend-box p-marked"></div> Marked for Review (${counts.marked})</div>
        <div class="legend-item" style="grid-column: span 2;"><div class="legend-box p-marked-answered"></div> Answered & Marked (${counts.markedAnswered})</div>
      `;
    }
  },

  pauseTest() {
    this.isPaused = true;
    clearInterval(this.timerInterval);
    this.saveLocalProgress();

    const hrs = Math.floor(this.secondsRemaining / 3600);
    const mins = Math.floor((this.secondsRemaining % 3600) / 60);
    const secs = this.secondsRemaining % 60;
    const formatted = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const overlay = document.getElementById('exam-pause-overlay');
    const overlayTimer = document.getElementById('overlay-timer-display');
    if (overlayTimer) overlayTimer.innerText = formatted;
    if (overlay) overlay.style.display = 'flex';
  },

  resumeTest() {
    this.isPaused = false;
    const overlay = document.getElementById('exam-pause-overlay');
    if (overlay) overlay.style.display = 'none';
    this.startTimer();
  },

  startTimer() {
    clearInterval(this.timerInterval);
    const timerElem = document.getElementById('exam-timer');

    this.timerInterval = setInterval(() => {
      if (this.isPaused) return;

      this.secondsRemaining--;
      this.saveLocalProgress();

      if (this.secondsRemaining <= 0) {
        clearInterval(this.timerInterval);
        window.showToast('Time expired! Submitting your test...', 'warning');
        this.submitExam();
        return;
      }

      const hrs = Math.floor(this.secondsRemaining / 3600);
      const mins = Math.floor((this.secondsRemaining % 3600) / 60);
      const secs = this.secondsRemaining % 60;

      if (timerElem) {
        timerElem.innerText = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        if (this.secondsRemaining < 300) {
          timerElem.classList.add('timer-warning');
        }
      }
    }, 1000);
  },

  confirmSubmissionDialog() {
    if (this.isPaused) return;

    let answered = 0;
    let marked = 0;
    let visitedCount = 0;

    this.questions.forEach(q => {
      if (this.answers[q.id] !== undefined) answered++;
      if (this.reviewMarked[q.id]) marked++;
      if (this.visited[q.id]) visitedCount++;
    });

    const unanswered = this.questions.length - answered;
    const notVisited = this.questions.length - visitedCount;

    const remHrs = Math.floor(this.secondsRemaining / 3600);
    const remMins = Math.floor((this.secondsRemaining % 3600) / 60);
    const remSecs = this.secondsRemaining % 60;
    const timeString = remHrs > 0 ? `${remHrs}h ${remMins}m ${remSecs}s` : `${remMins}m ${remSecs}s`;

    window.showModal({
      title: 'Submit Exam Confirmation',
      bodyHtml: `
        <p style="margin-bottom:12px;">Are you sure you want to finish and submit your exam?</p>
        <div style="background:var(--bg-muted); border:1px solid var(--border-color); padding:14px; border-radius:var(--radius-sm); font-size:0.95rem; line-height:1.7;">
          <p>⏱️ <strong>Remaining Time:</strong> <span style="font-family:monospace; font-weight:700; color:var(--primary-accent);">${timeString}</span></p>
          <hr style="border:none; border-top:1px solid var(--border-color); margin:8px 0;" />
          <p>📝 <strong>Total Questions:</strong> ${this.questions.length}</p>
          <p>✅ <strong>Answered:</strong> ${answered}</p>
          <p>❌ <strong>Not Answered:</strong> ${unanswered}</p>
          <p>🔘 <strong>Not Visited:</strong> ${notVisited}</p>
          <p>🔖 <strong>Marked for Review:</strong> ${marked}</p>
        </div>
      `,
      confirmText: 'Yes, Submit Final Exam',
      onConfirm: () => {
        this.submitExam();
      }
    });
  },

  async submitExam() {
    clearInterval(this.timerInterval);
    window.onbeforeunload = null;
    window.showLoading('Submitting Responses...', 'Calculating scores and recording your attempt in database...');

    const storageKey = `cbt_attempt_${this.currentTest.id}_${window.AppState.user.id}`;
    localStorage.removeItem(storageKey);

    let totalScore = 0;
    let maxScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    const answerInserts = [];
    const defaultSec = this.sections[0] || { marks_correct: 1.0, marks_incorrect: 0.25, marks_unattempted: 0 };

    this.questions.forEach(q => {
      maxScore += Number(defaultSec.marks_correct);
      const selected = this.answers[q.id];

      if (selected === undefined || selected === null) {
        unattemptedCount++;
        totalScore += Number(defaultSec.marks_unattempted);
        answerInserts.push({
          attempt_id: this.attemptId,
          question_id: q.id,
          selected_option_index: null,
          is_correct: false,
          marks_awarded: Number(defaultSec.marks_unattempted)
        });
      } else if (selected === q.correct_option_index) {
        correctCount++;
        totalScore += Number(defaultSec.marks_correct);
        answerInserts.push({
          attempt_id: this.attemptId,
          question_id: q.id,
          selected_option_index: selected,
          is_correct: true,
          marks_awarded: Number(defaultSec.marks_correct)
        });
      } else {
        incorrectCount++;
        totalScore -= Number(defaultSec.marks_incorrect);
        answerInserts.push({
          attempt_id: this.attemptId,
          question_id: q.id,
          selected_option_index: selected,
          is_correct: false,
          marks_awarded: -Number(defaultSec.marks_incorrect)
        });
      }
    });

    const attemptedCount = correctCount + incorrectCount;
    const accuracy = attemptedCount > 0 ? (correctCount / attemptedCount) * 100 : 0;
    const isPassed = this.currentTest.passing_score_type === 'PERCENT'
      ? (totalScore / (maxScore || 1)) * 100 >= this.currentTest.passing_score
      : totalScore >= this.currentTest.passing_score;

    const timeSpent = (this.currentTest.duration_minutes * 60) - this.secondsRemaining;

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
          time_taken_seconds: timeSpent,
          is_passed: isPassed
        })
        .eq('id', this.attemptId);

      window.hideLoading();

      document.getElementById('app-root').innerHTML = `
        <div class="card" style="max-width:520px; margin:60px auto; text-align:center;">
          <div style="font-size:3rem; margin-bottom:12px;">✅</div>
          <h2>Test Submitted Successfully</h2>
          <p style="color:var(--text-secondary); margin-bottom:24px;">Your responses have been recorded and evaluated.</p>
          <a href="#/results/${this.attemptId}"><button class="btn-primary" style="width:100%; padding:12px; font-size:1.1rem;">Show Results</button></a>
        </div>
      `;
    } catch (err) {
      window.hideLoading();
      window.showToast('Submission error: ' + err.message, 'error');
    }
  }
};
