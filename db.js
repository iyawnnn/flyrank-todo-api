import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'tasks.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  )
`);

const countStmt = db.prepare('SELECT COUNT(*) AS count FROM tasks');
const countRow = countStmt.get();

if (countRow.count === 0) {
  const insertStmt = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');
  insertStmt.run('Setup project repository', 1);
  insertStmt.run('Design REST API routing', 0);
  insertStmt.run('Integrate Swagger documentation', 0);
}

export default db;