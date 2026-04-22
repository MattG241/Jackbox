// Dependency-free readiness probe. Parses DATABASE_URL, opens a TCP
// connection to host:port, retries until reachable or times out. This
// lets the service survive Railway's race between Postgres boot and
// the app container trying to push the schema on first deploy.
import net from "node:net";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[wait-for-db] DATABASE_URL is not set.");
  process.exit(1);
}
let host;
let port;
try {
  const u = new URL(url);
  host = u.hostname;
  port = Number(u.port || 5432);
} catch (err) {
  console.error("[wait-for-db] DATABASE_URL is not a valid URL:", err);
  process.exit(1);
}

function tryOnce() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 4000);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

const maxAttempts = 40;
const delayMs = 3000;
for (let i = 1; i <= maxAttempts; i++) {
  if (await tryOnce()) {
    console.log(`[wait-for-db] ${host}:${port} reachable after ${i} attempt(s).`);
    process.exit(0);
  }
  console.log(`[wait-for-db] ${host}:${port} not ready (attempt ${i}/${maxAttempts}).`);
  await new Promise((r) => setTimeout(r, delayMs));
}
console.error(`[wait-for-db] ${host}:${port} unreachable after ${maxAttempts} attempts.`);
process.exit(1);
