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

      // Sort items: Top-to-Bottom, then Left-to-Right
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
        // Ignore browser print footers, file paths, URLs, page numbers
        if (
          item.str.includes('file:///') ||
          item.str.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) ||
          item.str.match(/^\d+\/\d+$/) ||
          item.str.match(/Page\s+\d+\s+of\s+\d+/i)
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

    // Strict regex with word boundaries (\b) so "participle" or "department" never triggers
    const secRegex = /^\s*\b(?:SECTION|PART)\b\s*([0-9A-ZIVX]+)?\s*[:\-–]?\s*([A-Za-z0-9\s&()–\-]+)/i;
    // Matches: "Question 1:", "Q.1", "1. ", "1)", "Q1 - "
    const qStartRegex = /^(?:(?:Question|Q\.?)\s*(\d+)[\s:\-–.]+|(\d+)[\.\)]\s+)(.*)/i;
    // Matches: "(A)", "(a)", "A.", "A)", "(1)"
    const optRegex = /^(?:\(([A-D1-4])\)|([A-D1-4])[\.\)])\s*(.*)/i;
    // Matches: "Correct Answer: (D)", "Ans: B", "Answer: A"
    const ansRegex = /^(?:Correct\s*Answer|Ans(?:wer)?)\s*[:\-–]?\s*\(?([A-D1-4])\)?/i;
    // Matches: "Explanation: ...", "Solution: ..."
    const expRegex = /^(?:Explanation|Solution|Exp)\s*[:\-–]?\s*(.*)/i;

    let currQ = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. Check Section Header (Strict matching + must have alphabetic title)
      const secMatch = line.match(secRegex);
      if (secMatch && !line.match(qStartRegex) && line.length < 80) {
        const candidateTitle = secMatch[2]?.trim();
        // Discard punctuation-only matches or tiny false fragments
        if (candidateTitle && /[A-Za-z]{3,}/.test(candidateTitle)) {
          currentSection = candidateTitle;
          continue;
        }
      }

      // 2. Check Question Start
      const qMatch = line.match(qStartRegex);
      if (qMatch) {
        if (currQ) {
          this.finalizeQuestion(currQ);
          questions.push(currQ);
        }
        const qNum = parseInt(qMatch[1] || qMatch[2]);
        currQ = {
          num: qNum || (questions.length + 1),
          section: currentSection,
          question_text: qMatch[3] ? qMatch[3].trim() : '',
          options: [],
          correct_option_index: 0,
          explanation: ''
        };
        continue;
      }

      if (!currQ) continue;

      // 3. Check Option
      const optMatch = line.match(optRegex);
      if (optMatch) {
        const optText = optMatch[3]?.trim() || '';
        currQ.options.push(optText);
        continue;
      }

      // 4. Check Answer
      const ansMatch = line.match(ansRegex);
      if (ansMatch) {
        const letter = ansMatch[1].toUpperCase();
        const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, '1': 0, '2': 1, '3': 2, '4': 3 };
        if (map[letter] !== undefined) {
          currQ.correct_option_index = map[letter];
        }
        continue;
      }

      // 5. Check Explanation
      const expMatch = line.match(expRegex);
      if (expMatch) {
        currQ.explanation = expMatch[1]?.trim() || '';
        continue;
      }

      // 6. Multiline continuation
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
      questions: questions
    };
  },

  finalizeQuestion(q) {
    q.question_text = q.question_text.replace(/\s+/g, ' ').trim();
    if (q.explanation) q.explanation = q.explanation.replace(/\s+/g, ' ').trim();
    q.options = q.options.map(opt => opt.replace(/\s+/g, ' ').trim()).filter(Boolean);
    while (q.options.length < 4) {
      q.options.push(`Option ${String.fromCharCode(65 + q.options.length)}`);
    }
  }
};
