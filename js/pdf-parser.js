window.PdfParser = {
  async parseFile(file, progressCallback = () => {}) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    let fullLines = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const items = textContent.items.filter(item => item.str && item.str.trim().length > 0);

      // Sort Top-to-Bottom, then Left-to-Right
      items.sort((a, b) => {
        const yA = a.transform[5];
        const yB = b.transform[5];
        if (Math.abs(yA - yB) < 5) {
          return a.transform[4] - b.transform[4];
        }
        return yB - yA;
      });

      let currentLineY = null;
      let lineTokens = [];

      for (const item of items) {
        const y = item.transform[5];
        if (
          item.str.includes('file:///') ||
          item.str.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) ||
          item.str.match(/^\d+\/\d+$/) ||
          item.str.match(/Page\s+\d+\s+of\s+\d+/i) ||
          item.str.match(/Organi[sz]ing Institute/i)
        ) {
          continue;
        }

        if (currentLineY === null || Math.abs(currentLineY - y) < 5) {
          lineTokens.push(item.str);
          currentLineY = y;
        } else {
          if (lineTokens.length > 0) {
            fullLines.push(lineTokens.join(' ').replace(/\s+/g, ' ').trim());
          }
          lineTokens = [item.str];
          currentLineY = y;
        }
      }
      if (lineTokens.length > 0) {
        fullLines.push(lineTokens.join(' ').replace(/\s+/g, ' ').trim());
      }

      progressCallback(Math.round((i / numPages) * 75));
    }

    if (fullLines.length === 0) {
      throw new Error('EMPTY_OR_SCANNED_PDF');
    }

    return this.structureGenericQuestions(fullLines, file.name.replace(/\.[^/.]+$/, ''));
  },

  structureGenericQuestions(lines, defaultTitle) {
    const questions = [];
    let currentSection = 'General';

    let activeSharedContext = null;
    let groupStartQ = null;
    let groupEndQ = null;

    const secRegex = /^\s*\b(?:SECTION|PART)\b\s*([0-9A-ZIVX]+)?\s*[:\-–]?\s*([A-Za-z0-9\s&()–\-]+)/i;
    const groupRangeRegex = /(?:(?:Question|Q\.?)\s*(\d+)\s*(?:-|to|–)\s*(?:Question|Q\.?)?\s*(\d+)|Common Data for Questions?\s*(\d+)\s*(?:-|to|–)\s*(\d+))(.*)/i;
    const qStartRegex = /^(?:(?:Question|Q\.?)\s*(\d+)[\s:\-–.]+|(\d+)[\.\)]\s+)(.*)/i;
    const optRegex = /^(?:\(([A-D1-4])\)|([A-D1-4])[\.\)])\s*(.*)/i;
    const ansRegex = /^(?:Correct\s*Answer|Ans(?:wer)?)\s*[:\-–]?\s*(.*)/i;
    const expRegex = /^(?:Explanation|Solution|Exp)\s*[:\-–]?\s*(.*)/i;

    let currQ = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. Section Header Check
      const secMatch = line.match(secRegex);
      if (secMatch && !line.match(qStartRegex) && line.length < 80) {
        const candidate = secMatch[2]?.trim();
        if (candidate && /[A-Za-z]{3,}/.test(candidate)) {
          currentSection = candidate;
          continue;
        }
      }

      // 2. Shared Statement Range Check
      const grpMatch = line.match(groupRangeRegex);
      if (grpMatch && !line.match(optRegex)) {
        groupStartQ = parseInt(grpMatch[1] || grpMatch[3]);
        groupEndQ = parseInt(grpMatch[2] || grpMatch[4]);
        activeSharedContext = line.trim();
        continue;
      }

      // 3. Question Start Check
      const qMatch = line.match(qStartRegex);
      if (qMatch) {
        if (currQ) {
          this.finalizeQuestion(currQ);
          questions.push(currQ);
        }
        const qNum = parseInt(qMatch[1] || qMatch[2]);

        let contextForThisQ = null;
        let groupId = null;
        if (activeSharedContext && qNum >= groupStartQ && qNum <= groupEndQ) {
          contextForThisQ = activeSharedContext;
          groupId = `group_${groupStartQ}_${groupEndQ}`;
        } else if (qNum > groupEndQ) {
          activeSharedContext = null;
        }

        currQ = {
          num: qNum || (questions.length + 1),
          section: currentSection,
          group_id: groupId,
          shared_context: contextForThisQ,
          question_text: qMatch[3] ? qMatch[3].trim() : '',
          options: [],
          question_type: 'MCQ',
          correct_option_index: 0,
          correct_option_indexes: [],
          correct_numeric_min: null,
          correct_numeric_max: null,
          explanation: ''
        };
        continue;
      }

      if (!currQ) continue;

      // 4. Option Check
      const optMatch = line.match(optRegex);
      if (optMatch) {
        currQ.options.push(optMatch[3]?.trim() || '');
        continue;
      }

      // 5. Answer Check (Supports MCQ single, MSQ multiple like A;C;D, and NAT ranges like 3 to 3 or 4.24 to 4.26)
      const ansMatch = line.match(ansRegex);
      if (ansMatch) {
        const rawAns = ansMatch[1].trim();
        this.parseAndAssignAnswer(currQ, rawAns);
        continue;
      }

      // 6. Explanation Check
      const expMatch = line.match(expRegex);
      if (expMatch) {
        currQ.explanation = expMatch[1]?.trim() || '';
        continue;
      }

      // 7. Multiline Text Continuation
      if (currQ.options.length === 0) {
        currQ.question_text += ' ' + line;
      } else if (currQ.explanation) {
        currQ.explanation += ' ' + line;
      } else if (currQ.options.length > 0) {
        currQ.options[currQ.options.length - 1] += ' ' + line;
      }
    }

    if (currQ) {
      this.finalizeQuestion(currQ);
      questions.push(currQ);
    }

    return {
      title: defaultTitle || 'Practice Mock Exam',
      questions
    };
  },

  parseAndAssignAnswer(q, rawAns) {
    const clean = rawAns.replace(/[\(\)]/g, '').trim();

    // Check if it's a NAT range (e.g., "3 to 3" or "4.24 to 4.26" or "1.33-1.35")
    const rangeMatch = clean.match(/(-?\d*\.?\d+)\s*(?:to|–|-)\s*(-?\d*\.?\d+)/i);
    if (rangeMatch) {
      q.question_type = 'NAT';
      q.correct_numeric_min = parseFloat(rangeMatch[1]);
      q.correct_numeric_max = parseFloat(rangeMatch[2]);
      return;
    }

    // Check if it's a single NAT number
    if (!isNaN(clean) && clean !== '' && !/[A-D]/.test(clean.toUpperCase())) {
      q.question_type = 'NAT';
      const val = parseFloat(clean);
      q.correct_numeric_min = val;
      q.correct_numeric_max = val;
      return;
    }

    // Check if it's MSQ (multiple letters separated by semicolon, comma, or space like A;C;D or A, C)
    const letters = clean.split(/[,;\s]+/).map(l => l.toUpperCase().trim()).filter(Boolean);
    const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, '1': 0, '2': 1, '3': 2, '4': 3 };

    if (letters.length > 1 && letters.every(l => map[l] !== undefined)) {
      q.question_type = 'MSQ';
      q.correct_option_indexes = letters.map(l => map[l]);
      q.correct_option_index = q.correct_option_indexes[0] || 0;
      return;
    }

    // Default to MCQ single correct
    if (letters.length === 1 && map[letters[0]] !== undefined) {
      q.question_type = 'MCQ';
      q.correct_option_index = map[letters[0]];
      q.correct_option_indexes = [q.correct_option_index];
    }
  },

  finalizeQuestion(q) {
    q.question_text = q.question_text.replace(/\s+/g, ' ').trim();
    if (q.explanation) q.explanation = q.explanation.replace(/\s+/g, ' ').trim();
    q.options = q.options.map(opt => opt.replace(/\s+/g, ' ').trim()).filter(Boolean);

    // If no options were parsed and it's not explicitly NAT, classify as NAT (Integer/Numerical type)
    if (q.options.length === 0 && q.question_type !== 'NAT') {
      q.question_type = 'NAT';
    }

    if (q.question_type !== 'NAT') {
      while (q.options.length < 4) {
        q.options.push(`Option ${String.fromCharCode(65 + q.options.length)}`);
      }
    }
  }
};
