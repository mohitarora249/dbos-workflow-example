import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createDBOSClient } from "@/lib/dbos-client";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id: workflowId } = await context.params;
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId }, select: { id: true } });
  if (!workflow) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const runs = await prisma.workflowRun.findMany({ where: { workflowId }, include: { steps: { orderBy: { startedAt: "asc" } } }, orderBy: { createdAt: "desc" }, take: 25 });
  return NextResponse.json({ runs });
}

export async function POST(request: Request, context: Context) {
  const { id: workflowId } = await context.params;
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  let input: unknown = {};
  try { const body = await request.json(); input = body?.input ?? {}; } catch { /* empty body is acceptable */ }
  const runId = randomUUID();
  const run = await prisma.workflowRun.create({ data: { id: runId, workflowId, input: input as Prisma.InputJsonValue, status: "ENQUEUED" } });
  try {
    const client = await createDBOSClient();
    try {
      await client.enqueue({ workflowName: "executeUserWorkflow", queueName: "workflow_queue", workflowID: runId }, { runId, workflowId, definition: workflow.definition, input });
    } finally { await client.destroy(); }
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    console.error("Could not enqueue DBOS workflow", error);
    await prisma.workflowRun.update({ where: { id: runId }, data: { status: "ERROR", error: error instanceof Error ? error.message : "Unable to enqueue workflow", finishedAt: new Date() } });
    return NextResponse.json({ error: "Unable to enqueue workflow. Is the DBOS worker configured and the system database reachable?" }, { status: 503 });
  }
}
