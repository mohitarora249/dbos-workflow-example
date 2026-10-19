import { z } from "zod";

export const workflowNodeSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  type: z.enum(["log", "wait", "set-value"]),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const workflowDefinitionSchema = z.object({
  version: z.literal(1),
  nodes: z.array(workflowNodeSchema).min(1).max(25),
}).superRefine((definition, ctx) => {
  const ids = new Set<string>();
  for (const [index, node] of definition.nodes.entries()) {
    if (ids.has(node.id)) ctx.addIssue({ code: "custom", path: ["nodes", index, "id"], message: "Node IDs must be unique." });
    ids.add(node.id);
    if (node.type === "wait") {
      const seconds = Number(node.config.seconds ?? 1);
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > 300) {
        ctx.addIssue({ code: "custom", path: ["nodes", index, "config", "seconds"], message: "Wait duration must be between 1 and 300 seconds." });
      }
    }
  }
});

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(""),
  definition: workflowDefinitionSchema,
});

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
