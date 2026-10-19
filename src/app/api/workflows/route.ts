import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWorkflowSchema } from "@/lib/workflow-schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const workflows = await prisma.workflow.findMany({ orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ workflows });
  } catch (error) {
    console.error("GET /api/workflows failed", error);
    return NextResponse.json({ error: "Unable to load workflows. Check database setup." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createWorkflowSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid workflow definition", issues: parsed.error.issues }, { status: 400 });
    const workflow = await prisma.workflow.create({ data: { name: parsed.data.name, description: parsed.data.description, definition: parsed.data.definition } });
    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    console.error("POST /api/workflows failed", error);
    return NextResponse.json({ error: "Unable to create workflow." }, { status: 500 });
  }
}
