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

app.listen(PORT, () => {
  console.log(`Server executing dynamically on port ${PORT}`);
});