import { createPool } from "../src/db/pool";
import { migrate } from "../src/db/migrate";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is required"); process.exit(2); }
const db = createPool(url, 1);
migrate(db)
  .then((r) => { console.log(JSON.stringify({ event: "migrations", applied: r.applied, alreadyApplied: r.skipped.length })); })
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => db.end());
