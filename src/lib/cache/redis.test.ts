import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cachedFetch } from "./redis";

const mocks = vi.hoisted(() => ({ getRedis: vi.fn(), warn: vi.fn() }));
vi.mock("@/lib/db/redis", () => ({ getRedis: mocks.getRedis }));
vi.mock("@/lib/telemetry/logger", () => ({ logger: { warn: mocks.warn } }));

const redis = { get: vi.fn(), set: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getRedis.mockResolvedValue(redis);
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue("OK");
});
afterEach(() => vi.useRealTimers());

describe("cachedFetch", () => {
  it("returns a cached value without calling the loader", async () => {
    redis.get.mockResolvedValue('{"value":42}');
    const loader = vi.fn();
    await expect(cachedFetch("key", 30, loader)).resolves.toEqual({
      value: 42,
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it("loads once on a miss and caches the result with its TTL", async () => {
    const loader = vi.fn().mockResolvedValue({ value: 42 });
    await expect(cachedFetch("key", 30, loader)).resolves.toEqual({
      value: 42,
    });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith("key", '{"value":42}', { EX: 30 });
  });

  it("propagates a loader failure once without reporting it as a Redis failure", async () => {
    const failure = new Error("database unavailable");
    const loader = vi.fn().mockRejectedValue(failure);
    await expect(cachedFetch("key", 30, loader)).rejects.toBe(failure);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(mocks.warn).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it.each(["connection", "read", "invalid JSON"])(
    "falls back once after a cache %s failure",
    async (failure) => {
      if (failure === "connection")
        mocks.getRedis.mockRejectedValue(new Error("connection"));
      if (failure === "read") redis.get.mockRejectedValue(new Error("read"));
      if (failure === "invalid JSON") redis.get.mockResolvedValue("not-json");
      const loader = vi.fn().mockResolvedValue(42);
      await expect(cachedFetch("key", 30, loader)).resolves.toBe(42);
      expect(loader).toHaveBeenCalledTimes(1);
      expect(mocks.warn).toHaveBeenCalled();
    },
  );

  it("keeps the loaded value if writing the cache fails", async () => {
    redis.set.mockRejectedValue(new Error("write"));
    const loader = vi.fn().mockResolvedValue(42);
    await expect(cachedFetch("key", 30, loader)).resolves.toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalled();
  });

  it("does not reload when a value cannot be serialized", async () => {
    const value: { self?: unknown } = {};
    value.self = value;
    const loader = vi.fn().mockResolvedValue(value);
    await expect(cachedFetch("key", 30, loader)).resolves.toBe(value);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("falls back when a connection never resolves", async () => {
    vi.useFakeTimers();
    mocks.getRedis.mockReturnValue(new Promise(() => {}));
    const loader = vi.fn().mockResolvedValue(42);
    const result = cachedFetch("key", 30, loader);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the connection timer after a successful connection", async () => {
    vi.useFakeTimers();
    await cachedFetch("key", 30, async () => 42);
    expect(vi.getTimerCount()).toBe(0);
  });
});
