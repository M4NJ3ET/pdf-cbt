window.PdfParser = {
  async parseFile(file, progressCallback = () => {}) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    let fullText = '';
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Sort items top-to-bottom, left-to-right to properly handle multi-column layouts
      const items = textContent.items.sort((a, b) => {
        const yDiff = Math.abs(a.transform[5] - b.transform[5]);
        if (yDiff < 4) { // Same line
          return a.transform[4] - b.transform[4];
        }
        return b.transform[5] - a.transform[5]; // Top to bottom
      });

      const pageText = items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
      progressCallback(Math.round((i / numPages) * 70));
    }

    if (!fullText.trim()) {
      throw new Error('EMPTY_OR_SCANNED_PDF');
    }

    return this.structureQuestions(fullText, file.name.replace(/\.[^/.]+$/, ''));
  },

  structureQuestions(text, defaultTitle) {
    // Separate Answer Key section if present at the end
    let contentText = text;
    let answerKeyText = '';

    const answerKeySplit = text.split(/(?:Answer\s*Key|Answers\s*&|Quick\s*Explanations)/i);
    if (answerKeySplit.length > 1) {
      contentText = answerKeySplit[0];
      answerKeyText = answerKeySplit.slice(1).join(' ');
    }

    // Comprehensive answer map extracted from end-of-file table (e.g., Q# 1 Ans A)
    const endAnswers = {};
    const endExplanation = {};
    if (answerKeyText) {
      // Matches: 1 A ... or 1 | A | ...
      const tableRowRegex = /(\d+)\s*\|?\s*([A-D1-4])\s*\|?\s*([^0-9\n|]{2,120})?/gi;
      let m;
      while ((m = tableRowRegex.exec(answerKeyText)) !== null) {
        const qNum = parseInt(m[1]);
        const letter = m[2].toUpperCase();
        const mapping = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, '1': 0, '2': 1, '3': 2, '4': 3 };
        if (mapping[letter] !== undefined) {
          endAnswers[qNum] = mapping[letter];
          if (m[3]) endExplanation[qNum] = m[3].trim();
        }
      }
    }

    // Split text into tokens based on question beginnings
    // Matches: "1. ", "Question 1:", "Q.1", "1) "
    const qSplitRegex = /(?:^|\n|\s{2,})(?:(?:Question|Q\.?)\s*(\d+)[\s:\-–.]+|(\d+)[\.\)]\s+)(?=[A-Z0-9"'])/gi;

    const questions = [];
    let currentSection = 'General';

    const lines = contentText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let currQ = null;

    // Pattern matchers
    const sectionHeaderRegex = /^(?:SECTION|PART)\s*([0-9A-ZIVX]+)?\s*[:\-–]?\s*(.*)/i;
    const itemQuestionRegex = /^(?:(?:Question|Q\.?)\s*(\d+)[\s:\-–.]+|(\d+)[\.\)]\s+)(.*)/i;
    const optionRegex = /^\(([A-D1-4])\)\s*(.*)/i;
    const inlineAnsRegex = /^(?:Correct\s*Answer|Ans(?:wer)?)\s*[:\-–]?\s*(?:\(?([A-D1-4])\)?)/i;
    const inlineExplRegex = /^(?:Explanation|Solution)\s*[:\-–]?\s*(.*)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect Section Header
      const secMatch = line.match(sectionHeaderRegex);
      if (secMatch && !line.match(itemQuestionRegex) && line.length < 80) {
        currentSection = secMatch[2]?.trim() || line;
        continue;
      }

      // Detect Question Start
      const qMatch = line.match(itemQuestionRegex);
      if (qMatch) {
        if (currQ) questions.push(currQ);
        const qNum = parseInt(qMatch[1] || qMatch[2]);
        currQ = {
          num: qNum || (questions.length + 1),
          section: currentSection,
          question_text: qMatch[3] ? qMatch[3].trim() : '',
          options: [],
          correct_option_index: endAnswers[qNum] !== undefined ? endAnswers[qNum] : 0,
          explanation: endExplanation[qNum] || ''
        };
        continue;
      }

      if (!currQ) continue;

      // Detect Option (A), (B), (C), (D)
      const optMatch = line.match(optionRegex);
      if (optMatch) {
        currQ.options.push(optMatch[2].trim());
        continue;
      }

      // Detect Inline Answer
      const inlineAns = line.match(inlineAnsRegex);
      if (inlineAns) {
        const mapping = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, '1': 0, '2': 1, '3': 2, '4': 3 };
        const ansChar = inlineAns[1].toUpperCase();
        if (mapping[ansChar] !== undefined) {
          currQ.correct_option_index = mapping[ansChar];
        }
        continue;
      }

      // Detect Inline Explanation
      const inlineExpl = line.match(inlineExplRegex);
      if (inlineExpl) {
        currQ.explanation = inlineExpl[1].trim();
        continue;
      }

      // Multiline append
      if (currQ.options.length === 0) {
        currQ.question_text += ' ' + line;
      } else if (currQ.explanation) {
        currQ.explanation += ' ' + line;
      } else if (currQ.options.length > 0) {
        currQ.options[currQ.options.length - 1] += ' ' + line;
      }
    }

    if (currQ) questions.push(currQ);

    // Normalize questions & ensure 4 options exist
    questions.forEach((q, idx) => {
      q.num = idx + 1;
      q.question_text = q.question_text.replace(/\s+/g, ' ').trim();
      while (q.options.length < 4) {
        q.options.push(`Option ${String.fromCharCode(65 + q.options.length)}`);
      }
    });

    return {
      title: defaultTitle || 'Practice Mock Test',
      questions
    };
  }
};
