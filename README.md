# Task Management & Authentication REST API

A lightweight, production-ready REST API built using Node.js and Express, containerized with Docker, backed by a PostgreSQL database, and secured using Supabase Auth with JSON Web Token (JWT) verification. This application handles full CRUD task management alongside a user authentication flow, route protection via reusable Express middleware, and automated interactive OpenAPI documentation.

## Features

* **Authentication & Session Management**: User registration, password authentication, and session termination handled via Supabase Auth.
* **JWT Bearer Token Guard**: Secure endpoint protection using custom Express middleware verifying incoming Bearer tokens.
* **Full CRUD Operations**: Implementations for creating, reading, updating, and deleting tasks persisted directly in PostgreSQL.
* **Containerized Architecture**: Express API and PostgreSQL database run in isolated, orchestration-ready Docker containers.
* **One-Command Execution**: The entire multi-container application stack starts up using Docker Compose.
* **Disk Persistence**: Reliable database storage backed by a named Docker volume (`taskdata`) ensuring data survives container restarts.
* **Interactive API Docs**: Integrated OpenAPI specification served visually via Swagger UI with Bearer Auth padlock authorization.

---

## Technical Architecture

* **Runtime Environment**: Node.js (Alpine Linux container)
* **Application Framework**: Express
* **Identity Provider (IdP)**: Supabase Auth (JWT)
* **Database Engine**: PostgreSQL 16 (Official Docker Image)
* **Container Orchestration**: Docker Compose
* **Documentation Standard**: OpenAPI 3.0.0
* **Data Storage**: Named Docker Volume (`taskdata`)

---

## Environment Variables & Configuration

Sensitive database credentials and Supabase API keys are kept out of version control.

Create a local `.env` file in the project root directory based on `.env.example`:

```env
DATABASE_URL=postgres://postgres:dev@localhost:5432/tasks
PORT=3000
SUPABASE_URL=[https://your-project-id.supabase.co](https://your-project-id.supabase.co)
SUPABASE_KEY=your_supabase_anon_key
```

* env is explicitly ignored by Git to prevent secret exposure.
* .env.example is committed as a template for environment configuration.

## Installation and Setup
Running via Docker Compose
To start the full stack (Express API + PostgreSQL database) with a single command:
```bash
docker compose up --build
```

To stop the containers while preserving volume data:

```bash
docker compose down
```

Running Locally
1. Install project dependencies:
```bash
npm install
```

2. Start the PostgreSQL database container:
```bash
docker start taskdb
```

3. Start the Express server:
```bash
npm start
```

## API Documentation

### Endpoints Overview

| Method | Endpoint | Auth Required | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/` | No | Retrieve API metadata layout | 200 OK |
| **GET** | `/health` | No | Check application operational status | 200 OK |
| **GET** | `/public/info` | No | Read open, unprotected message | 200 OK |
| **POST** | `/auth/signup` | No | Register a new user account via Supabase | 201 Created, 400 Bad Request |
| **POST** | `/auth/login` | No | Authenticate credentials and receive JWT | 200 OK, 400 Bad Request, 401 Unauthorized |
| **POST** | `/auth/logout` | **Bearer JWT** | Terminate active user session | 204 No Content, 401 Unauthorized |
| **GET** | `/protected/profile` | **Bearer JWT** | Fetch authenticated user profile details | 200 OK, 401 Unauthorized |
| **GET** | `/protected/dashboard` | **Bearer JWT** | Fetch authenticated user dashboard message | 200 OK, 401 Unauthorized |
| **GET** | `/tasks` | No | Retrieve all stored tasks from PostgreSQL | 200 OK |
| **GET** | `/tasks/:id` | No | Fetch an individual task by unique numeric ID | 200 OK, 404 Not Found |
| **POST** | `/tasks` | No | Create a new task in PostgreSQL | 201 Created, 400 Bad Request |
| **PUT** | `/tasks/:id` | No | Perform structural updates on a task in PostgreSQL | 200 OK, 400 Bad Request, 404 Not Found |
| **DELETE** | `/tasks/:id` | No | Remove a specific task row from PostgreSQL | 204 No Content, 404 Not Found |

### Interactive Swagger UI Dashboard

The interactive API documentation interface can be viewed directly in your web browser at the following address while the server is running:  
[http://localhost:3000/docs](http://localhost:3000/docs)

To test protected routes in the browser interface:
1. Execute `POST /auth/login` with your credentials to obtain an `access_token`.
2. Click the green **Authorize** button at the top right.
3. Paste the raw token string into the Value box and click **Authorize**.
4. Test requests against `/protected/profile`, `/protected/dashboard`, or `/auth/logout`.

![Interactive Swagger UI documentation dashboard displaying authenticated endpoint authorization.](./assets/task-api-swagger-ui-2.png)

---

## Verification Logs

### Sample Authenticated Profile Response (`GET /protected/profile`)

```http
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 120
ETag: W/"78-T4WvaXF2Z3T9hnUy/aSZL5hXQG8"
Date: Sun, 26 Jul 2026 04:04:57 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{
  "id": "92d2a73d-8cf0-4e55-91c7-a05f2a33fce0",
  "email": "developer@example.com",
  "created_at": "2026-07-26T03:52:01.083695Z"
}
```

## Sample Unauthorized Response (GET /protected/profile)
```http
HTTP/1.1 401 Unauthorized
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 36
Date: Sun, 26 Jul 2026 04:01:11 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{
  "error": "Invalid or expired token"
}
```