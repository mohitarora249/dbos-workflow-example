CREATE TYPE "WorkflowRunStatus" AS ENUM ('ENQUEUED', 'PENDING', 'SUCCESS', 'ERROR', 'CANCELLED', 'MAX_RECOVERY_ATTEMPTS_EXCEEDED');

CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "definition" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'ENQUEUED',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowStepRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "WorkflowStepRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Workflow_updatedAt_idx" ON "Workflow"("updatedAt");
CREATE INDEX "WorkflowRun_workflowId_createdAt_idx" ON "WorkflowRun"("workflowId", "createdAt");
CREATE INDEX "WorkflowRun_status_createdAt_idx" ON "WorkflowRun"("status", "createdAt");
CREATE UNIQUE INDEX "WorkflowStepRun_runId_nodeId_key" ON "WorkflowStepRun"("runId", "nodeId");
CREATE INDEX "WorkflowStepRun_runId_startedAt_idx" ON "WorkflowStepRun"("runId", "startedAt");

ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowStepRun" ADD CONSTRAINT "WorkflowStepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
