import { createElement } from "react";
import { expect, test } from "bun:test";
import { registerClientReference, renderToReadableStream } from "react-server-dom-webpack/server.node";

const DirectoryClient = registerClientReference(() => null, "lorelum-directory-client", "default");
const clientManifest = {
  "lorelum-directory-client#default": {
    id: "lorelum-directory-client",
    chunks: [],
    name: "default",
    async: false
  }
};

async function flight(props: Record<string, unknown>): Promise<string> {
  const errors: unknown[] = [];
  const stream = renderToReadableStream(createElement(DirectoryClient, props), clientManifest, {
    onError(error) {
      errors.push(error);
    }
  });
  const output = await new Response(stream).text();
  expect(errors).toEqual([]);
  return output;
}

test("RSC serializes a shared client prop reference once", async () => {
  const members = Array.from({ length: 100 }, (_, index) => `member-${index}`);
  const shared = await flight({ members, alphabeticalMembers: members });
  const copied = await flight({ members, alphabeticalMembers: [...members] });

  const encoder = new TextEncoder();
  expect(encoder.encode(copied).byteLength).toBeGreaterThan(encoder.encode(shared).byteLength + 500);
});
