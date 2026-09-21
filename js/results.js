window.Results = {
  // 1. Candidate's Personal History
  async renderMyHistory(container) {
    container.innerHTML = `
      <div class="card" style="text-align:center; padding:30px;">
        <div class="spinner" style="margin:0 auto 12px auto; width:30px; height:30px; border-width:3px;"></div>
        <p style="color:var(--text-secondary);">Loading your test history...</p>
      </div>
    `;

    try {
      const { data: attempts, error } = await window.sb
        .from('attempts')
        .select('id, test_id, started_at, submitted_at, total_score, max_score, correct_count, incorrect_count, unattempted_count, accuracy_percentage, is_passed, tests(title, test_key)')
        .eq('user_id', window.AppState.user.id)
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      if (!attempts || attempts.length === 0) {
        container.innerHTML = `
          <div class="card" style="text-align:center; padding:40px;">
            <div style="font-size:3rem; margin-bottom:12px;">📊</div>
            <h3>No Exam Attempts Yet</h3>
            <p style="color:var(--text-secondary); margin:10px 0 20px 0;">You have not completed any tests yet.</p>
            <a href="#/take-key"><button class="btn-primary">Take a Practice Test</button></a>
          </div>
        `;
        return;
      }

      const rows = attempts.map(a => {
        const testTitle = a.tests ? a.tests.title : 'Practice Exam';
        const testKey = a.tests ? a.tests.test_key : '—';
        const dateStr = a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—';
        const passBadge = a.is_passed
          ? `<span style="background:#e6f4ea; color:#137333; font-weight:700; padding:2px 8px; border-radius:4px; font-size:0.8rem;">PASS</span>`
          : `<span style="background:#fce8e6; color:#c5221f; font-weight:700; padding:2px 8px; border-radius:4px; font-size:0.8rem;">FAIL</span>`;

        return `
          <tr style="border-bottom:1px solid var(--border-color);">
            <td style="padding:12px 10px;">
              <strong>${testTitle}</strong>
              <div style="font-size:0.8rem; color:var(--text-secondary); font-family:monospace;">Key: ${testKey}</div>
            </td>
            <td style="padding:12px 10px; font-weight:600;">${a.total_score} / ${a.max_score}</td>
            <td style="padding:12px 10px;">${(a.accuracy_percentage || 0).toFixed(1)}%</td>
            <td style="padding:12px 10px;">${passBadge}</td>
            <td style="padding:12px 10px; color:var(--text-secondary); font-size:0.85rem;">${dateStr}</td>
            <td style="padding:12px 10px; text-align:right;">
              <a href="#/results/${a.id}"><button class="btn-secondary" style="padding:4px 10px; font-size:0.8rem;">View Scorecard</button></a>
            </td>
          </tr>
        `;
      }).join('');

      container.innerHTML = `
        <div style="max-width:960px; margin:0 auto;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h2>My Attempt History</h2>
            <a href="#/take-key"><button class="btn-primary">+ Take New Test</button></a>
          </div>
          <div class="card" style="padding:0; overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.92rem;">
              <thead>
                <tr style="background:var(--bg-muted); border-bottom:2px solid var(--border-color); color:var(--text-secondary);">
                  <th style="padding:10px;">Exam Name</th>
                  <th style="padding:10px;">Score</th>
                  <th style="padding:10px;">Accuracy</th>
                  <th style="padding:10px;">Status</th>
                  <th style="padding:10px;">Date & Time</th>
                  <th style="padding:10px; text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:30px;">
          <p style="color:var(--danger);">Error loading history: ${err.message}</p>
        </div>
      `;
    }
  },

  // 2. Scorecard View
  async renderResult(container, attemptId) {
    container.innerHTML = `
      <div class="card" style="text-align:center; padding:30px;">
        <div class="spinner" style="margin:0 auto 12px auto; width:30px; height:30px; border-width:3px;"></div>
        <p style="color:var(--text-secondary);">Evaluating results...</p>
      </div>
    `;

    try {
      const { data: attempt, error: aErr } = await window.sb
        .from('attempts')
        .select('*, tests(*)')
        .eq('id', attemptId)
        .single();

      if (aErr || !attempt) throw new Error('Attempt record not found.');

      const { data: answers, error: qErr } = await window.sb
        .from('attempt_answers')
        .select('*, questions(*, question_options(*))')
        .eq('attempt_id', attemptId);

      const mins = Math.floor((attempt.time_taken_seconds || 0) / 60);
      const secs = (attempt.time_taken_seconds || 0) % 60;
      const testTitle = attempt.tests ? attempt.tests.title : 'CBT Practice Exam';

      let answersBreakdown = '';
      if (answers && answers.length > 0) {
        answersBreakdown = answers.map((ans, idx) => {
          const q = ans.questions;
          if (!q) return '';
          const userChosenOpt = q.question_options?.find(o => o.option_index === ans.selected_option_index);
          const correctOpt = q.question_options?.find(o => o.option_index === q.correct_option_index);

          const isCorrect = ans.is_correct;
          const isSkipped = ans.selected_option_index === null || ans.selected_option_index === undefined;

          let badge = '';
          if (isSkipped) {
            badge = `<span style="background:#f1f3f4; color:#5f6368; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:600;">UNATTEMPTED (0.0)</span>`;
          } else if (isCorrect) {
            badge = `<span style="background:#e6f4ea; color:#137333; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:600;">CORRECT (+${ans.marks_awarded})</span>`;
          } else {
            badge = `<span style="background:#fce8e6; color:#c5221f; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:600;">INCORRECT (${ans.marks_awarded})</span>`;
          }

          return `
            <div style="border-bottom:1px solid var(--border-color); padding:14px 0;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <strong>Question ${idx + 1}</strong>
                <div>${badge}</div>
              </div>
              <p style="margin-bottom:8px;">${q.question_text}</p>
              <div style="font-size:0.9rem; line-height:1.6; background:var(--bg-muted); padding:10px 12px; border-radius:6px;">
                <p>Your Answer: <strong>${userChosenOpt ? userChosenOpt.option_text : 'None'}</strong></p>
                <p>Correct Answer: <strong style="color:var(--success);">${correctOpt ? correctOpt.option_text : 'N/A'}</strong></p>
                ${q.explanation ? `<p style="margin-top:6px; color:var(--text-secondary);"><em>Solution:</em> ${q.explanation}</p>` : ''}
              </div>
            </div>
          `;
        }).join('');
      }

      container.innerHTML = `
        <div style="max-width:850px; margin:20px auto;">
          <div class="card" style="text-align:center; margin-bottom:20px;">
            <div style="font-size:3rem; margin-bottom:8px;">${attempt.is_passed ? '🏆' : '📝'}</div>
            <h2>${testTitle}</h2>
            <p style="color:var(--text-secondary); margin-bottom:18px;">Exam Scorecard & Breakdown</p>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin-bottom:20px;">
              <div style="background:var(--bg-muted); padding:12px; border-radius:8px;">
                <div style="font-size:0.85rem; color:var(--text-secondary);">Score</div>
                <div style="font-size:1.4rem; font-weight:700; color:var(--primary-accent);">${attempt.total_score} / ${attempt.max_score}</div>
              </div>
              <div style="background:var(--bg-muted); padding:12px; border-radius:8px;">
                <div style="font-size:0.85rem; color:var(--text-secondary);">Accuracy</div>
                <div style="font-size:1.4rem; font-weight:700;">${(attempt.accuracy_percentage || 0).toFixed(1)}%</div>
              </div>
              <div style="background:var(--bg-muted); padding:12px; border-radius:8px;">
                <div style="font-size:0.85rem; color:var(--text-secondary);">Time Taken</div>
                <div style="font-size:1.4rem; font-weight:700;">${mins}m ${secs}s</div>
              </div>
              <div style="background:var(--bg-muted); padding:12px; border-radius:8px;">
                <div style="font-size:0.85rem; color:var(--text-secondary);">Status</div>
                <div style="font-size:1.4rem; font-weight:700; color:${attempt.is_passed ? 'var(--success)' : 'var(--danger)'};">
                  ${attempt.is_passed ? 'PASSED' : 'FAILED'}
                </div>
              </div>
            </div>

            <div style="display:flex; justify-content:center; gap:10px;">
              <a href="#/my-history"><button class="btn-secondary">My Attempts</button></a>
              <a href="#/take-key"><button class="btn-primary">Take Another Test</button></a>
            </div>
          </div>

          <div class="card">
            <h3 style="margin-bottom:14px;">Detailed Question Evaluation</h3>
            ${answersBreakdown}
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="card"><p style="color:var(--danger);">${err.message}</p></div>`;
    }
  }
};
