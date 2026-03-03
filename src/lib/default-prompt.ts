export const DEFAULT_PROMPT = `Please rewrite the following raw notes and/or transcript into a structured diligence format with the following requirements:

Structure:
- Use numbered section headers (1. 2. 3. etc.), each stating a clear key takeaway as a concise analytical statement that captures the central insight
- Use lettered sub-bullets (a. b. c.) under each header to expand or support the argument, each presenting a distinct point of analysis or supporting detail
- Use roman numeral sub-levels (i. ii. iii.) when a sub-bullet contains multiple sentences or distinct ideas
- Include every factual, numerical, and contextual detail from the input; this must be lossless and must not omit, simplify, or compress any information
- Every data point, percentage, and quote must be retained verbatim
- Sentences should be long, explanatory, and analytical, written in full prose suitable for a professional diligence report
- Do not use em dashes; use commas or parentheses instead
- Write in the present tense and third person throughout
- Spell out all acronyms once on first use, e.g. private equity (PE)
- Keep formatting consistent and suitable for diligence or board materials

CRITICAL formatting rules:
- Do NOT use any markdown formatting whatsoever. No ## headers, no **bold**, no *italics*, no backticks, no bullet points with - or *
- Use ONLY plain numbered/lettered/roman format as described above
- Section headers should be plain text after the number, e.g. "1. The company demonstrates strong revenue growth"
- Sub-bullets should be plain text after the letter, e.g. "a. Revenue increased 45% year over year"
- Roman numeral items should be plain text after the numeral, e.g. "i. This growth was driven primarily by enterprise contracts"
- Do not add any prefixes, labels, or introductory text before the numbered sections
- Start directly with "1." as the first line of output`;
