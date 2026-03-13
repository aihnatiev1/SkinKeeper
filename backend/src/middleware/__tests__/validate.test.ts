import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { validateBody, validateQuery } from "../validate.js";

// Helper to create mock Express request/response/next
function makeMocks(body: unknown = {}, query: unknown = {}) {
  const req = { body, query } as unknown as Request;
  const res = {
    status: (code: number) => {
      res._status = code;
      return res;
    },
    json: (data: unknown) => {
      res._json = data;
      return res;
    },
    _status: 200,
    _json: null as unknown,
  } as unknown as Response & { _status: number; _json: unknown };
  const next = (() => { (next as any)._called = true; }) as NextFunction & { _called?: boolean };
  return { req, res, next };
}

describe("validateBody", () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it("calls next() when body is valid", () => {
    const { req, res, next } = makeMocks({ name: "Alice", age: 25 });
    validateBody(schema)(req, res, next);
    expect((next as any)._called).toBe(true);
    expect((res as any)._status).toBe(200);
  });

  it("returns 400 when required field is missing", () => {
    const { req, res, next } = makeMocks({ name: "Alice" }); // missing age
    validateBody(schema)(req, res, next);
    expect((res as any)._status).toBe(400);
    expect((next as any)._called).toBeUndefined();
  });

  it("returns 400 with error details for invalid type", () => {
    const { req, res, next } = makeMocks({ name: "Alice", age: "not-a-number" });
    validateBody(schema)(req, res, next);
    expect((res as any)._status).toBe(400);
    const json = (res as any)._json;
    expect(json.error).toBe("Validation failed");
    expect(json.details).toBeInstanceOf(Array);
    expect(json.details.length).toBeGreaterThan(0);
  });

  it("returns 400 for empty string in string field", () => {
    const { req, res, next } = makeMocks({ name: "", age: 25 });
    validateBody(schema)(req, res, next);
    expect((res as any)._status).toBe(400);
  });

  it("returns 400 for negative number", () => {
    const { req, res, next } = makeMocks({ name: "Alice", age: -1 });
    validateBody(schema)(req, res, next);
    expect((res as any)._status).toBe(400);
  });

  it("replaces req.body with parsed (validated) data", () => {
    const { req, res, next } = makeMocks({ name: "Alice", age: 25, extra: "ignored" });
    validateBody(schema)(req, res, next);
    expect(req.body).toEqual({ name: "Alice", age: 25 });
    // extra field stripped by zod
  });

  describe("array size limits", () => {
    const arraySchema = z.object({
      items: z.array(z.string()).max(5),
    });

    it("passes when array is within limit", () => {
      const { req, res, next } = makeMocks({ items: ["a", "b"] });
      validateBody(arraySchema)(req, res, next);
      expect((next as any)._called).toBe(true);
    });

    it("returns 400 when array exceeds limit", () => {
      const { req, res, next } = makeMocks({ items: ["a", "b", "c", "d", "e", "f"] });
      validateBody(arraySchema)(req, res, next);
      expect((res as any)._status).toBe(400);
    });
  });
});

describe("validateQuery", () => {
  const schema = z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().max(100).optional(),
  });

  it("calls next() for valid query", () => {
    const { req, res, next } = makeMocks({}, { page: "1", limit: "20" });
    validateQuery(schema)(req, res, next);
    expect((next as any)._called).toBe(true);
  });

  it("coerces string numbers to numbers", () => {
    const { req, res, next } = makeMocks({}, { page: "3" });
    validateQuery(schema)(req, res, next);
    expect((next as any)._called).toBe(true);
    // page should be coerced to number
    expect((req.query as any).page).toBe(3);
  });

  it("returns 400 for value exceeding limit", () => {
    const { req, res, next } = makeMocks({}, { limit: "200" });
    validateQuery(schema)(req, res, next);
    expect((res as any)._status).toBe(400);
  });

  it("passes with no query params when all optional", () => {
    const { req, res, next } = makeMocks({}, {});
    validateQuery(schema)(req, res, next);
    expect((next as any)._called).toBe(true);
  });

  it("returns structured error details on failure", () => {
    const strictSchema = z.object({ required: z.string() });
    const { req, res, next } = makeMocks({}, {}); // missing required
    validateQuery(strictSchema)(req, res, next);
    expect((res as any)._status).toBe(400);
    const json = (res as any)._json;
    expect(json.error).toBe("Validation failed");
    expect(json.details).toBeInstanceOf(Array);
  });
});
