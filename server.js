import express from 'express';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import pool, { initDb } from './db.js';
import { supabase } from './supabase.js';
import { createTriageService, validateInput } from './triage.js';

const app = express();
const PORT = process.env.PORT || 3000;
const classify = createTriageService();

app.use(express.json());

const openapiSpecification = JSON.parse(
  fs.readFileSync(new URL('./openapi.json', import.meta.url), 'utf8')
);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification));

function formatTask(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    title: row.title,
    done: Boolean(row.done)
  };
}

/* --- Reusable Auth Middleware (Stage 4) --- */

async function authMiddleware(req, res, next) {
  if (!supabase) return res.status(503).json({ error: 'Authentication is unavailable: Supabase is not configured' });
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  req.token = token;
  next();
}

app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Task API',
    version: '1.0',
    endpoints: [
      '/tasks',
      '/auth/signup',
      '/auth/login',
      '/auth/logout',
      '/public/info',
      '/triage',
      '/protected/profile',
      '/protected/dashboard'
    ]
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/triage', async (req, res) => {
  const text = req.body?.text;
  if (!validateInput(text)) return res.status(400).json({ error: 'text must be a nonblank string of 1 to 2000 characters' });
  try {
    res.status(200).json(await classify(text));
  } catch (error) {
    res.status(error.status || 502).json({ error: error.status === 422 ? error.message : error.status === 504 ? 'Triage provider timed out; please retry later.' : 'Triage provider is unavailable.' });
  }
});

/* --- Auth Routes --- */

app.post('/auth/signup', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Authentication is unavailable: Supabase is not configured' });
  const { email, password } = req.body;

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: password.trim()
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({
    message: 'User registered successfully',
    user: data.user
  });
});

app.post('/auth/login', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Authentication is unavailable: Supabase is not configured' });
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: password.trim()
  });

  if (error || !data.session) {
    return res.status(401).json({ error: 'Invalid login credentials' });
  }

  return res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: data.user
  });
});

app.post('/auth/logout', authMiddleware, async (req, res) => {
  const { error } = await supabase.auth.signOut(req.token);

  if (error) {
    return res.status(500).json({ error: 'Failed to terminate session' });
  }

  return res.status(204).send();
});

/* --- Public & Protected Routes --- */

app.get('/public/info', (req, res) => {
  res.status(200).json({ message: 'Welcome stranger! This info is public.' });
});

app.get('/protected/profile', authMiddleware, (req, res) => {
  return res.status(200).json({
    id: req.user.id,
    email: req.user.email,
    created_at: req.user.created_at
  });
});

app.get('/protected/dashboard', authMiddleware, (req, res) => {
  return res.status(200).json({
    message: `Welcome to your private dashboard, ${req.user.email}!`,
    user_id: req.user.id
  });
});

/* --- Task Routes --- */

app.get('/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, done FROM tasks ORDER BY id ASC');
    res.status(200).json(result.rows.map(formatTask));
  } catch (err) {
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/tasks/:id', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  try {
    const result = await pool.query('SELECT id, title, done FROM tasks WHERE id = $1', [taskId]);
    const row = result.rows[0];

    if (!row) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }

    res.status(200).json(formatTask(row));
  } catch (err) {
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.post('/tasks', async (req, res) => {
  const { title } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title parameter is required and cannot be empty' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO tasks (title, done) VALUES ($1, false) RETURNING id, title, done',
      [title.trim()]
    );
    res.status(201).json(formatTask(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Failed to insert task' });
  }
});

app.put('/tasks/:id', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const { title, done } = req.body;

  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    return res.status(400).json({ error: 'Title must be a non-empty string' });
  }

  if (done !== undefined && typeof done !== 'boolean') {
    return res.status(400).json({ error: 'Done must be a boolean value' });
  }

  try {
    const existingResult = await pool.query('SELECT id, title, done FROM tasks WHERE id = $1', [taskId]);
    const existingTask = existingResult.rows[0];

    if (!existingTask) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }

    const updatedTitle = title !== undefined ? title.trim() : existingTask.title;
    const updatedDone = done !== undefined ? done : existingTask.done;

    const updateResult = await pool.query(
      'UPDATE tasks SET title = $1, done = $2 WHERE id = $3 RETURNING id, title, done',
      [updatedTitle, updatedDone, taskId]
    );

    res.status(200).json(formatTask(updateResult.rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/tasks/:id', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);

  try {
    const existingResult = await pool.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server executing dynamically on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
});
