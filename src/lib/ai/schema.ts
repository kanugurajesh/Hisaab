import { z } from "zod";

// A tiny schema builder that emits both a zod validator and a JSON schema that
// satisfies Groq strict structured outputs: every property required, nullable
// fields as type unions, additionalProperties false on every object.

type Json = Record<string, unknown>;
export interface Schema<T> {
  json: Json;
  zod: z.ZodType<T>;
}

export const s = {
  string: (description?: string): Schema<string> => ({ json: { type: "string", ...(description && { description }) }, zod: z.string() }),
  number: (description?: string): Schema<number> => ({ json: { type: "number", ...(description && { description }) }, zod: z.number() }),
  boolean: (description?: string): Schema<boolean> => ({ json: { type: "boolean", ...(description && { description }) }, zod: z.boolean() }),
  enum: <const V extends readonly [string, ...string[]]>(values: V, description?: string): Schema<V[number]> => ({
    json: { type: "string", enum: [...values], ...(description && { description }) },
    zod: z.enum(values as unknown as [V[number], ...V[number][]]),
  }),
  nullable: <T>(inner: Schema<T>): Schema<T | null> => {
    const json = { ...inner.json };
    json.type = [json.type as string, "null"];
    if (Array.isArray(json.enum)) json.enum = [...json.enum, null];
    return { json, zod: inner.zod.nullable() };
  },
  array: <T>(items: Schema<T>, description?: string): Schema<T[]> => ({
    json: { type: "array", items: items.json, ...(description && { description }) },
    zod: z.array(items.zod),
  }),
  object: <S extends Record<string, Schema<unknown>>>(shape: S): Schema<{ [K in keyof S]: S[K] extends Schema<infer U> ? U : never }> => {
    const properties: Json = {};
    const zodShape: Record<string, z.ZodTypeAny> = {};
    for (const [k, v] of Object.entries(shape)) {
      properties[k] = v.json;
      zodShape[k] = v.zod;
    }
    return {
      json: { type: "object", properties, required: Object.keys(shape), additionalProperties: false },
      zod: z.object(zodShape) as never,
    };
  },
};
