const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Middlewares
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// DB setup
const db = new sqlite3.Database(path.join(__dirname, 'afyadada.db'));
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Serve static files from the current directory
app.use(express.static(__dirname));

// Route for the home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'nice.html'));
});

// Handle contact form submissions
app.post('/contact', (req, res) => {
    console.log('Form submission:', req.body);
    res.json({ message: 'Form submitted successfully' });
});

// Auth endpoints
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const stmt = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
  stmt.run(name, email.toLowerCase(), passwordHash, function(err){
    if (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      console.error('Signup error:', err);
      return res.status(500).json({ error: 'Failed to create account' });
    }
    const user = { id: this.lastID, name, email: email.toLowerCase() };
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], (err, row) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
    if (!row) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const user = { id: row.id, name: row.name, email: row.email };
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  });
});

// Afyadada AI chat endpoint
app.post('/api/afyadada-chat', async (req, res) => {
    try {
        const { prompt } = req.body || {};
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'Missing prompt' });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Server not configured: missing OPENAI_API_KEY' });
        }

        const { OpenAI } = require('openai');
        const client = new OpenAI({ apiKey });

        const system = `You are Afyadada, a warm, supportive women's wellness companion. Offer helpful, evidence-informed guidance for menstrual health, pregnancy, postpartum, mental wellness, nutrition, fitness, breastfeeding, contraception, and safety. Keep answers short (4-7 sentences), practical, and respectful. Remind users to seek professional care for emergencies.`;

        const completion = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.4,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt }
            ]
        });

        const text = completion.choices?.[0]?.message?.content?.trim();
        if (!text) {
            return res.status(502).json({ error: 'No response from AI' });
        }
        res.json({ reply: text });
    } catch (err) {
        console.error('AI error:', err);
        res.status(500).json({ error: 'AI service error' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 