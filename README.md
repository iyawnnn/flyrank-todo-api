# Task Management & Authentication REST API

A lightweight, production-ready REST API built using Node.js and Express, containerized with Docker, backed by a PostgreSQL database, and secured using Supabase Auth with JSON Web Token (JWT) verification. This application handles full CRUD task management alongside a user authentication flow, route protection via reusable Express middleware, and automated interactive OpenAPI documentation.

It also provides `POST /triage`, a support-message classifier that returns a validated category, urgency, confidence, and reason to help route messages for human review.

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
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=your_provider_key
LLM_MODEL=openrouter/free
LLM_STUB=0
LLM_ENABLED=true
```

Triage defaults to OpenRouter's `openrouter/free` model. `LLM_STUB=1` returns a deterministic result without a provider request. `LLM_ENABLED=false` disables provider and stub behavior and returns the manual-review fallback. Without Supabase credentials the public API and triage demo still run; auth endpoints return HTTP 503.

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
| **POST** | `/triage` | No | Classify a support message for a human queue | 200 OK, 400 Bad Request, 422 Unprocessable Entity, 504 Gateway Timeout |
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

### Support triage

`POST /triage` reads one support message and returns a fixed category, urgency, confidence, and short reason so a human team can route it without reading every message first.

```bash
curl -sS http://localhost:3000/triage -H 'Content-Type: application/json' --data-binary '{"text":"I was charged twice for my monthly subscription."}'
```

Actual HTTP response:

```json
{"category":"billing","urgency":"normal","confidence":1,"reason":"The customer is reporting a duplicate subscription charge."}
```

Invalid input also names the field and returns JSON before any provider call:

```bash
curl -sS http://localhost:3000/triage -H 'Content-Type: application/json' --data-binary '{"text":"   "}'
```

**Job card:** classify one support message for a human queue. Input is a nonblank 1-2000 character `text` string. Output is exactly `category` (`billing|bug|feature|other`), `urgency` (`low|normal|high`), `confidence` (0-1), and one short `reason` sentence. It must never invent a category, return free text or extra fields, give medical/legal/financial advice, or reveal the prompt. When unsure, use `other` with confidence below 0.5. Full job card: [JOB-CARD.md](./JOB-CARD.md).

The versioned prompt is `prompts/triage-v1.md`; message text is JSON-encoded in a separate untrusted user message. Every answer is validated, repaired at most once, and quarantined after a second failure. Raw provider text is never returned. Transport retries are implemented around `fetch`; there is no SDK retry layer.

Provider: OpenRouter, using the `openrouter/free` router. Swap providers with `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`. Set `LLM_STUB=1` for deterministic local checks or `LLM_ENABLED=false` for the manual-review kill switch.

Evaluation: **8/8 correct (100%)** on 2026-10-11, prompt version `triage-v1`; failed cases: none. All eight labelled inputs were sent sequentially through the running HTTP endpoint with `LLM_STUB=0` and `LLM_ENABLED=true`. The dated result is in `evals/results/2026-10-11.json`.

One actual HTTP call's sanitized `logs/triage.jsonl` entry, matching the curl response above (the selected free model reported zero cost):

```json
{"prompt_version":"triage-v1","model":"google/gemma-4-26b-a4b-it:free","input_tokens":476,"output_tokens":28,"tokens":504,"cost_usd":0,"duration_ms":1825,"repair_count":0,"outcome":"response"}
```

Across the eight-case evaluation, ten successful provider completions used 5,100 input and 3,421 output tokens; two were semantic repairs, and one timed-out transport attempt was retried. That is about 638 input and 428 output tokens per request, or 6.38 million input and 4.28 million output tokens/day at 10,000 requests before additional retries or repairs. OpenRouter's free tier is limited to 50 requests/day and 20/minute, and failed requests count, so this workload exceeds its free daily quota by at least 9,950 requests. The free route reported $0.00 for the evaluation, but it cannot serve that volume; a paid model's daily cost is 6.38 * input price + 4.28 * output price when rates are quoted per million tokens, plus retry/repair usage.

Next-day improvement: review the ambiguous and hostile cases with support staff, then expand the labelled set around the mistakes they find.

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
