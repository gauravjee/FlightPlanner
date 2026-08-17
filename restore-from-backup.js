// restore-from-backup.js
// ============================================================
// Restores tables from a folder created by backup-before-cleanup.js.
// Only use this if something went wrong and you need to undo the
// cleanup — running it against a folder from a healthy backup will
// re-insert (upsert, matched on `id`) every row that was in it.
//
// HOW TO RUN (from the project root):
//   node restore-from-backup.js db-backups/2026-08-14T12-30-00
//
// (use the actual folder name backup-before-cleanup.js printed when
// you ran it)
//
// This restores tables in an order that respects foreign keys —
// parent/reference tables first, tables that reference them after —
// so you don't hit constraint errors partway through. Restoring a
// table that was never actually deleted is harmless too, it just
// re-upserts the same rows, so it's fine to leave every table in
// RESTORE_ORDER below even if you only need a few of them back.
// ============================================================

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local.');
  process.exit(1);
}

const backupDir = process.argv[2];
if (!backupDir || !fs.existsSync(backupDir)) {
  console.error('❌ Usage: node restore-from-backup.js <path-to-backup-folder>');
  console.error('   e.g.:  node restore-from-backup.js db-backups/2026-08-14T12-30-00');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Parents/reference tables first, then tables that reference them.
const RESTORE_ORDER = [
  'fto_settings', 'training_programs', 'sortie_types', 'exercises',
  'instructor_roles', 'ground_school_subjects',
  'aircraft', 'instructors', 'users', 'students',
  'training_requirements', 'ground_school_classes', 'ground_school_enrollment',
  'scheduled_flights', 'flight_records', 'maintenance_records', 'fuel_records',
  'availability', 'notification_log', 'login_audit', 'password_reset_tokens',
  'general_weather_cache',
];

async function main() {
  console.log(`Restoring from ${backupDir}/ ...\n`);
  let hadError = false;

  for (const table of RESTORE_ORDER) {
    const file = path.join(backupDir, `${table}.json`);
    if (!fs.existsSync(file)) {
      console.log(`  - ${table}: no backup file found, skipping`);
      continue;
    }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (rows.length === 0) {
      console.log(`  - ${table}: 0 rows in backup, nothing to restore`);
      continue;
    }
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) {
      hadError = true;
      console.error(`  ✗ ${table}: ${error.message}`);
    } else {
      console.log(`  ✓ ${table}: restored ${rows.length} row(s)`);
    }
  }

  if (hadError) {
    console.error('\n⚠️  One or more tables failed to restore (see ✗ lines above) — check the error and re-run.');
    process.exit(1);
  } else {
    console.log('\nRestore complete.');
  }
}

main();