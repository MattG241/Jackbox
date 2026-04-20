import { createServer } from "http";
import next from "next";
import { parse } from "url";
import { attachSocketServer } from "@/server/socketServer";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

async function main() {
  const app = next({ dev });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => {
    const parsed = parse(req.url || "/", true);
    handle(req, res, parsed);
  });

  attachSocketServer(server);

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`▶ CrowdCircuit ready on http://localhost:${port}  (dev=${dev})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal:", err);
  process.exit(1);
});
