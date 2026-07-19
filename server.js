import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const tasks = [
  { id: 1, title: 'Setup project repository', done: true },
  { id: 2, title: 'Design REST API routing', done: false },
  { id: 3, title: 'Integrate Swagger documentation', done: false }
];

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
  res.status(200).json(tasks);
});

app.get('/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const task = tasks.find(t => t.id === taskId);

  if (!task) {
    return res.status(404).json({ error: `Task ${taskId} not found` });
  }

  res.status(200).json(task);
});

app.post('/tasks', (req, res) => {
  const { title } = req.body;

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Title parameter is required and cannot be empty' });
  }

  // Dynamically calculate the next sequential numeric identifier
  const nextId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;

  const newTask = {
    id: nextId,
    title: title.trim(),
    done: false
  };

  tasks.push(newTask);

  res.status(201).json(newTask);
});

app.listen(PORT, () => {
  console.log(`Server executing dynamically on port ${PORT}`);
});