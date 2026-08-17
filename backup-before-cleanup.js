// backup-before-cleanup.js
// ============================================================
// Free-tier-friendly safety net: since Supabase's free plan doesn't
// include point-in-time recovery or one-click backups, this dumps
// every row of every table to local JSON files before you run
// clear-demo-data.sql. It uses your project's own service-role key
// (already in .env.local, since the app needs it), so it reads
// through Row Level Security and gets everything — no new tools,
// no paid Supabase features, just your existing dependencies.
//
// This backs up DATA only, not schema (table structure/constraints).
// That's fine here since the cleanup script only deletes rows, it
// never touches table definitions.
//
// HOW TO RUN (from the project root, same place you run npm commands):
//   node backup-before-cleanup.js
//
// Creates a timestamped folder like:
//   db-backups/2026-08-14T12-30-00/aircraft.json
//   db-backups/2026-08-14T12-30-00/students.json
//   ... one file per table ...
//
// If you ever need to undo the cleanup, see restore-from-backup.js.
// ============================================================

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local.\n' +
    '   This script needs the service-role key specifically (not the anon key)\n' +
    '   so it can read tables that have Row Level Security enabled (users, students,\n' +
    '   password_reset_tokens). Check your .env.local against .env.example.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Every table in the app, in no particular order (order doesn't matter
// for a read-only backup — only for the delete/restore scripts).
const TABLES = [
  'aircraft', 'availability', 'exercises', 'flight_records', 'fto_settings',
  'fuel_records', 'general_weather_cache', 'ground_school_classes',
  'ground_school_enrollment', 'ground_school_subjects', 'instructor_roles',
  'instructors', 'login_audit', 'maintenance_records', 'notification_log',
  'password_reset_tokens', 'scheduled_flights', 'sortie_types', 'students',
  'training_programs', 'training_requirements', 'users',
];

async function main() {
  const stamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const outDir = path.join('db-backups', stamp);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Backing up ${TABLES.length} tables to ${outDir}/ ...\n`);

  let totalRows = 0;
  let hadError = false;

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      hadError = true;
      console.error(`  ✗ ${table}: ${error.message}`);
      continue;
    }
    const rows = data || [];
    fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
    totalRows += rows.length;
    console.log(`  ✓ ${table}: ${rows.length} row(s)`);
  }

  console.log(`\nDone. ${totalRows} total rows backed up to ${outDir}/`);
  if (hadError) {
    console.error(
      '\n⚠️  One or more tables failed to back up (see ✗ lines above). Do NOT\n' +
      '   proceed with the cleanup script until every table shows ✓ — fix the\n' +
      '   error (usually a missing/incorrect SUPABASE_SERVICE_KEY) and re-run.'
    );
    process.exit(1);
  } else {
    console.log('All tables backed up successfully. Safe to proceed with clear-demo-data.sql.');
  }
}

main();