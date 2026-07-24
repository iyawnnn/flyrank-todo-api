import express from 'express';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import db from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

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

app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Task API',
    version: '1.0',
    endpoints: ['/tasks']
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/tasks', (req, res) => {
  const rows = db.prepare('SELECT id, title, done FROM tasks').all();
  res.status(200).json(rows.map(formatTask));
});

app.get('/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(taskId);

  if (!row) {
    return res.status(404).json({ error: `Task ${taskId} not found` });
  }

  res.status(200).json(formatTask(row));
});

app.post('/tasks', (req, res) => {
  const { title } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title parameter is required and cannot be empty' });
  }

  const insertStmt = db.prepare('INSERT INTO tasks (title, done) VALUES (?, 0)');
  const result = insertStmt.run(title.trim());

  const newId = result.lastInsertRowid;
  const newTask = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(newId);

  res.status(201).json(formatTask(newTask));
});

app.put('/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const existingTask = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(taskId);

  if (!existingTask) {
    return res.status(404).json({ error: `Task ${taskId} not found` });
  }

  const { title, done } = req.body;

  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    return res.status(400).json({ error: 'Title must be a non-empty string' });
  }

  if (done !== undefined && typeof done !== 'boolean') {
    return res.status(400).json({ error: 'Done must be a boolean value' });
  }

  const updatedTitle = title !== undefined ? title.trim() : existingTask.title;
  const updatedDone = done !== undefined ? (done ? 1 : 0) : existingTask.done;

  db.prepare('UPDATE tasks SET title = ?, done = ? WHERE id = ?').run(updatedTitle, updatedDone, taskId);

  const updatedRow = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(taskId);
  res.status(200).json(formatTask(updatedRow));
});

app.delete('/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const existingTask = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);

  if (!existingTask) {
    return res.status(404).json({ error: `Task ${taskId} not found` });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`Server executing dynamically on port ${PORT}`);
});