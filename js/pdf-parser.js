window.PdfParser = {
  async parseFile(file, progressCallback) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    let fullLines = [];

    // 1. Extract text items page-by-page and group by vertical lines (Y position)
    for (let i = 1; i <= numPages; i++) {
      if (progressCallback) progressCallback(Math.round((i / numPages) * 70));
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Group items with similar transform[5] (Y-coordinate)
      let lineMap = {};
      textContent.items.forEach(item => {
        const y = Math.round(item.transform[5] / 3) * 3; // 3pt clustering
        if (!lineMap[y]) lineMap[y] = [];
        lineMap[y].push(item);
      });

      // Sort Y descending (top of page to bottom)
      const sortedYs = Object.keys(lineMap).sort((a, b) => Number(b) - Number(a));
      sortedYs.forEach(y => {
        // Sort X ascending (left to right)
        const lineItems = lineMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
        const lineText = lineItems.map(item => item.str).join(' ').trim();
        if (lineText) fullLines.push(lineText);
      });
    }

    if (fullLines.length === 0) {
      throw new Error("EMPTY_OR_SCANNED_PDF");
    }

    if (progressCallback) progressCallback(85);

    // 2. Parse questions, sections, options, answers, explanations
    const parsedData = this.interpretLines(fullLines);
    if (progressCallback) progressCallback(100);
    return parsedData;
  },

  interpretLines(lines) {
    let questions = [];
    let sections = [];
    let currentSection = 'General';
    let currentQ = null;
    let inAnswerKeySection = false;
    let answerKeyMap = {}; // Question Number -> Option Index

    // Regex matchers
    const qStartRegex = /^(?:Q(?:uestion)?\.?\s*(\d+)[\.\):\-]|(\d+)[\.\)]\s+)/i;
    const optRegex = /^(?:\(([A-Da-d1-4])\)|([A-Da-d1-4])[\.\)])\s*(.*)/;
    const ansInlineRegex = /(?:Ans(?:wer)?|Correct\s*Option)[\s:\.\-]*\(?([A-Da-d1-4])\)?/i;
    const expRegex = /^(?:Exp(?:lanation)?|Solution|Reason)[\s:\.\-]*(.*)/i;
    const sectionHeaderRegex = /^(?:Section|Part)\s*[-:]?\s*([A-Za-z0-9\s]+)/i;

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];

      // Detect end-of-document Answer Key tables or blocks
      if (/^(?:Answer\s*Key|Answers\s*:?)/i.test(line)) {
        inAnswerKeySection = true;
        continue;
      }

      if (inAnswerKeySection) {
        // Match occurrences like "1. A", "2-(B)", "3:C", "4. 2"
        const pairRegex = /(\d+)[\.\s:\-]+(?:\(?([A-Da-d1-4])\)?)/g;
        let match;
        while ((match = pairRegex.exec(line)) !== null) {
          const qNum = parseInt(match[1]);
          const optVal = this.normalizeOptionIndex(match[2]);
          answerKeyMap[qNum] = optVal;
        }
        continue;
      }

      // Check Section headers
      const secMatch = line.match(sectionHeaderRegex);
      if (secMatch && !currentQ) {
        currentSection = secMatch[1].trim();
        if (!sections.includes(currentSection)) sections.push(currentSection);
        continue;
      }

      // Check New Question Start
      const qMatch = line.match(qStartRegex);
      if (qMatch) {
        if (currentQ) questions.push(currentQ);
        const qNum = parseInt(qMatch[1] || qMatch[2]);
        const qText = line.replace(qStartRegex, '').trim();

        currentQ = {
          num: qNum,
          section: currentSection,
          question_text: qText,
          options: [],
          correct_option_index: -1,
          explanation: '',
          warnings: []
        };
        continue;
      }

      if (currentQ) {
        // Check inline Answer
        const ansMatch = line.match(ansInlineRegex);
        if (ansMatch) {
          currentQ.correct_option_index = this.normalizeOptionIndex(ansMatch[1]);
          continue;
        }

        // Check Explanation
        const expMatch = line.match(expRegex);
        if (expMatch) {
          currentQ.explanation = expMatch[1] || '';
          continue;
        }

        // Check Option
        const optMatch = line.match(optRegex);
        if (optMatch) {
          const optText = (optMatch[3] || '').trim();
          currentQ.options.push(optText);
          continue;
        }

        // Append remaining text either to explanation, last option, or question text
        if (currentQ.explanation) {
          currentQ.explanation += ' ' + line;
        } else if (currentQ.options.length > 0) {
          currentQ.options[currentQ.options.length - 1] += ' ' + line;
        } else {
          currentQ.question_text += ' ' + line;
        }
      }
    }

    if (currentQ) questions.push(currentQ);

    // Reconcile with Answer Key map if present
    questions.forEach((q, idx) => {
      const detectedNum = q.num || (idx + 1);
      if (q.correct_option_index === -1 && answerKeyMap[detectedNum] !== undefined) {
        q.correct_option_index = answerKeyMap[detectedNum];
      }

      // Mark warnings for quality inspection
      if (!q.question_text || q.question_text.trim().length === 0) {
        q.warnings.push('Question text appears empty.');
      }
      if (q.options.length < 2) {
        q.warnings.push(`Only ${q.options.length} option(s) detected.`);
      }
      if (q.correct_option_index < 0 || q.correct_option_index >= q.options.length) {
        q.warnings.push('Correct answer could not be verified automatically.');
        q.correct_option_index = 0; // Default fallback to A
      }
    });

    if (sections.length === 0) sections = ['General'];

    return {
      title: 'Uploaded Practice Exam',
      sections,
      questions
    };
  },

  normalizeOptionIndex(label) {
    const cleaned = label.trim().toUpperCase();
    if (cleaned === 'A' || cleaned === '1') return 0;
    if (cleaned === 'B' || cleaned === '2') return 1;
    if (cleaned === 'C' || cleaned === '3') return 2;
    if (cleaned === 'D' || cleaned === '4') return 3;
    return 0;
  }
};