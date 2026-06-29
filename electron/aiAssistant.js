const { GoogleGenAI } = require('@google/genai');

function registerAiAssistantRoutes(app, poolProvider) {
  // Helper to resolve dynamic or static pool reference with proper null checks
  function getPool() {
    const pool = typeof poolProvider === 'function' ? poolProvider() : poolProvider;
    if (!pool) {
      throw new Error("Database pool is not initialized. Please configure the database settings first.");
    }
    return pool;
  }

  // GET API Key helper
  async function getGeminiApiKey() {
    // 1. Check environment variable
    if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('MY_GEMINI_API_KEY')) {
      return process.env.GEMINI_API_KEY;
    }
    // 2. Check settings table
    try {
      const [rows] = await getPool().query('SELECT val_value FROM settings WHERE key_name = ?', ['gemini_api_key']);
      if (rows.length > 0 && rows[0].val_value) {
        return rows[0].val_value.trim();
      }
    } catch (e) {
      console.warn('Error reading API key from database settings:', e.message);
    }
    return null;
  }

  // POST save API key
  app.post('/api/ai/save-api-key', async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) {
        return res.status(400).json({ error: 'API key is required.' });
      }

      await getPool().query(
        'INSERT INTO settings (key_name, val_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE val_value = ?',
        ['gemini_api_key', apiKey.trim(), apiKey.trim()]
      );

      res.json({ success: true, message: 'Gemini API Key saved successfully to settings.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET API key status
  app.get('/api/ai/key-status', async (req, res) => {
    try {
      const key = await getGeminiApiKey();
      res.json({ configured: !!key });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST test API key connection
  app.post('/api/ai/test-key', async (req, res) => {
    try {
      const { apiKey } = req.body;
      const keyToTest = apiKey || await getGeminiApiKey();
      if (!keyToTest) {
        return res.status(400).json({ error: 'API key is required for testing.' });
      }

      const ai = new GoogleGenAI({ apiKey: keyToTest });
      const testResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello, respond with only the word OK.' }] }]
      });

      const text = testResponse.text ? testResponse.text.trim() : '';
      if (text) {
        res.json({ success: true, message: 'Gemini API connection successful!' });
      } else {
        res.status(400).json({ error: 'Gemini API returned an empty response.' });
      }
    } catch (err) {
      console.error('[AI Assistant] Connection test failed:', err.message || err);
      res.status(400).json({ error: `Connection test failed: ${err.message || err}` });
    }
  });

  // Predefined Answers Dictionary for Common Questions
  function getPredefinedAnswer(question) {
    const q = question.toLowerCase().trim().replace(/[?.]/g, '');
    
    if (q.includes('enter marks') || q.includes('input marks') || q.includes('add marks')) {
      return `Log in as a teacher.
Open Results Management.
Select Class and Stream.
Choose the Subject.
Enter marks and click Save.
Use Edit Marks if you need to make corrections.`;
    }
    
    if (q.includes('print report card') || q.includes('generate report card') || q.includes('print reports')) {
      return `Log in as an Administrator, Teacher, or Student.
Go to the Results page or Student Portal.
Locate the specific student.
Click Print Report Card or Compile PDF.
Download or print the generated PDF.`;
    }
    
    if (q.includes('add a new student') || q.includes('register student') || q.includes('add student') || q.includes('register a new student')) {
      return `Log in as an Administrator.
Navigate to Student Directory.
Click the Add Student or Register Student button.
Fill in the student's name, class, gender, and boarding status.
Click Save to add the student.`;
    }
    
    if (q.includes('assign teacher') || q.includes('assign teachers') || q.includes('teacher assignments')) {
      return `Log in as an Administrator.
Go to the Teacher Management section.
Select the target teacher from the list.
Assign classes and subjects to the teacher.
Click Save Assignments.`;
    }
    
    if (q.includes('generate class list') || q.includes('generate class lists') || q.includes('export class list')) {
      return `Log in as an Administrator or Teacher.
Navigate to Class Lists or Student Directory.
Select the class and stream to view.
Click Export to CSV/Excel or Print Class List.`;
    }
    
    if (q.includes('upload school logo') || q.includes('upload logo') || q.includes('change school logo')) {
      return `Log in as an Administrator.
Go to Admin Settings.
Under General Settings, click Upload School Logo.
Choose the image file and click save settings.`;
    }
    
    return null;
  }

  // Clean Markdown helper
  function cleanPlainText(text) {
    if (!text) return '';
    return text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#/g, '')
      .replace(/[-•]\s+/g, '') // remove bullets
      .replace(/`/g, '')       // remove backticks
      .trim();
  }

  // POST ask AI assistant
  app.post('/api/ai/ask', async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || !question.trim()) {
        return res.status(400).json({ error: 'Question is required.' });
      }

      const apiKey = await getGeminiApiKey();
      if (!apiKey) {
        return res.status(400).json({
          error: 'Gemini API Key is not configured. Please enter a valid Gemini API Key in the settings page to enable St.Paul Intelligence Assistant.'
        });
      }

      // Check predefined answers first
      const predefinedAnswer = getPredefinedAnswer(question);
      if (predefinedAnswer) {
        console.log(`[AI Assistant] Programmatic match for predefined question: "${question}"`);
        return res.json({
          question,
          sql: null,
          answer: predefinedAnswer,
          columns: [],
          rows: []
        });
      }

      const ai = new GoogleGenAI({ apiKey });

      // Classifier & Knowledge Base prompt
      const classificationPrompt = `
You are the Brain Classifier for "St. Paul Secondary School" Student Clearance Card System.
Analyze the user's question: "${question}"

Determine the type of the question:
1. "database" - The question asks for data residing in the MySQL database (e.g., student counts, specific student clearance status, fees balances, list of students in a class).
2. "help" - The question is about how to use the system, how to perform features, or instructions/tutorials (e.g., how to enter marks, print report cards, register students, promote students, upload photos, upload school logos, assign teachers, generate class lists).
3. "mixed" - The question asks for BOTH database data and help/tutorial instructions (e.g., "how many students are cleared and how do I clear a student?").

Here is the System Knowledge Base containing all system features and instructions:
- Entering/Editing Marks:
  Log in as a teacher.
  Open Results Management.
  Select Class and Stream.
  Choose the Subject.
  Enter marks and click Save.
  Use Edit Marks if you need to make corrections.
- Printing Report Cards:
  Log in as an Administrator, Teacher, or Student.
  Go to the Results page or Student Portal.
  Locate the specific student.
  Click Print Report Card or Compile PDF.
  Download or print the generated PDF.
- Registering/Adding Students:
  Log in as an Administrator.
  Navigate to Student Directory.
  Click the Add Student or Register Student button.
  Fill in the student's name, class, gender, and boarding status.
  Click Save to add the student.
- Assigning Teachers:
  Log in as an Administrator.
  Go to the Teacher Management section.
  Select the target teacher from the list.
  Assign classes and subjects to the teacher.
  Click Save Assignments.
- Generating Class Lists:
  Log in as an Administrator or Teacher.
  Navigate to Class Lists or Student Directory.
  Select the class and stream to view.
  Click Export to CSV/Excel or Print Class List.
- Uploading School Logos:
  Log in as an Administrator.
  Go to Admin Settings.
  Under General Settings, click Upload School Logo.
  Choose the image file and click save settings.
- Uploading Student Photos:
  Log in as an Administrator or Teacher.
  Navigate to Student Directory or Registry.
  Select the student and click Upload Photo or Capture Webcam.
  Save or match the photo.
- Promoting Students:
  Log in as an Administrator.
  Open Student Directory / Bulk Actions.
  Select the students to promote.
  Choose Promote Students action and update class levels.

MySQL Database Schema:
1. "students" table:
   - id (VARCHAR(50), Primary Key)
   - adminNo (VARCHAR(50))
   - name (VARCHAR(255))
   - aliases (TEXT)
   - gender (VARCHAR(10))
   - gradeClass (VARCHAR(50))
   - boardingStatus (VARCHAR(50))
   - isCleared (BOOLEAN)
   - gateClearanceDate (VARCHAR(20))
   - mealsClearanceDate (VARCHAR(20))
   - remarks (TEXT)
   - photo (LONGTEXT) - base64 photo (to check if photo is uploaded, use "photo IS NOT NULL AND LENGTH(photo) > 0" or check "photo = ''" as missing)
   - photoOriginal (LONGTEXT)
   - photoEnhanced (LONGTEXT)
   - printStatus (VARCHAR(20))
   - uace_combination (VARCHAR(50))
2. "marks" table:
   - id, student_id, subject, marks_obtained, max_marks, term, year.
3. "olevel_marks" table:
   - id, student_id, subject, integration1, integration2, integration3, exam_score, term, year, status.
4. "uace_marks" table:
   - id, student_id, subject, subject_type, paper, score, bot, mot, eot, grade, points, term, year, status.
5. "attendance" table:
   - id, student_id, date, status.
6. "fees" table:
   - id, student_id, term, year, amount_due, amount_paid, balance, payment_status.
7. "teachers" table:
   - id, name, username, classes, subjects, position, status.

Rules:
1. ONLY write SELECT SQL queries.
2. If the user question is a greeting, non-database query, or tutorial help request, return "sql": null.
3. In explanation, respond in PLAIN TEXT only. Do NOT use markdown (*, **, #, bullets). Do not say "Ask the administrator" unless the question is completely unknown.

You MUST return a JSON object with this exact structure:
{
  "type": "database" | "help" | "mixed",
  "sql": "SELECT ... if database/mixed, or null",
  "explanation": "If 'help' or 'mixed', write step-by-step instructions from the Knowledge Base here. Otherwise, a brief description of the SQL query."
}

Do not wrap output in markdown code blocks. Return only raw JSON.
`;

      console.log(`[AI Assistant] Requesting query classification for: "${question}"`);
      const classificationResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: classificationPrompt }] }
        ]
      });

      let responseText = classificationResponse.text ? classificationResponse.text.trim() : '';
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      } else if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
      }

      console.log(`[AI Assistant] Classification raw response: ${responseText}`);

      let payload;
      try {
        payload = JSON.parse(responseText);
      } catch (err) {
        console.error('[AI Assistant] JSON Parse failed for Gemini output:', responseText);
        throw new Error('Failed to parse query instruction generated by AI.');
      }

      const qType = payload.type || 'database';
      const sqlQuery = payload.sql;
      const explanation = payload.explanation || '';

      if (qType === 'help' || !sqlQuery) {
        return res.json({
          question,
          sql: null,
          answer: cleanPlainText(explanation || 'I am here to help you manage the student clearance cards and school system. Ask me database or usage questions!'),
          columns: [],
          rows: []
        });
      }

      // Safe check: Enforce SELECT only
      const cleanSql = sqlQuery.trim();
      const firstWord = cleanSql.split(/\s+/)[0].toUpperCase();
      if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
        return res.status(400).json({ error: 'Security warning: The generated query was blocked because it contains non-read operations.' });
      }

      // Execute SQL on the connection pool
      console.log(`[AI Assistant] Executing SQL: ${cleanSql}`);
      const [rows, fields] = await getPool().query(cleanSql);

      const columns = fields ? fields.map(f => f.name) : [];
      console.log(`[AI Assistant] Query returned ${rows.length} rows.`);

      // Limit data size sent to Gemini for summary (max 100 rows, exclude base64 photos to stay under token limits)
      const sanitizedRows = rows.slice(0, 100).map(r => {
        const copy = { ...r };
        // Remove heavy photo fields so we don't blow token limits
        if (copy.photo) copy.photo = '[Base64 Photo]';
        if (copy.photoOriginal) copy.photoOriginal = '[Base64 Photo]';
        if (copy.photoEnhanced) copy.photoEnhanced = '[Base64 Photo]';
        return copy;
      });

      // Mixed/Synthesis Prompt
      const mixedInstruction = qType === 'mixed' ? `Also, include these system help instructions in your response:\n${explanation}` : '';
      const synthesisPrompt = `
You are the Database AI Expert for "St. Paul Secondary School" Student Clearance Card System.
The user asked: "${question}"

To answer this, we executed the following SQL query:
\`\`\`sql
${cleanSql}
\`\`\`

Here are the results of the query (limited to the first 100 rows):
Columns: ${JSON.stringify(columns)}
Rows: ${JSON.stringify(sanitizedRows)}
Total rows in database match: ${rows.length}

${mixedInstruction}

Please synthesize a natural language response summarizing these database results for the school administrator.
Rules:
1. Write a clear, professional, and friendly response.
2. Present statistics and summaries nicely.
3. If there are lists of students, briefly summarize the total number and classes, then mention that the detailed list is shown in the table below.
4. Respond in PLAIN TEXT only. Do NOT use markdown formatting (no *, no **, no #, no bullet symbols). Use clean newlines and regular lists instead.
`;

      const synthesisResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }]
      });

      const rawAnswer = synthesisResponse.text ? synthesisResponse.text.trim() : 'I have fetched the records matching your question. Please inspect the table below.';
      const answer = cleanPlainText(rawAnswer);

      res.json({
        question,
        sql: cleanSql,
        answer,
        columns,
        // Send the full rows to the frontend so they can be viewed/exported/graphed
        rows
      });

    } catch (err) {
      console.error('[AI Assistant] Error:', err);
      res.status(500).json({ error: err.message || 'An error occurred during AI query processing.' });
    }
  });
}

module.exports = {
  registerAiAssistantRoutes
};
