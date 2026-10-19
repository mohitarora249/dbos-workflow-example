import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDBOSClient } from "@/lib/dbos-client";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const run = await prisma.workflowRun.findUnique({ where: { id }, include: { steps: { orderBy: { startedAt: "asc" } }, workflow: { select: { id: true, name: true } } } });
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  // DBOS remains the source of truth for engine status. We mirror the common terminal/running states to product tables.
  try {
    const client = await createDBOSClient();
    try {
      const handle = client.retrieveWorkflow(id);
      const status = await handle.getStatus();
      const engineStatus = status?.status;
      const mapped = engineStatus === "SUCCESS" ? "SUCCESS" : engineStatus === "ERROR" ? "ERROR" : engineStatus === "CANCELLED" ? "CANCELLED" : engineStatus === "MAX_RECOVERY_ATTEMPTS_EXCEEDED" ? "MAX_RECOVERY_ATTEMPTS_EXCEEDED" : engineStatus ? "PENDING" : run.status;
      if (mapped !== run.status) await prisma.workflowRun.update({ where: { id }, data: { status: mapped, ...(mapped === "SUCCESS" || mapped === "ERROR" ? { finishedAt: new Date() } : {}) } });
    } finally { await client.destroy(); }
  } catch (error) { console.warn("DBOS status lookup skipped", error); }
  const fresh = await prisma.workflowRun.findUnique({ where: { id }, include: { steps: { orderBy: { startedAt: "asc" } }, workflow: { select: { id: true, name: true } } } });
  return NextResponse.json({ run: fresh });
}
