window.Results = {
  // 1. Result Scorecard
  async renderResults(container, attemptId) {
    container.innerHTML = `<div class="card"><p>Loading evaluation results...</p></div>`;

    const { data: attempt, error } = await window.sb
      .from('attempts')
      .select('*, tests(*)')
      .eq('id', attemptId)
      .single();

    if (error || !attempt) {
      container.innerHTML = `<div class="card"><p>Error loading attempt results.</p></div>`;
      return;
    }

    const mins = Math.floor(attempt.time_taken_seconds / 60);
    const secs = attempt.time_taken_seconds % 60;

    container.innerHTML = `
      <div style="max-width: 800px; margin: 20px auto;">
        <div class="card" style="text-align:center;">
          <h2 style="margin-bottom:4px;">${attempt.tests.title}</h2>
          <p style="color:var(--text-secondary); margin-bottom:20px;">Submitted on ${new Date(attempt.submitted_at).toLocaleString()}</p>

          <div style="display:inline-block; padding:8px 24px; border-radius:999px; font-weight:700; font-size:1.2rem; margin-bottom:24px; background:${attempt.is_passed ? 'var(--success-soft)' : 'var(--danger-soft)'}; color:${attempt.is_passed ? 'var(--success)' : 'var(--danger)'};">
            ${attempt.is_passed ? 'PASSED' : 'FAILED'}
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:14px; margin-bottom:28px;">
            <div style="background:var(--bg-muted); padding:16px; border-radius:var(--radius-md);">
              <div style="font-size:0.85rem; color:var(--text-secondary);">Score Obtained</div>
              <div style="font-size:1.6rem; font-weight:700;">${attempt.total_score} <span style="font-size:0.9rem; font-weight:400; color:var(--text-secondary);">/ ${attempt.max_score}</span></div>
            </div>
            <div style="background:var(--bg-muted); padding:16px; border-radius:var(--radius-md);">
              <div style="font-size:0.85rem; color:var(--text-secondary);">Accuracy</div>
              <div style="font-size:1.6rem; font-weight:700;">${Number(attempt.accuracy_percentage).toFixed(1)}%</div>
            </div>
            <div style="background:var(--bg-muted); padding:16px; border-radius:var(--radius-md);">
              <div style="font-size:0.85rem; color:var(--text-secondary);">Time Taken</div>
              <div style="font-size:1.6rem; font-weight:700;">${mins}m ${secs}s</div>
            </div>
            <div style="background:var(--bg-muted); padding:16px; border-radius:var(--radius-md);">
              <div style="font-size:0.85rem; color:var(--text-secondary);">Correct / Wrong</div>
              <div style="font-size:1.6rem; font-weight:700;"><span style="color:var(--success);">${attempt.correct_count}</span> / <span style="color:var(--danger);">${attempt.incorrect_count}</span></div>
            </div>
          </div>

          <div style="display:flex; justify-content:center; gap:12px;">
            <a href="#/solutions/${attempt.id}"><button class="btn-primary" style="padding:10px 24px;">View Question Solutions</button></a>
            <a href="#/take-key"><button class="btn-secondary" style="padding:10px 24px;">Take Another Test</button></a>
          </div>
        </div>
      </div>
    `;
  },

  // 2. Solutions & Detailed Question Review
  async renderSolutions(container, attemptId) {
    container.innerHTML = `<div class="card"><p>Loading solutions and answers...</p></div>`;

    const [attRes, ansRes] = await Promise.all([
      window.sb.from('attempts').select('*, tests(*)').eq('id', attemptId).single(),
      window.sb.from('attempt_answers').select('*, questions(*, question_options(*))').eq('attempt_id', attemptId)
    ]);

    const attempt = attRes.data;
    const answers = ansRes.data || [];

    if (!attempt || answers.length === 0) {
      container.innerHTML = `<div class="card"><p>No solution data found for this attempt.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div style="max-width: 900px; margin: 0 auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
          <div>
            <h2>Exam Solutions & Explanations</h2>
            <p style="color:var(--text-secondary);">${attempt.tests.title}</p>
          </div>
          <div style="display:flex; gap:8px;">
            <select id="sol-filter" style="width:auto;" onchange="Results.filterSolutions(this.value)">
              <option value="ALL">Show All Questions</option>
              <option value="WRONG">Only Incorrect Questions</option>
              <option value="UNATTEMPTED">Only Unattempted</option>
            </select>
            <a href="#/results/${attemptId}"><button class="btn-secondary">Back to Score</button></a>
          </div>
        </div>

        <div id="solutions-list">
          ${this.buildSolutionsHtml(answers)}
        </div>
      </div>
    `;

    this._cachedAnswers = answers;
  },

  filterSolutions(filter) {
    const list = document.getElementById('solutions-list');
    let filtered = this._cachedAnswers;

    if (filter === 'WRONG') {
      filtered = this._cachedAnswers.filter(a => a.selected_option_index !== null && !a.is_correct);
    } else if (filter === 'UNATTEMPTED') {
      filtered = this._cachedAnswers.filter(a => a.selected_option_index === null);
    }

    list.innerHTML = this.buildSolutionsHtml(filtered);
  },

  buildSolutionsHtml(answers) {
    if (answers.length === 0) {
      return `<div class="card"><p style="color:var(--text-secondary);">No questions match the selected filter.</p></div>`;
    }

    return answers.map((ans, idx) => {
      const q = ans.questions;
      const isUnatt = ans.selected_option_index === null;
      let cardStatus = 'status-unattempted';
      let marksBadge = `<span style="color:var(--text-secondary); font-weight:700;">0 marks</span>`;

      if (!isUnatt) {
        if (ans.is_correct) {
          cardStatus = 'status-correct';
          marksBadge = `<span style="color:var(--success); font-weight:700;">+${ans.marks_awarded}</span>`;
        } else {
          cardStatus = 'status-incorrect';
          marksBadge = `<span style="color:var(--danger); font-weight:700;">${ans.marks_awarded}</span>`;
        }
      }

      return `
        <div class="card review-card ${cardStatus}" style="margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
            <span style="font-weight:700;">Question #${idx + 1}</span>
            <div>${marksBadge}</div>
          </div>

          <div style="font-size:1.1rem; font-weight:600; margin-bottom:18px;">${q.question_text}</div>

          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
            ${q.question_options.map(opt => {
              const isCorrectOpt = opt.option_index === q.correct_option_index;
              const isUserChoice = opt.option_index === ans.selected_option_index;

              let style = 'padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;';
              
              if (isCorrectOpt) {
                style += ' background:var(--success-soft); border-color:var(--success); font-weight:600;';
              } else if (isUserChoice && !ans.is_correct) {
                style += ' background:var(--danger-soft); border-color:var(--danger);';
              }

              return `
                <div style="${style}">
                  <div>
                    <strong>${String.fromCharCode(65 + opt.option_index)}.</strong>${opt.option_text}
                  </div>
                  <div>
                    ${isCorrectOpt ? '<span style="color:var(--success); font-size:0.85rem; font-weight:700;">✓ Correct Option</span>' : ''}
                    ${isUserChoice && !isCorrectOpt ? '<span style="color:var(--danger); font-size:0.85rem; font-weight:700;">✗ Your Choice</span>' : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Answer & Explanation shown below question -->
          <div style="background:var(--bg-muted); padding:14px; border-radius:var(--radius-sm); margin-top:12px; font-size:0.95rem;">
            <p style="margin-bottom:4px;"><strong>Correct Answer:</strong> Option ${String.fromCharCode(65 + q.correct_option_index)}</p>
            <p><strong>Solution / Explanation:</strong> ${q.explanation || 'No detailed explanation provided for this question.'}</p>
          </div>
        </div>
      `;
    }).join('');
  },

  // 3. Candidate's History View
  async renderUserHistory(container) {
    container.innerHTML = `<div class="card"><p>Loading attempt history...</p></div>`;

    const { data: attempts, error } = await window.sb
      .from('attempts')
      .select('*, tests(title)')
      .eq('user_id', window.AppState.user.id)
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false });

    if (error) {
      container.innerHTML = `<div class="card"><p>Error: ${error.message}</p></div>`;
      return;
    }

    if (!attempts || attempts.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:40px;">
          <h3>No Test Attempts Yet</h3>
          <p style="color:var(--text-secondary); margin:12px 0;">Enter a test key provided by your host to attempt an exam.</p>
          <a href="#/take-key"><button class="btn-primary">Take a Test</button></a>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="max-width:900px; margin:0 auto;">
        <h2>My Attempt History</h2>
        <div class="card" style="margin-top:20px; overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.95rem;">
            <thead>
              <tr style="border-bottom:2px solid var(--border-color); color:var(--text-secondary);">
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
                  <td style="padding:10px; font-weight:500;">${a.tests ? a.tests.title : 'Test'}</td>
                  <td style="padding:10px; font-weight:600;">${a.total_score} /${a.max_score}</td>
                  <td style="padding:10px;">
                    <span style="font-weight:700; color:${a.is_passed ? 'var(--success)' : 'var(--danger)'};">
                      ${a.is_passed ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                  <td style="padding:10px; color:var(--text-secondary);">${new Date(a.submitted_at).toLocaleDateString()}</td>
                  <td style="padding:10px; text-align:right;">
                    <a href="#/results/${a.id}"><button class="btn-secondary" style="padding:4px 8px; font-size:0.8rem;">Scorecard</button></a>
                    <a href="#/solutions/${a.id}"><button class="btn-primary" style="padding:4px 8px; font-size:0.8rem;">Solutions</button></a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
};