/**
 * core/v1 - private calibration runtime port allocation.
 *
 * Each calibration role invocation receives an exclusive local TCP port.
 * Allocation atomically binds a listening socket (listen on port 0) and reads
 * the assigned port, so there is no discover-then-bind TOCTOU window. The
 * socket is held until the role completes; a held port is never reused within
 * one runtime. Allocation, release and validation failures fail closed.
 */

import { createServer, type Server } from "node:net";

export type HeldPort = {
  readonly port: number;
  readonly baseUrl: string;
};

const baseUrlHost = "127.0.0.1";

export class CalibrationPortAllocator {
  private readonly held = new Map<number, Server>();

  async allocate(): Promise<HeldPort> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, baseUrlHost, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    const address = server.address();
    if (typeof address !== "object" || address === null || typeof address.port !== "number") {
      server.close();
      throw new Error("Calibration port allocation did not yield a valid port");
    }
    const port = address.port;
    if (this.held.has(port)) {
      server.close();
      throw new Error(`Calibration port ${port} is already held`);
    }
    this.held.set(port, server);
    return { port, baseUrl: `http://${baseUrlHost}:${port}` };
  }

  async release(held: HeldPort): Promise<void> {
    const server = this.held.get(held.port);
    if (!server) throw new Error(`Calibration port ${held.port} is not held`);
    this.held.delete(held.port);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  async releaseAll(): Promise<void> {
    const held = [...this.held.values()];
    this.held.clear();
    await Promise.all(
      held.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  }

  get heldCount(): number {
    return this.held.size;
  }
}