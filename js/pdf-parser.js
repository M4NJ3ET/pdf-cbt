window.PdfParser = {
  async parseFile(file, progressCallback = () => {}) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    let fullText = '';
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
      progressCallback(Math.round((i / numPages) * 70));
    }

    if (!fullText.trim()) {
      throw new Error('EMPTY_OR_SCANNED_PDF');
    }

    return this.structureQuestions(fullText, file.name.replace(/\.[^/.]+$/, ''));
  },

  structureQuestions(text, defaultTitle) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const questions = [];
    let currentSection = 'General';

    // Regex matchers for Indian CBT question papers
    const sectionRegex = /(?:SECTION|PART)\s*([0-9A-ZIVX]+)?\s*[:\-–]?\s*([A-Za-z0-9\s&()–\-]+)/i;
    const questionStartRegex = /^(?:Question|Q\.?)\s*(\d+)[\s:\-–.]+(.*)/i;
    const optionRegex = /^\(([A-D1-4])\)\s*(.*)/i;
    const ansRegex = /^(?:Correct\s*Answer|Ans(?:wer)?)\s*[:\-–]?\s*(?:\(?([A-D1-4])\)?)/i;
    const explRegex = /^(?:Explanation|Solution|Exp)\s*[:\-–]?\s*(.*)/i;

    let currQ = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. Detect Section Header
      const secMatch = line.match(sectionRegex);
      if (secMatch && !line.match(questionStartRegex) && line.length < 80) {
        currentSection = line.replace(/^(?:SECTION|PART)\s*[0-9A-ZIVX]*\s*[:\-–]?\s*/i, '').trim() || line;
        continue;
      }

      // 2. Detect Question Start
      const qMatch = line.match(questionStartRegex);
      if (qMatch) {
        if (currQ) questions.push(currQ);
        currQ = {
          num: questions.length + 1,
          section: currentSection,
          question_text: qMatch[2] ? qMatch[2].trim() : '',
          options: [],
          correct_option_index: 0,
          explanation: '',
          warnings: []
        };
        continue;
      }

      if (!currQ) continue;

      // 3. Detect Options (A), (B), (C), (D)
      const optMatch = line.match(optionRegex);
      if (optMatch) {
        currQ.options.push(optMatch[2].trim());
        continue;
      }

      // 4. Detect Answer
      const ansMatch = line.match(ansRegex);
      if (ansMatch) {
        const letter = ansMatch[1].toUpperCase();
        const mapping = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, '1': 0, '2': 1, '3': 2, '4': 3 };
        if (mapping[letter] !== undefined) {
          currQ.correct_option_index = mapping[letter];
        }
        continue;
      }

      // 5. Detect Explanation
      const explMatch = line.match(explRegex);
      if (explMatch) {
        currQ.explanation = explMatch[1].trim();
        continue;
      }

      // 6. Append continuation text
      if (currQ.options.length === 0) {
        currQ.question_text += ' ' + line;
      } else if (currQ.explanation) {
        currQ.explanation += ' ' + line;
      } else if (currQ.options.length > 0) {
        currQ.options[currQ.options.length - 1] += ' ' + line;
      }
    }

    if (currQ) questions.push(currQ);

    // Fallback: Default 4 options if some were parsed without choices
    questions.forEach(q => {
      q.question_text = q.question_text.trim();
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
