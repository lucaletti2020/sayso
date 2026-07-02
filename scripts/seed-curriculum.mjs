// Seeds the curriculum tables from prisma/data/curriculum.csv (a wide matrix:
// row 0 = industries, row 1 = job titles, rows 2+ = units with a scenario
// title per (industry, job title) column). Idempotent.
//
// Run: node scripts/seed-curriculum.mjs
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const CSV_PATH = path.join(process.cwd(), "prisma/data/curriculum.csv");

function main() {
  const text = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parse(text, { relax_column_count: true });

  const industryRow = rows[0];
  const headerRow = rows[1];
  const unitRows = rows.slice(2);

  // Forward-fill the industry across each industry's block of columns.
  const industries = [];
  let current = "";
  for (let c = 0; c < industryRow.length; c++) {
    const val = (industryRow[c] || "").trim();
    if (val) current = val;
    industries[c] = current;
  }

  const FIRST_ROLE_COL = 5; // cols 0-4 = Unit Number, Level, Grammar, Vocabulary, Functions

  const units = [];
  const scenarios = [];

  for (const r of unitRows) {
    const unitNumber = parseInt((r[0] || "").trim(), 10);
    if (!Number.isFinite(unitNumber)) continue;
    const level = (r[1] || "").trim();
    units.push({
      unitNumber,
      level,
      grammar: (r[2] || "").trim(),
      vocabulary: (r[3] || "").trim(),
      functions: (r[4] || "").trim(),
    });
    for (let c = FIRST_ROLE_COL; c < headerRow.length; c++) {
      const jobTitle = (headerRow[c] || "").trim();
      const industry = (industries[c] || "").trim();
      const scenarioTitle = (r[c] || "").trim();
      if (!jobTitle || !industry || !scenarioTitle) continue;
      scenarios.push({ level, unitNumber, industry, jobTitle, scenarioTitle });
    }
  }

  return { units, scenarios };
}

async function run() {
  const { units, scenarios } = main();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // Clean re-seed each run.
  await pool.query('DELETE FROM "CurriculumScenario"');
  await pool.query('DELETE FROM "CurriculumUnit"');

  for (const u of units) {
    await pool.query(
      `INSERT INTO "CurriculumUnit" (level, "unitNumber", grammar, vocabulary, functions)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (level, "unitNumber") DO UPDATE SET
         grammar=EXCLUDED.grammar, vocabulary=EXCLUDED.vocabulary, functions=EXCLUDED.functions`,
      [u.level, u.unitNumber, u.grammar, u.vocabulary, u.functions]
    );
  }

  // Insert scenarios in batches for speed.
  const BATCH = 200;
  for (let i = 0; i < scenarios.length; i += BATCH) {
    const chunk = scenarios.slice(i, i + BATCH);
    const values = [];
    const params = [];
    chunk.forEach((s, j) => {
      const b = j * 5;
      values.push(`(gen_random_uuid()::text, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`);
      params.push(s.level, s.unitNumber, s.industry, s.jobTitle, s.scenarioTitle);
    });
    await pool.query(
      `INSERT INTO "CurriculumScenario" (id, level, "unitNumber", industry, "jobTitle", "scenarioTitle")
       VALUES ${values.join(",")}
       ON CONFLICT (level, "unitNumber", industry, "jobTitle") DO UPDATE SET
         "scenarioTitle"=EXCLUDED."scenarioTitle"`,
      params
    );
  }

  const u = await pool.query('SELECT count(*) FROM "CurriculumUnit"');
  const s = await pool.query('SELECT count(*) FROM "CurriculumScenario"');
  const inds = await pool.query('SELECT DISTINCT industry FROM "CurriculumScenario" ORDER BY industry');
  console.log("Units:", u.rows[0].count, "| Scenarios:", s.rows[0].count);
  console.log("Industries:", inds.rows.map((r) => r.industry).join(", "));
  await pool.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
