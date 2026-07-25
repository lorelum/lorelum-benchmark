import { createServer } from "node:http";
import { connect } from "node:net";

const allowed = "api.deepseek.com:443";
const server = createServer((_request, response) => {
  response.writeHead(403).end("CONNECT only");
});

server.on("connect", (request, client, head) => {
  if (request.url !== allowed) {
    client.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    client.destroy();
    return;
  }
  const upstream = connect(443, "api.deepseek.com");
  upstream.once("connect", () => {
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) upstream.write(head);
    upstream.pipe(client);
    client.pipe(upstream);
  });
  upstream.once("error", () => client.destroy());
  client.once("error", () => upstream.destroy());
});

server.listen(3128, "0.0.0.0");
