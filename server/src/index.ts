import http from 'node:http';
import { createApp } from './app';
import { initSchema, isDatabaseEmpty } from './db';
import { seedDatabase } from './db/seed';
import { initRealtime } from './realtime/io';

initSchema();
if (isDatabaseEmpty()) {
  const started = Date.now();
  seedDatabase();
  console.log(`[db] demo data seeded in ${Date.now() - started} ms`);
}

const app = createApp();
const server = http.createServer(app);
initRealtime(server);

const PORT = Number(process.env.PORT ?? 4000);
server.listen(PORT, () => {
  console.log(`[api] Smart Dispensary running on http://localhost:${PORT}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
