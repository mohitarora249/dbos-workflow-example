# DBOS Workflow — DBOS Workflow Starter

A runnable starter for a simple user-defined workflow studio built with **Next.js App Router, API routes, PostgreSQL, Prisma ORM, DBOS, Tailwind CSS v4, and shadcn-style UI components**.

It intentionally uses the DBOS-recommended two-process architecture: Next.js handles the UI/API and enqueues durable workflows; a standalone Node.js worker executes them. Both connect to the same PostgreSQL database. Do not launch DBOS inside Next.js route handlers.

## Features

- Create and persist workflow definitions in PostgreSQL.
- Build sequential workflows with three safe demo actions: log message, durable wait, and set output value.
- Enqueue executions from a Next.js API route using `DBOSClient`.
- Run workflows on a standalone DBOS worker with durable steps and durable sleep.
- Persist product-facing run and per-step history using Prisma.
- Poll the dashboard to view status, step results, and final output.
- Validate definitions with Zod; no arbitrary code execution or arbitrary HTTP URL actions.
- Docker Compose for local PostgreSQL.

## Prerequisites

- Node.js 20+ (Node 22 recommended)
- npm
- Docker Desktop / Docker Engine

## 1. Configure environment

```bash
cp .env.example .env
```

The provided local credentials are for development only. `DATABASE_URL` is used by Prisma. `DBOS_SYSTEM_DATABASE_URL` is used by DBOS's own system tables. They can point at the same local database, as shown here.

## 2. Start PostgreSQL

```bash
docker compose up -d postgres
```

Wait until the health check passes.

## 3. Install dependencies and create the schema

```bash
npm install
npm run db:generate
npm run db:migrate -- --name init
```

A Prisma migration is included in `prisma/migrations/20261019000000_init`. If you want to use the checked-in migration, run `npm run db:deploy` instead of creating a new migration. For local iterative schema changes, use `npm run db:migrate -- --name <change-name>`.

DBOS creates and manages its own system tables in the configured DBOS system database when the worker launches. Do not create or modify those tables through Prisma.

## 4. Start both processes

Terminal A — Next.js web app:

```bash
npm run dev
```

Terminal B — DBOS worker:

```bash
npm run worker:watch
```

Open <http://localhost:3000>.

**Both processes must be running.** If you create a run while the worker is offline, DBOS can leave the run queued until a worker comes back, but the UI will not show progress until execution resumes.

## API routes

- `GET /api/workflows` — list workflows
- `POST /api/workflows` — create a workflow
- `GET /api/workflows/:id` — fetch one workflow
- `DELETE /api/workflows/:id` — delete a workflow and its run history
- `POST /api/workflows/:id/runs` — create a product run and durably enqueue the DBOS workflow
- `GET /api/workflows/:id/runs` — list recent runs and step details
- `GET /api/runs/:id` — fetch a run and reconcile its status with DBOS

Example create request:

```json
{
  "name": "Onboarding example",
  "description": "A small sequential workflow",
  "definition": {
    "version": 1,
    "nodes": [
      { "id": "hello", "name": "Log greeting", "type": "log", "config": { "message": "Hello" } },
      { "id": "wait", "name": "Wait a moment", "type": "wait", "config": { "seconds": 2 } },
      { "id": "done", "name": "Set result", "type": "set-value", "config": { "key": "result", "value": "finished" } }
    ]
  }
}
```

## Architecture notes

- `src/app/api/**` contains Node.js route handlers. API routes use Prisma and `DBOSClient`, never the DBOS worker runtime.
- `worker/index.ts` registers `executeUserWorkflow`, launches DBOS, registers `workflow_queue`, and executes each node inside `DBOS.runStep`.
- `src/lib/workflow-schema.ts` defines the allowlisted node types and validation.
- `Workflow` and `WorkflowRun` are product tables. DBOS's internal execution records are owned by DBOS and are separate from the Prisma schema.
- Workflow definitions are passed as an immutable snapshot to each run. If you later add editing, create a new version instead of mutating a definition used by active runs.
- The `wait` action uses `DBOS.sleep`, which is durable. Do not replace it with a raw `setTimeout` for long waits.
- The worker writes step state to Prisma inside the DBOS step function. For this demo, step names and node IDs are stable for a given saved definition.

## Important production hardening before public launch

This is an end-to-end **starter**, not a multi-tenant production SaaS. It intentionally has no authentication. Before exposing it publicly:

1. Add authentication and organization-scoped authorization to every API route. Add `organizationId` / owner relations to all application models.
2. Add CSRF/origin controls as appropriate for your auth setup, request-size limits, rate limits, audit logs, and secure secret storage.
3. Add immutable `WorkflowVersion` records and pin each run to a specific version. Keep worker code compatible with active workflows during deployments.
4. Use an outbox or a transactionally safe enqueue pattern if you need to atomically create the product run record and DBOS queue entry. As written, the route compensates if enqueueing throws, but the database insert and enqueue are not one transaction.
5. External side effects are not exactly-once just because the workflow is durable. Use provider idempotency keys where supported, deduplicate webhook events, and reconcile ambiguous outcomes.
6. Add retry classification, cancellation, timeouts, secrets management, integration scopes, per-provider rate limits, run retention, structured logs, metrics, and alerts.
7. Use a managed PostgreSQL service with backups and TLS in production. Set separate least-privilege database credentials where practical and tune connection pools.
8. Deploy the worker as a persistent Node.js process or a platform that supports the DBOS worker lifecycle. A typical serverless Next.js process should not be assumed to run background workflows indefinitely.

## Troubleshooting

- **`Unable to enqueue workflow`**: ensure PostgreSQL is up, `DBOS_SYSTEM_DATABASE_URL` is set, and the worker has launched at least once so the queue is registered.
- **Run stays `ENQUEUED`**: start the worker and check its terminal logs.
- **Prisma can't connect**: check `DATABASE_URL`, port 5432, and `docker compose ps`.
- **Worker can't connect to DBOS**: check `DBOS_SYSTEM_DATABASE_URL` and make sure it points to the same system database used by the web process.
- **Dependency/API mismatch**: the DBOS TypeScript SDK evolves; if installing a future major version, verify the current DBOS Next.js guide and adjust the pinned SDK versions intentionally.

## Official references

- DBOS + Next.js: <https://docs.dbos.dev/integrations/nextjs>
- DBOS TypeScript workflows and steps: <https://docs.dbos.dev/typescript/reference/workflows-steps>
- DBOS Client: <https://docs.dbos.dev/typescript/reference/client>
- Prisma: <https://www.prisma.io/docs>
- shadcn/ui: <https://ui.shadcn.com/docs>
