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

      const ai = new GoogleGenAI({ apiKey });

      // DB Schema Description
      const dbSchemaDescription = `
You are the Database AI Expert for "St. Paul Secondary School" Student Clearance Card System.
Your job is to translate a user's natural language question into a single read-only SELECT SQL query, which will run on a MySQL database.

Database Schema:
1. "students" table:
   - id (VARCHAR(50), Primary Key)
   - adminNo (VARCHAR(50)) - unique student identification number (e.g. ADM-2026-001)
   - name (VARCHAR(255)) - student's full name
   - aliases (TEXT) - comma-separated alternate names
   - gender (VARCHAR(10)) - 'Male' or 'Female'
   - gradeClass (VARCHAR(50)) - class/stream name. Format is "S.X StreamName" (e.g., "S.1 A", "S.4 B", "S.5 Sciences", "S.6 Arts").
   - boardingStatus (VARCHAR(50)) - 'Boarder' (hosteller) or 'Day Scholar'
   - isCleared (BOOLEAN) - clearance status (1 = Cleared, 0 = Hold/Not Cleared)
   - gateClearanceDate (VARCHAR(20))
   - mealsClearanceDate (VARCHAR(20))
   - remarks (TEXT) - teacher/administrator remarks
   - photo (LONGTEXT) - base64 photo (to check if photo is uploaded, use "photo IS NOT NULL AND LENGTH(photo) > 0" or check "photo = ''" as missing)
   - photoOriginal (LONGTEXT)
   - photoEnhanced (LONGTEXT)
   - printStatus (VARCHAR(20)) - 'Printed' or 'Not Printed'
   - uace_combination (VARCHAR(50)) - optional subject combination for S.5/S.6 (e.g. PCM, HEL)

2. "marks" table:
   - id (INT, Primary Key)
   - student_id (VARCHAR(50), Foreign Key pointing to students.id)
   - subject (VARCHAR(100))
   - marks_obtained (DECIMAL(5,2))
   - max_marks (DECIMAL(5,2))
   - term (VARCHAR(20))
   - year (INT)

3. "attendance" table:
   - id (INT, Primary Key)
   - student_id (VARCHAR(50), Foreign Key pointing to students.id)
   - date (DATE)
   - status (ENUM('Present', 'Absent', 'Late', 'Excused'))

4. "fees" table:
   - id (INT, Primary Key)
   - student_id (VARCHAR(50), Foreign Key pointing to students.id)
   - term (VARCHAR(20))
   - year (INT)
   - amount_due (DECIMAL(12,2))
   - amount_paid (DECIMAL(12,2))
   - balance (DECIMAL(12,2))
   - payment_status (ENUM('Paid', 'Pending', 'Overdue'))

5. "teachers" table:
   - id (VARCHAR(50), Primary Key)
   - name (VARCHAR(100))

Rules for SQL Generation:
1. ONLY write SELECT statements. Under NO circumstances should you generate INSERT, UPDATE, DELETE, ALTER, CREATE, DROP, RENAME, or REPLACE statements.
2. If the question asks for students in a class or stream, remember:
   - The gradeClass column contains both class and stream (e.g., "S.4 B").
   - To query by class only (e.g. S.4), use "gradeClass LIKE 'S.4 %' OR gradeClass = 'S.4'".
   - To query by stream only (e.g. Stream A), use "gradeClass LIKE '% A' OR gradeClass LIKE '%A'".
   - To query both class and stream (e.g. S.4 Stream A), use "gradeClass = 'S.4 A'".
3. Check photo existence: "photo IS NOT NULL AND LENGTH(photo) > 0".
4. Check missing photo: "photo IS NULL OR LENGTH(photo) = 0".
5. For clearance checks: "isCleared = 1" or "isCleared = 0".
6. If the user question is a greeting or a general, non-database question, return a JSON response with "sql": null and a friendly response in "explanation".

You MUST return a JSON object with this exact structure:
{
  "sql": "SELECT ...",
  "explanation": "Brief explanation of what this query does."
}

Do not wrap your output in markdown code blocks like \`\`\`json. Return only the raw JSON string.
`;

      // Call Gemini to generate the SQL
      console.log(`[AI Assistant] Requesting SQL translation for: "${question}"`);
      const sqlGenResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: dbSchemaDescription }] },
          { role: 'user', parts: [{ text: `Question: "${question}"` }] }
        ]
      });

      let responseText = sqlGenResponse.text ? sqlGenResponse.text.trim() : '';
      
      // Clean potential markdown wrap
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      } else if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
      }

      console.log(`[AI Assistant] Raw response received: ${responseText}`);
      
      let payload;
      try {
        payload = JSON.parse(responseText);
      } catch (err) {
        console.error('[AI Assistant] JSON Parse failed for Gemini output:', responseText);
        throw new Error('Failed to parse query instruction generated by AI.');
      }

      const sqlQuery = payload.sql;
      const explanation = payload.explanation || '';

      if (!sqlQuery) {
        // No SQL generated, likely a greeting or non-DB question. Return explanation directly as the answer.
        return res.json({
          question,
          sql: null,
          answer: explanation || 'Hello! I am St.Paul Intelligence Assistant. How can I help you manage student clearance cards today?',
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

      // Synthesis Prompt: Translate raw query results back to user-friendly plain English
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

Please synthesize a natural language response summarizing these results for the school administrator.
Rules:
1. Write a clear, professional, and friendly response.
2. Present statistics and summaries nicely.
3. If there are lists of students, briefly summarize the total number and classes, then mention that the detailed list is shown in the table below.
4. Keep the response concise, using bold text, bullet points, or lists in Markdown.
`;

      const synthesisResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }]
      });

      const answer = synthesisResponse.text ? synthesisResponse.text.trim() : 'I have fetched the records matching your question. Please inspect the table below.';

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
