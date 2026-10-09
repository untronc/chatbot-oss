// 毎回のテストの前に、手元の D1 に表を作る
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.LOG, env.TEST_MIGRATIONS);
