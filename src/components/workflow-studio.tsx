"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, CirclePlay, Clock3, Code2, GitBranch, LoaderCircle, Plus, RefreshCw, Sparkles, Trash2, Workflow as WorkflowIcon, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type NodeType = "log" | "wait" | "set-value";
type Node = { id: string; name: string; type: NodeType; config: Record<string, unknown> };
type Run = { id: string; workflowId: string; status: string; output?: unknown; error?: string | null; createdAt: string; startedAt?: string | null; finishedAt?: string | null; steps?: { id: string; nodeId: string; nodeName: string; nodeType: string; status: string; output?: unknown; error?: string | null }[] };
type Workflow = { id: string; name: string; description: string; version: number; createdAt: string; definition: { version: 1; nodes: Node[] }; runs?: Run[] };

const starterNodes: Node[] = [
  { id: "welcome", name: "Log a message", type: "log", config: { message: "Hello from a durable workflow!" } },
  { id: "pause", name: "Wait briefly", type: "wait", config: { seconds: 2 } },
  { id: "finish", name: "Set result", type: "set-value", config: { key: "result", value: "Workflow completed successfully" } },
];

function statusClasses(status: string) {
  if (["SUCCESS", "COMPLETED"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["ERROR", "CANCELLED", "MAX_RECOVERY_ATTEMPTS_EXCEEDED"].includes(status)) return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}
function humanDate(value?: string | null) { return value ? new Date(value).toLocaleString() : "—"; }

export function WorkflowStudio() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [name, setName] = useState("My first workflow");
  const [description, setDescription] = useState("A simple durable workflow executed by DBOS.");
  const [nodes, setNodes] = useState<Node[]>(starterNodes);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showJson, setShowJson] = useState(false);

  const selected = useMemo(() => workflows.find((item) => item.id === selectedId) ?? null, [workflows, selectedId]);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workflows", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load workflows");
      setWorkflows(data.workflows);
      setSelectedId((current) => current && data.workflows.some((w: Workflow) => w.id === current) ? current : data.workflows[0]?.id ?? null);
    } catch (error) { setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not load workflows" }); }
  }, []);
  const loadRuns = useCallback(async (workflowId: string) => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/runs`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setRuns(data.runs);
    } catch { /* The next polling pass will retry. */ }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selectedId) void loadRuns(selectedId); else setRuns([]); }, [selectedId, loadRuns]);
  useEffect(() => {
    const timer = setInterval(() => { void load(); if (selectedId) void loadRuns(selectedId); }, 2500);
    return () => clearInterval(timer);
  }, [load, loadRuns, selectedId]);

  function updateNode(index: number, patch: Partial<Node>) { setNodes((current) => current.map((node, i) => i === index ? { ...node, ...patch } : node)); }
  function updateConfig(index: number, key: string, value: unknown) { setNodes((current) => current.map((node, i) => i === index ? { ...node, config: { ...node.config, [key]: value } } : node)); }
  function addNode(type: NodeType) {
    const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
    const defaults: Record<NodeType, Record<string, unknown>> = { log: { message: "Hello from DBOS Workflow" }, wait: { seconds: 2 }, "set-value": { key: "result", value: "Done" } };
    setNodes((current) => [...current, { id, name: type === "set-value" ? "Set a value" : type === "wait" ? "Wait" : "Log a message", type, config: defaults[type] }]);
  }
  async function createWorkflow() {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description, definition: { version: 1, nodes } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create workflow");
      await load(); setSelectedId(data.workflow.id); await loadRuns(data.workflow.id);
      setNotice({ type: "success", message: "Workflow saved. You can run it from the workflow list." });
    } catch (error) { setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not create workflow" }); }
    finally { setBusy(false); }
  }
  async function runWorkflow(workflow: Workflow) {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/workflows/${workflow.id}/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: {} }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not enqueue workflow");
      setSelectedId(workflow.id); await loadRuns(workflow.id); await load();
      setNotice({ type: "success", message: `Run queued successfully · ${data.run.id}` });
    } catch (error) { setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not run workflow" }); }
    finally { setBusy(false); }
  }
  async function deleteWorkflow(workflow: Workflow) {
    if (!window.confirm(`Delete “${workflow.name}” and its run history?`)) return;
    try {
      const response = await fetch(`/api/workflows/${workflow.id}`, { method: "DELETE" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not delete workflow");
      await load(); setNotice({ type: "success", message: "Workflow deleted." });
    } catch (error) { setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not delete workflow" }); }
  }

  return <main className="min-h-screen">
    <header className="border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm"><WorkflowIcon size={22}/></div><div><p className="font-semibold tracking-tight">DBOS Workflow</p><p className="text-xs text-zinc-500">Workflow Studio</p></div></div>
        <div className="hidden items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs text-zinc-600 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500"/> PostgreSQL · DBOS durable execution</div>
        <Button variant="outline" size="sm" onClick={() => { void load(); if (selectedId) void loadRuns(selectedId); }}><RefreshCw size={14}/> Refresh</Button>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600"><Sparkles size={14}/> Durable automation</div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Build a workflow. Run it reliably.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Create a small sequence of steps, enqueue it into DBOS, and watch each run progress. Workflow definitions and execution history are stored in PostgreSQL.</p></div><div className="flex gap-2"><Badge className="border-indigo-100 bg-indigo-50 text-indigo-700">{workflows.length} workflows</Badge><Badge className="border-zinc-200 bg-white text-zinc-600">{runs.length} selected runs</Badge></div></div>
      {notice && <div role="status" className={`mb-5 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}><span>{notice.message}</span><button aria-label="Dismiss" onClick={() => setNotice(null)}><XCircle size={16}/></button></div>}
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-6">
          <Card>
            <CardHeader><div className="flex items-center justify-between"><div><CardTitle className="flex items-center gap-2"><Plus size={18} className="text-indigo-600"/> Create a workflow</CardTitle><CardDescription className="mt-2">Compose sequential steps with the visual form.</CardDescription></div><Badge className="border-zinc-200 bg-zinc-50 text-zinc-600">Draft</Badge></div></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="workflow-name">Workflow name</label><Input id="workflow-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100}/></div>
              <div className="space-y-1.5"><label className="text-sm font-medium" htmlFor="workflow-description">Description</label><Textarea id="workflow-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500}/></div>
              <div className="flex items-center justify-between"><p className="text-sm font-medium">Steps <span className="text-zinc-400">({nodes.length}/25)</span></p><button className="text-xs font-medium text-indigo-600 hover:text-indigo-800" onClick={() => setShowJson((v) => !v)}><Code2 size={13} className="mr-1 inline"/>{showJson ? "Hide definition" : "View JSON"}</button></div>
              <div className="space-y-3">
                {nodes.map((node, index) => <div key={node.id} className="rounded-xl border bg-zinc-50/70 p-3">
                  <div className="mb-3 flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-semibold text-indigo-700 shadow-sm">{index + 1}</div><Input aria-label="Step name" value={node.name} onChange={(e) => updateNode(index, { name: e.target.value })} className="h-8 bg-white"/><button aria-label={`Remove ${node.name}`} className="rounded-md p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setNodes((current) => current.filter((_, i) => i !== index))}><Trash2 size={15}/></button></div>
                  <div className="mb-2"><label className="mb-1 block text-xs font-medium text-zinc-500">Action type</label><select value={node.type} onChange={(e) => { const type = e.target.value as NodeType; const defaults: Record<NodeType, Record<string, unknown>> = { log: { message: "Hello from DBOS Workflow" }, wait: { seconds: 2 }, "set-value": { key: "result", value: "Done" } }; updateNode(index, { type, config: defaults[type] }); }} className="h-9 w-full rounded-lg border border-input bg-white px-3 text-sm"><option value="log">Log message</option><option value="wait">Wait (durable sleep)</option><option value="set-value">Set output value</option></select></div>
                  {node.type === "log" && <div><label className="mb-1 block text-xs font-medium text-zinc-500">Message</label><Input value={String(node.config.message ?? "")} onChange={(e) => updateConfig(index, "message", e.target.value)} className="bg-white"/></div>}
                  {node.type === "wait" && <div><label className="mb-1 block text-xs font-medium text-zinc-500">Seconds (1–300)</label><Input type="number" min={1} max={300} value={String(node.config.seconds ?? 1)} onChange={(e) => updateConfig(index, "seconds", Number(e.target.value))} className="bg-white"/></div>}
                  {node.type === "set-value" && <div className="grid gap-2 sm:grid-cols-2"><div><label className="mb-1 block text-xs font-medium text-zinc-500">Output key</label><Input value={String(node.config.key ?? "result")} onChange={(e) => updateConfig(index, "key", e.target.value)} className="bg-white"/></div><div><label className="mb-1 block text-xs font-medium text-zinc-500">Value</label><Input value={String(node.config.value ?? "")} onChange={(e) => updateConfig(index, "value", e.target.value)} className="bg-white"/></div></div>}
                </div>)}
                {nodes.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-zinc-500">Add a step to get started.</div>}
              </div>
              <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => addNode("log")} disabled={nodes.length >= 25}><Plus size={14}/> Log</Button><Button variant="outline" size="sm" onClick={() => addNode("wait")} disabled={nodes.length >= 25}><Plus size={14}/> Wait</Button><Button variant="outline" size="sm" onClick={() => addNode("set-value")} disabled={nodes.length >= 25}><Plus size={14}/> Set value</Button></div>
              {showJson && <pre className="max-h-56 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs leading-5 text-zinc-100">{JSON.stringify({ version: 1, nodes }, null, 2)}</pre>}
              <Button className="w-full" onClick={createWorkflow} disabled={busy || name.trim().length < 2 || nodes.length < 1 || nodes.length > 25}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : <GitBranch size={16}/>} Save workflow</Button>
              <p className="text-xs leading-5 text-zinc-500">This demo supports sequential log, durable wait, and output-value steps. It intentionally does not execute arbitrary user code or external HTTP URLs.</p>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity size={18} className="text-indigo-600"/> Saved workflows</CardTitle><CardDescription>Select a workflow to inspect its runs.</CardDescription></CardHeader><CardContent className="space-y-2">
            {workflows.length === 0 && <div className="rounded-lg border border-dashed p-5 text-center"><WorkflowIcon className="mx-auto mb-2 text-zinc-400" size={24}/><p className="text-sm font-medium">No workflows yet</p><p className="mt-1 text-xs text-zinc-500">Save the starter workflow to begin.</p></div>}
            {workflows.map((workflow) => <div key={workflow.id} className={`rounded-xl border p-3 transition-colors ${selectedId === workflow.id ? "border-indigo-300 bg-indigo-50/50" : "hover:bg-zinc-50"}`}><div className="flex items-start justify-between gap-3"><button className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(workflow.id)}><p className="truncate text-sm font-semibold">{workflow.name}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{workflow.description || "No description"}</p><p className="mt-2 text-[11px] text-zinc-400">v{workflow.version} · {workflow.definition.nodes.length} steps · {humanDate(workflow.createdAt)}</p></button><div className="flex shrink-0 gap-1"><Button size="icon" variant="outline" title="Run workflow" onClick={() => void runWorkflow(workflow)} disabled={busy}><CirclePlay size={16}/></Button><Button size="icon" variant="ghost" title="Delete workflow" onClick={() => void deleteWorkflow(workflow)}><Trash2 size={15}/></Button></div></div></div>)}
          </CardContent></Card>
        </section>
        <section className="space-y-6">
          <Card>
            <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Activity size={18} className="text-indigo-600"/> Execution monitor</CardTitle><CardDescription className="mt-2">{selected ? `Runs for ${selected.name}` : "Select a workflow to view execution history."}</CardDescription></div>{selected && <Button onClick={() => [1, 2, 3, 4, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].map(_ => void runWorkflow(selected))} disabled={busy}><CirclePlay size={16}/> Run now</Button>}</div></CardHeader>
            <CardContent>
              {!selected && <div className="rounded-xl border border-dashed p-10 text-center"><WorkflowIcon className="mx-auto mb-3 text-zinc-300" size={32}/><p className="font-medium">No workflow selected</p><p className="mt-1 text-sm text-zinc-500">Create a workflow or select one from the list.</p></div>}
              {selected && runs.length === 0 && <div className="rounded-xl border border-dashed p-10 text-center"><Clock3 className="mx-auto mb-3 text-zinc-300" size={30}/><p className="font-medium">No runs yet</p><p className="mt-1 text-sm text-zinc-500">Run this workflow to see durable execution in action.</p></div>}
              <div className="space-y-3">{runs.map((run) => <div key={run.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-mono text-xs text-zinc-500">{run.id}</p><p className="mt-1 text-xs text-zinc-400">Created {humanDate(run.createdAt)}</p></div><Badge className={statusClasses(run.status)}>{run.status}</Badge></div>
                {run.error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs leading-5 text-rose-800">{run.error}</p>}
                {run.steps && run.steps.length > 0 && <div className="mt-4 space-y-2">{run.steps.map((step, i) => <div key={step.id} className="flex items-start gap-3 rounded-lg bg-zinc-50 px-3 py-2"><div className="mt-0.5">{step.status === "SUCCESS" ? <CheckCircle2 size={15} className="text-emerald-600"/> : step.status === "ERROR" ? <XCircle size={15} className="text-rose-600"/> : <LoaderCircle size={15} className="animate-spin text-amber-600"/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-medium">{i + 1}. {step.nodeName}</p><span className="text-[10px] uppercase tracking-wide text-zinc-400">{step.nodeType}</span></div>{step.output !== undefined && step.output !== null && <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-4 text-zinc-500">{JSON.stringify(step.output)}</pre>}{step.error && <p className="mt-1 text-xs text-rose-700">{step.error}</p>}</div><span className="text-[10px] text-zinc-400">{step.status}</span></div>)}</div>}
                {run.output !== undefined && run.output !== null && <div className="mt-3"><p className="mb-1 text-xs font-semibold text-zinc-600">Final output</p><pre className="overflow-auto rounded-lg bg-zinc-950 p-3 text-xs leading-5 text-emerald-200">{JSON.stringify(run.output, null, 2)}</pre></div>}
              </div>)}</div>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles size={18} className="text-indigo-600"/> How durability works</CardTitle><CardDescription>This starter keeps the runtime boundary explicit.</CardDescription></CardHeader><CardContent className="space-y-4 text-sm"><div className="flex gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><ArrowRight size={16}/></div><div><p className="font-medium">1. API enqueues a run</p><p className="mt-1 leading-5 text-zinc-500">The Next.js route saves a run record, then uses DBOSClient to enqueue the registered workflow.</p></div></div><div className="flex gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><Clock3 size={16}/></div><div><p className="font-medium">2. Worker executes durable steps</p><p className="mt-1 leading-5 text-zinc-500">DBOS checkpoints each step and durable sleep, so the worker can recover after a restart.</p></div></div><div className="flex gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><CheckCircle2 size={16}/></div><div><p className="font-medium">3. UI reads application run state</p><p className="mt-1 leading-5 text-zinc-500">Prisma stores product-facing run and step records; polling refreshes the dashboard every 2.5 seconds.</p></div></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Production note:</strong> This demo has no authentication or tenant isolation. Add authorization before exposing it publicly. External side effects need idempotency because a provider action and a DBOS checkpoint cannot be committed atomically.</div></CardContent></Card>
        </section>
      </div>
      <footer className="mt-8 flex flex-col gap-2 border-t pt-5 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between"><span>DBOS Workflow · Durable Workflow Starter</span><span className="flex items-center gap-1"><CheckCircle2 size={13}/> Next.js App Router · Prisma · PostgreSQL · DBOS</span></footer>
    </div>
  </main>;
}
