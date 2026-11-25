/** CLI: `npm run seed` — wipes all data and reloads the demo dataset. */
import { initSchema } from './index';
import { resetDatabase } from './seed';

initSchema();
const started = Date.now();
resetDatabase();
console.log(`[db] demo data reset in ${Date.now() - started} ms`);
