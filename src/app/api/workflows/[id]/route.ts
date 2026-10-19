import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  return NextResponse.json({ workflow });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  await prisma.workflow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
