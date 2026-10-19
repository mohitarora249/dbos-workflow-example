import "dotenv/config";
import process from "node:process";

function logMemoryUsage() {
  const memory = process.memoryUsage();

  console.log("[Worker Memory]", {
    pid: process.pid,
    rssMB: "Total resident memory used by the worker process, including JavaScript heap, native allocations and other process memory :- " + +(memory.rss / 1024 / 1024).toFixed(2),
    heapUsedMB: "JavaScript heap currently in use :- " + +(memory.heapUsed / 1024 / 1024).toFixed(2),
    heapTotalMB: "JavaScript heap allocated by V8 :- " + +(memory.heapTotal / 1024 / 1024).toFixed(2),
    externalMB: "Memory associated with native objects referenced by JavaScript, including some buffer allocations :- " + +(memory.external / 1024 / 1024).toFixed(2),
  });
}

// Log every 10 seconds
setInterval(logMemoryUsage, 10_000);

// Log immediately at startup
logMemoryUsage();

import { DBOS } from "@dbos-inc/dbos-sdk";
import { Prisma, PrismaClient } from "@prisma/client";
import { workflowDefinitionSchema, type WorkflowDefinition, type WorkflowNode } from "../src/lib/workflow-schema";

const prisma = new PrismaClient();
const appName = process.env.DBOS_APP_NAME;

type WorkflowInput = { runId: string; workflowId: string; definition: unknown; input?: unknown };
type WorkflowOutput = { values: Record<string, unknown>; completedSteps: number };

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function executeNode(runId: string, node: WorkflowNode, values: Record<string, unknown>): Promise<unknown> {
  const stepInput = { ...values };
  const step = await prisma.workflowStepRun.upsert({
    where: { runId_nodeId: { runId, nodeId: node.id } },
    create: { runId, nodeId: node.id, nodeName: node.name, nodeType: node.type, status: "RUNNING", input: jsonValue(stepInput) },
    update: { nodeName: node.name, nodeType: node.type, status: "RUNNING", error: null, finishedAt: null, input: jsonValue(stepInput) },
  });
  try {
    let output: unknown;
    switch (node.type) {
      case "log": {
        const message = String(node.config.message ?? "");
        console.log(`[workflow:${runId}] ${node.name}: ${message}`);
        output = { message, loggedAt: new Date().toISOString() };
        break;
      }
      case "wait": {
        // DBOS.sleep is durable: its wait is checkpointed and does not rely on a long-lived JS timer.
        const seconds = Number(node.config.seconds ?? 1);
        await DBOS.sleep(Math.max(1, Math.min(300, seconds)) * 1000);
        output = { waitedSeconds: seconds };
        break;
      }
      case "set-value": {
        const key = String(node.config.key ?? "result").trim();
        if (!key) throw new Error("Output key cannot be empty.");
        output = { key, value: node.config.value ?? "" };
        break;
      }
      default: throw new Error(`Unsupported node type: ${String((node as { type: string }).type)}`);
    }
    await prisma.workflowStepRun.update({ where: { id: step.id }, data: { status: "SUCCESS", output: jsonValue(output), finishedAt: new Date() } });
    return output;
  } catch (error) {
    await prisma.workflowStepRun.update({ where: { id: step.id }, data: { status: "ERROR", error: error instanceof Error ? error.message : "Step failed", finishedAt: new Date() } }).catch(() => undefined);
    throw error;
  }
}

async function executeUserWorkflow(args: WorkflowInput): Promise<WorkflowOutput> {
  const definition = workflowDefinitionSchema.parse(args.definition) as WorkflowDefinition;
  await prisma.workflowRun.update({ where: { id: args.runId }, data: { status: "PENDING", startedAt: new Date(), error: null } });
  const values: Record<string, unknown> = { input: args.input ?? {} };
  try {
    for (const node of definition.nodes) {
      // The node's durable step name is stable for this immutable workflow definition.
      const output = await DBOS.runStep(() => executeNode(args.runId, node, values), {
        name: `node_${node.id}`,
        retriesAllowed: true,
        maxAttempts: 3,
        intervalSeconds: 1,
        backoffRate: 2,
      });
      if (node.type === "set-value" && typeof output === "object" && output !== null && "key" in output) {
        const item = output as { key: string; value: unknown };
        values[item.key] = item.value;
      } else {
        values[node.id] = output;
      }
    }
    const result = { values, completedSteps: definition.nodes.length };
    await prisma.workflowRun.update({ where: { id: args.runId }, data: { status: "SUCCESS", output: jsonValue(result), finishedAt: new Date(), error: null } });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow failed";
    await prisma.workflowRun.update({ where: { id: args.runId }, data: { status: "ERROR", error: message, finishedAt: new Date() } }).catch(() => undefined);
    throw error;
  }
}

DBOS.setConfig({
  name: appName,
  applicationVersion: "1.0.0",
  systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL,
});

DBOS.registerWorkflow(executeUserWorkflow, { name: "executeUserWorkflow" });

async function main() {
  await DBOS.launch();
  await DBOS.registerQueue("workflow_queue", { workerConcurrency: 5 });
  console.log(`DBOS worker launched for ${appName}; waiting on workflow_queue`);
}

main().catch(async (error) => {
  console.error("DBOS worker failed to start", error);
  await prisma.$disconnect();
  process.exitCode = 1;
});

const shutdown = async () => {
  console.log("Shutting down workflow worker...");
  try { await DBOS.shutdown(); } catch (error) { console.error(error); }
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
