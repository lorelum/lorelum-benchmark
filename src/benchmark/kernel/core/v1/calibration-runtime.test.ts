import { expect, test } from "bun:test";
import { CalibrationPortAllocator } from "./calibration-runtime";

test("allocates an exclusive port with a private base URL and releases it", async () => {
  const allocator = new CalibrationPortAllocator();
  const held = await allocator.allocate();
  expect(held.port).toBeGreaterThan(0);
  expect(held.baseUrl).toBe(`http://127.0.0.1:${held.port}`);
  expect(allocator.heldCount).toBe(1);
  await allocator.release(held);
  expect(allocator.heldCount).toBe(0);
});

test("concurrent allocations receive distinct ports without reuse", async () => {
  const allocator = new CalibrationPortAllocator();
  const held = await Promise.all([allocator.allocate(), allocator.allocate(), allocator.allocate()]);
  const ports = held.map((entry) => entry.port);
  expect(new Set(ports).size).toBe(ports.length);
  expect(allocator.heldCount).toBe(3);
  await allocator.releaseAll();
  expect(allocator.heldCount).toBe(0);
});

test("release fails closed for an unheld port", async () => {
  const allocator = new CalibrationPortAllocator();
  const held = await allocator.allocate();
  await allocator.release(held);
  await expect(allocator.release(held)).rejects.toThrow("is not held");
});

test("releaseAll clears all held ports", async () => {
  const allocator = new CalibrationPortAllocator();
  const held = await Promise.all([allocator.allocate(), allocator.allocate()]);
  await allocator.releaseAll();
  expect(allocator.heldCount).toBe(0);
  // double-release after releaseAll fails closed
  await expect(allocator.release(held[0])).rejects.toThrow("is not held");
});

test("a released port can be bound again outside the allocator", async () => {
  const allocator = new CalibrationPortAllocator();
  const held = await allocator.allocate();
  await allocator.release(held);
  // The kernel no longer holds the socket; an independent bind should succeed,
  // proving the port was actually released (no lingering hold).
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(held.port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});