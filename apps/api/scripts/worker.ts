import { loadConfig } from "../src/config";
import { createPool } from "../src/db/pool";
import { parseRegions } from "../src/ingestion/regions";
import { startScheduler } from "../src/ingestion/scheduler";

const config = loadConfig();
const db = createPool(config.databaseUrl, 3);
const scheduler = startScheduler({ db, config, regions: parseRegions(), now: () => new Date() });
process.stdout.write(JSON.stringify({ event: "worker_started", ingestion: config.ingestion.enabled }) + "\n");
const stop = () => { scheduler.stop(); void db.end().then(() => process.exit(0)); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
