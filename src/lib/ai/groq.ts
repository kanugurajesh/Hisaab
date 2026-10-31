import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import type { Schema } from "./schema";

export type ModelKind = "text" | "vision";

export class AiError extends Error {
  constructor(message: string, readonly task: string) {
    super(message);
  }
}

export function isMockMode(): boolean {
  return process.env.AI_MOCK === "true";
}

export function modelFor(kind: ModelKind): string {
  return kind === "vision"
    ? process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b"
    : process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b";
}

let client: Groq | null = null;
function groq(): Groq {
  client ??= new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 2, timeout: 30_000 });
  return client;
}

async function logCall(entry: {
  eventId?: string;
  task: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  ok: boolean;
  error?: string;
}) {
  if (process.env.VITEST) return;
  try {
    const { prisma } = await import("@/lib/db");
    await prisma.aiCall.create({ data: entry });
  } catch {
    // Observability must never break the user flow.
  }
}

export interface StructuredCall<T> {
  task: string;
  kind: ModelKind;
  schemaName: string;
  schema: Schema<T>;
  messages: ChatCompletionMessageParam[];
  eventId?: string;
  /** Deterministic stand-in used when AI_MOCK=true (tests, offline demos). */
  mock: () => T;
  reasoningEffort?: "low" | "medium" | "high";
  temperature?: number;
}

/**
 * One structured LLM call: strict JSON schema on Groq, re-validated with zod,
 * retried once on malformed output, and logged to AiCall for latency/cost tracking.
 */
export async function callStructured<T>(call: StructuredCall<T>): Promise<T> {
  if (isMockMode()) {
    const result = call.schema.zod.parse(call.mock());
    await logCall({ eventId: call.eventId, task: call.task, model: "mock", latencyMs: 0, ok: true });
    return result;
  }

  const model = modelFor(call.kind);
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    try {
      const res = await groq().chat.completions.create({
        model,
        messages: call.messages,
        temperature: call.temperature ?? 0.2,
        ...(call.kind === "text" && { reasoning_effort: call.reasoningEffort ?? "low" }),
        response_format: {
          type: "json_schema",
          json_schema: { name: call.schemaName, strict: true, schema: call.schema.json },
        },
      });
      const content = res.choices[0]?.message?.content ?? "";
      const parsed = call.schema.zod.safeParse(JSON.parse(content));
      await logCall({
        eventId: call.eventId,
        task: call.task,
        model,
        latencyMs: Date.now() - started,
        inputTokens: res.usage?.prompt_tokens,
        outputTokens: res.usage?.completion_tokens,
        ok: parsed.success,
        error: parsed.success ? undefined : parsed.error.message.slice(0, 500),
      });
      if (parsed.success) return parsed.data;
      lastError = `schema validation failed: ${parsed.error.message}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await logCall({ eventId: call.eventId, task: call.task, model, latencyMs: Date.now() - started, ok: false, error: lastError.slice(0, 500) });
    }
  }
  throw new AiError(lastError, call.task);
}
