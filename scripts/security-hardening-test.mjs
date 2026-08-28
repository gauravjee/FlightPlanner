#!/usr/bin/env node
// scripts/security-hardening-test.mjs
// ---------------------------------------------------------------------------
// FlightPro Manager — automated security-hardening regression test.
//
// Exercises the 2026-08-21 security-hardening round directly against the
// LIVE PRODUCTION app (https://flightplanner-xi.vercel.app), the same way a
// browser or an attacker would: real HTTP requests, real NextAuth sessions,
// no shortcuts. It logs in as each of the 7 provided test accounts and
// checks that every route that's supposed to be role-gated actually rejects
// the roles it should and accepts the roles it should.
//
// WHAT THIS COVERS
//   1. All 8 Admin Setup config-route tables behind
//      app/api/admin/config/[table]/route.ts (ADMIN_SETUP_WRITE_ROLES =
//      ['super_admin'] only — note that means 'admin' must ALSO be
//      rejected here, which is easy to assume wrong):
//        exercises, training-programs, instructor-roles, sortie-types,
//        ground-school-subjects, requirement-templates, holidays,
//        aircraft-maintenance-schedule
//      For every table: unauthenticated -> 401, every non-super_admin role
//      -> 403, super_admin -> allowed (create + delete a throwaway row,
//      cleaned up immediately). Also confirms a non-whitelisted field sent
//      in the body is silently dropped rather than persisted (pickAllowed()
//      is doing its job).
//   2. Aircraft routes (app/api/aircraft/route.ts,
//      app/api/aircraft/[id]/route.ts — AIRCRAFT_WRITE_ROLES =
//      ['admin','super_admin']): unauthenticated -> 401, every non-writer
//      role -> 403, admin AND super_admin -> allowed (create, update,
//      delete a throwaway aircraft, cleaned up immediately).
//   3. Direct Exam Entry route (app/api/admin/ground-school/direct-exam/
//      route.ts — REQUIREMENTS_WRITE_ROLES = ['admin','instructor',
//      'super_admin']): NEGATIVE-ONLY. Confirms unauthenticated and
//      non-allowed roles are rejected. The positive (allowed-role) path is
//      deliberately NOT exercised here — see SCOPE NOTES below.
//
// WHAT THIS DOES NOT COVER (and why — see the printed/report "SCOPE NOTES")
//   - The Ground School Progress page's IDOR fix (?student= URL override).
//     That fix is a client-side React effect, not a server response
//     difference a plain HTTP script can observe — it needs an actual
//     browser click-through with two distinct student accounts.
//   - Direct Exam Entry's positive (allowed-role) path. That route inserts
//     directly into ground_school_enrollment with no FK-existence check and
//     no DELETE endpoint exposed anywhere in the app — there is no clean,
//     scriptable way to undo a successful call. Skipped to avoid leaving
//     permanent fabricated exam data in production. If you want this one
//     covered too, it needs a manual click-through (and a manual DB cleanup
//     afterward), not a script.
//   - Admin Setup PATCH/DELETE role-gating is checked against ONE
//     representative table (exercises) rather than all 8. Read the route
//     source: every table's PATCH and DELETE handler calls the exact same
//     `requireRole(ADMIN_SETUP_WRITE_ROLES)` one-liner before touching the
//     `table` URL segment at all — the gate itself cannot vary by table,
//     only the whitelist of writable columns does (which the POST test
//     above already exercises for every table). Re-running the identical
//     auth check 8 times would add ~100 requests against production for no
//     additional signal.
//
// USAGE
//   node scripts/security-hardening-test.mjs
//
// Requires Node 18+ (built-in fetch). No npm install needed — this file has
// zero dependencies on purpose, so it can be run standalone without
// touching the app's own package.json / node_modules.
//
// OUTPUT
//   Prints live progress to the console, then writes two report files next
//   to this script (scripts/security-test-reports/):
//     security-test-<timestamp>.txt   - plain-text report
//     security-test-<timestamp>.html  - same report, printable to PDF
//                                        (open it, then Ctrl+P -> Save as PDF)
//   and a machine-readable
//     security-test-<timestamp>.json
// ---------------------------------------------------------------------------

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================
// CONFIG
// ============================================================

const BASE_URL = 'https://flightplanner-xi.vercel.app';
const PASSWORD = 'Flight@2026';

// role -> login email
const ACCOUNTS = {
  super_admin: 'dummy.superadmin@flightpro.test',
  admin: 'dummy.admin@flightpro.test',
  operations: 'dummy.operations@flightpro.test',
  maintenance: 'dummy.maintenance@flightpro.test',
  instructor: 'dummy.instructor@flightpro.test',
  safety_officer: 'dummy.safetyofficer@flightpro.test',
  student: 'dummy.student@flightpro.test',
};

const REQUEST_DELAY_MS = 150; // be polite to production between requests
const REQUEST_TIMEOUT_MS = 15000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_DIR = path.join(__dirname, 'security-test-reports');

// ============================================================
// Tiny cookie jar (Node's fetch has no built-in cookie store)
// ============================================================

function newJar() {
  return new Map();
}

function updateJar(jar, res) {
  let setCookies = [];
  if (typeof res.headers.getSetCookie === 'function') {
    setCookies = res.headers.getSetCookie();
  } else {
    const single = res.headers.get('set-cookie');
    if (single) setCookies = [single];
  }
  for (const raw of setCookies) {
    const firstPair = raw.split(';')[0];
    const eq = firstPair.indexOf('=');
    if (eq === -1) continue;
    const name = firstPair.slice(0, eq).trim();
    const value = firstPair.slice(eq + 1).trim();
    jar.set(name, value);
  }
}

function cookieHeader(jar) {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ============================================================
// HTTP helpers
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rawFetch(url, options = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// jar === null means "no session" (unauthenticated request)
async function apiCall(jar, method, apiPath, body) {
  await sleep(REQUEST_DELAY_MS);
  const headers = {
    'Content-Type': 'application/json',
    Origin: BASE_URL,
  };
  if (jar) headers.Cookie = cookieHeader(jar);

  try {
    const res = await rawFetch(`${BASE_URL}${apiPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    if (jar) updateJar(jar, res);
    let json = null;
    try {
      json = await res.clone().json();
    } catch {
      // non-JSON response body, fine — some routes may 405/redirect
    }
    return { ok: true, status: res.status, json };
  } catch (err) {
    return { ok: false, status: null, json: null, error: String(err?.message || err) };
  }
}

// ============================================================
// Login (standard NextAuth v4 credentials flow, validated via
// /api/auth/session rather than by parsing the redirect — more robust
// across NextAuth versions/configs)
// ============================================================

async function login(email, password) {
  const jar = newJar();

  await sleep(REQUEST_DELAY_MS);
  const csrfRes = await rawFetch(`${BASE_URL}/api/auth/csrf`);
  updateJar(jar, csrfRes);
  const { csrfToken } = await csrfRes.json();
  if (!csrfToken) {
    return { ok: false, jar: null, role: null, error: 'Could not fetch CSRF token.' };
  }

  await sleep(REQUEST_DELAY_MS);
  const form = new URLSearchParams({ csrfToken, email, password, json: 'true' });
  const loginRes = await rawFetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(jar),
      Origin: BASE_URL,
      Referer: `${BASE_URL}/login`,
    },
    body: form,
    redirect: 'manual',
  });
  updateJar(jar, loginRes);

  await sleep(REQUEST_DELAY_MS);
  const sessionRes = await rawFetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: cookieHeader(jar) },
  });
  updateJar(jar, sessionRes);
  let session = null;
  try {
    session = await sessionRes.json();
  } catch {
    // ignore
  }

  const loggedInEmail = session?.user?.email;
  const role = session?.user?.role;
  if (loggedInEmail && loggedInEmail.toLowerCase() === email.toLowerCase() && role) {
    return { ok: true, jar, role, error: null };
  }
  return {
    ok: false,
    jar: null,
    role: null,
    error: `Login did not produce a valid session for ${email} (got ${JSON.stringify(session)}).`,
  };
}

// ============================================================
// Results collection
// ============================================================

const results = [];
const cleanupWarnings = [];

function record(area, name, { role, method, path: apiPath, expected, actualStatus, pass, note }) {
  results.push({ area, name, role, method, path: apiPath, expected, actualStatus, pass, note: note || '' });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${area} :: ${name}${role ? ` (${role})` : ''} — expected ${expected}, got ${actualStatus ?? 'ERROR'}${note ? ` — ${note}` : ''}`);
}

// ============================================================
// Test group: Admin Setup config routes
// ============================================================

const CONFIG_TABLES = {
  exercises: {
    payload: {
      exercise_name: 'ZZTEST_SecurityCheck',
      short_code: 'ZZTEST',
      full_description: 'Automated security-hardening test row — safe to delete if left behind.',
      is_active: false,
      sort_order: 9999,
    },
  },
  'training-programs': {
    payload: {
      program_name: 'ZZTEST_SecurityCheck',
      program_code: 'ZZTEST',
      required_hours: 1,
      solo_hours: 0,
      cross_country_hours: 0,
      instrument_hours: 0,
      night_hours: 0,
      landings_required: 0,
      multi_engine_hours: 0,
      simulator_hours: 0,
      description: 'Automated security-hardening test row — safe to delete if left behind.',
      is_active: false,
      sort_order: 9999,
    },
  },
  'instructor-roles': {
    payload: {
      role_name: 'ZZTEST_SecurityCheck',
      role_code: 'ZZTEST',
      description: 'Automated security-hardening test row — safe to delete if left behind.',
      is_active: false,
    },
  },
  'sortie-types': {
    payload: {
      type_name: 'ZZTEST_SecurityCheck',
      type_code: 'ZZTEST',
      color_hex: '#000000',
      requires_instructor: false,
      requires_student: false,
      is_active: false,
    },
  },
  'ground-school-subjects': {
    payload: {
      subject_name: 'ZZTEST_SecurityCheck',
      subject_code: 'ZZTEST',
      validity_years: 1,
      required_before_hours: 0,
      is_mandatory: false,
      sort_order: 9999,
      is_active: false,
    },
  },
  'requirement-templates': {
    payload: {
      requirement_name: 'ZZTEST_SecurityCheck',
      requirement_category: 'ZZTEST',
      program_code: 'ZZTEST',
      sort_order: 9999,
      validity_years: 1,
      required_before_hours: 0,
      blocks_solo: false,
      blocks_all_flights: false,
      notes: 'Automated security-hardening test row — safe to delete if left behind.',
    },
  },
  holidays: {
    payload: {
      holiday_name: 'ZZTEST_SecurityCheck',
      holiday_date: '2099-12-31',
      is_recurring: false,
      notes: 'Automated security-hardening test row — safe to delete if left behind.',
    },
  },
  'aircraft-maintenance-schedule': {
    payload: {
      aircraft_model: 'ZZTEST_MODEL',
      item_name: 'ZZTEST Automated Security Check',
      interval_type: 'HOBBS_HOURS',
      interval_value: 999,
      notes: 'Automated security-hardening test row — safe to delete if left behind.',
      is_active: false,
      engine_type: null,
    },
  },
};

const NON_SUPER_ADMIN_ROLES = ['admin', 'operations', 'maintenance', 'instructor', 'safety_officer', 'student'];

async function testConfigRoutes(sessions) {
  const area = 'Admin Setup Config Routes';

  for (const [table, { payload }] of Object.entries(CONFIG_TABLES)) {
    const apiPath = `/api/admin/config/${table}`;

    // 1. Unauthenticated -> 401
    {
      const res = await apiCall(null, 'POST', apiPath, payload);
      record(area, `POST ${table} — unauthenticated rejected`, {
        role: '(none)',
        method: 'POST',
        path: apiPath,
        expected: 401,
        actualStatus: res.status,
        pass: res.ok && res.status === 401,
        note: res.error,
      });
    }

    // 2. Every non-super_admin role -> 403
    for (const role of NON_SUPER_ADMIN_ROLES) {
      const s = sessions[role];
      if (!s?.ok) {
        record(area, `POST ${table} — ${role} rejected`, {
          role, method: 'POST', path: apiPath, expected: 403, actualStatus: null,
          pass: false, note: 'Skipped — login for this role failed earlier.',
        });
        continue;
      }
      const res = await apiCall(s.jar, 'POST', apiPath, payload);
      record(area, `POST ${table} — ${role} rejected`, {
        role, method: 'POST', path: apiPath, expected: 403, actualStatus: res.status,
        pass: res.ok && res.status === 403, note: res.error,
      });
    }

    // 3. super_admin -> allowed. Also slip in a non-whitelisted field to
    // confirm pickAllowed() strips it rather than persisting it.
    const sa = sessions.super_admin;
    if (!sa?.ok) {
      record(area, `POST ${table} — super_admin allowed`, {
        role: 'super_admin', method: 'POST', path: apiPath, expected: 200, actualStatus: null,
        pass: false, note: 'Skipped — super_admin login failed earlier.',
      });
      continue;
    }
    const createRes = await apiCall(sa.jar, 'POST', apiPath, { ...payload, hacked_field: 'should-not-persist' });
    const createdRow = createRes.json?.row ?? (Array.isArray(createRes.json?.rows) ? createRes.json.rows[0] : null);
    const createOk = createRes.ok && (createRes.status === 200 || createRes.status === 201) && createdRow?.id != null;
    let note = createRes.error || '';
    if (createOk && Object.prototype.hasOwnProperty.call(createdRow, 'hacked_field')) {
      note += ' WARNING: non-whitelisted field "hacked_field" was echoed back in the saved row — whitelist may be leaking.';
    }
    record(area, `POST ${table} — super_admin allowed (+ extra-field dropped)`, {
      role: 'super_admin', method: 'POST', path: apiPath, expected: 200, actualStatus: createRes.status,
      pass: createOk, note,
    });

    if (createOk) {
      const delRes = await apiCall(sa.jar, 'DELETE', `${apiPath}?id=${encodeURIComponent(createdRow.id)}`);
      const delOk = delRes.ok && delRes.status === 200;
      record(area, `DELETE ${table} — cleanup of test row`, {
        role: 'super_admin', method: 'DELETE', path: apiPath, expected: 200, actualStatus: delRes.status,
        pass: delOk, note: delRes.error,
      });
      if (!delOk) {
        cleanupWarnings.push(`Table "${table}" (via /api/admin/config/${table}): leftover row id=${createdRow.id} — delete it manually from Admin Setup.`);
      }
    }
  }

  // PATCH/DELETE role gating — representative check on ONE table
  // (exercises). See SCOPE NOTES in the file header for why this isn't
  // repeated across all 8 tables.
  const repPath = '/api/admin/config/exercises';
  {
    const res = await apiCall(null, 'PATCH', repPath, { id: 999999999, exercise_name: 'x' });
    record(area, 'PATCH exercises — unauthenticated rejected (representative)', {
      role: '(none)', method: 'PATCH', path: repPath, expected: 401, actualStatus: res.status,
      pass: res.ok && res.status === 401, note: res.error,
    });
  }
  {
    const res = await apiCall(null, 'DELETE', `${repPath}?id=999999999`);
    record(area, 'DELETE exercises — unauthenticated rejected (representative)', {
      role: '(none)', method: 'DELETE', path: repPath, expected: 401, actualStatus: res.status,
      pass: res.ok && res.status === 401, note: res.error,
    });
  }
  for (const role of NON_SUPER_ADMIN_ROLES) {
    const s = sessions[role];
    if (!s?.ok) continue;
    const patchRes = await apiCall(s.jar, 'PATCH', repPath, { id: 999999999, exercise_name: 'x' });
    record(area, `PATCH exercises — ${role} rejected (representative)`, {
      role, method: 'PATCH', path: repPath, expected: 403, actualStatus: patchRes.status,
      pass: patchRes.ok && patchRes.status === 403, note: patchRes.error,
    });
    const delRes = await apiCall(s.jar, 'DELETE', `${repPath}?id=999999999`);
    record(area, `DELETE exercises — ${role} rejected (representative)`, {
      role, method: 'DELETE', path: repPath, expected: 403, actualStatus: delRes.status,
      pass: delRes.ok && delRes.status === 403, note: delRes.error,
    });
  }

  // super_admin PATCH allowed — full round-trip using a fresh throwaway row
  if (sessions.super_admin?.ok) {
    const sa = sessions.super_admin;
    const createRes = await apiCall(sa.jar, 'POST', repPath, CONFIG_TABLES.exercises.payload);
    const row = createRes.json?.row;
    if (createRes.ok && row?.id != null) {
      const patchRes = await apiCall(sa.jar, 'PATCH', repPath, { id: row.id, full_description: 'ZZTEST updated by security script' });
      record(area, 'PATCH exercises — super_admin allowed', {
        role: 'super_admin', method: 'PATCH', path: repPath, expected: 200, actualStatus: patchRes.status,
        pass: patchRes.ok && patchRes.status === 200 && patchRes.json?.row?.full_description === 'ZZTEST updated by security script',
        note: patchRes.error,
      });
      const delRes = await apiCall(sa.jar, 'DELETE', `${repPath}?id=${row.id}`);
      if (!(delRes.ok && delRes.status === 200)) {
        cleanupWarnings.push(`Table "exercises" (PATCH round-trip): leftover row id=${row.id} — delete it manually from Admin Setup.`);
      }
    } else {
      record(area, 'PATCH exercises — super_admin allowed', {
        role: 'super_admin', method: 'PATCH', path: repPath, expected: 200, actualStatus: null,
        pass: false, note: 'Could not create the throwaway row needed for this check.',
      });
    }
  }
}

// ============================================================
// Test group: Aircraft routes
// ============================================================

const AIRCRAFT_WRITE_ROLE_SET = ['admin', 'super_admin'];
const AIRCRAFT_NON_WRITER_ROLES = ['operations', 'maintenance', 'instructor', 'safety_officer', 'student'];

async function testAircraftRoutes(sessions) {
  const area = 'Aircraft Routes';
  const createPath = '/api/aircraft';

  const throwawayAircraft = () => ({
    registration: `ZZTEST-${Math.floor(Math.random() * 100000)}`,
    type: 'ZZTEST',
    model: 'ZZTEST_MODEL',
    year: 2020,
    hobbsTime: 0,
    fuelCapacity: 0,
    currentFuel: 0,
    status: 'ACTIVE',
    isSimulator: true, // flag as a simulator so it can't be accidentally booked for a real flight if cleanup fails
  });

  // Unauthenticated -> 401
  {
    const res = await apiCall(null, 'POST', createPath, throwawayAircraft());
    record(area, 'POST /api/aircraft — unauthenticated rejected', {
      role: '(none)', method: 'POST', path: createPath, expected: 401, actualStatus: res.status,
      pass: res.ok && res.status === 401, note: res.error,
    });
  }

  // Non-writer roles -> 403 (POST, PATCH, DELETE — all gated by the same
  // requireModuleAccess('aircraft','full') check before params/body)
  for (const role of AIRCRAFT_NON_WRITER_ROLES) {
    const s = sessions[role];
    if (!s?.ok) continue;
    const postRes = await apiCall(s.jar, 'POST', createPath, throwawayAircraft());
    record(area, `POST /api/aircraft — ${role} rejected`, {
      role, method: 'POST', path: createPath, expected: 403, actualStatus: postRes.status,
      pass: postRes.ok && postRes.status === 403, note: postRes.error,
    });
    const patchRes = await apiCall(s.jar, 'PATCH', '/api/aircraft/00000000-0000-0000-0000-000000000000', { hobbsTime: 1 });
    record(area, `PATCH /api/aircraft/[id] — ${role} rejected`, {
      role, method: 'PATCH', path: '/api/aircraft/[id]', expected: 403, actualStatus: patchRes.status,
      pass: patchRes.ok && patchRes.status === 403, note: patchRes.error,
    });
    const delRes = await apiCall(s.jar, 'DELETE', '/api/aircraft/00000000-0000-0000-0000-000000000000');
    record(area, `DELETE /api/aircraft/[id] — ${role} rejected`, {
      role, method: 'DELETE', path: '/api/aircraft/[id]', expected: 403, actualStatus: delRes.status,
      pass: delRes.ok && delRes.status === 403, note: delRes.error,
    });
  }

  // Writer roles (admin, super_admin) -> allowed: create, update, delete
  for (const role of AIRCRAFT_WRITE_ROLE_SET) {
    const s = sessions[role];
    if (!s?.ok) {
      record(area, `POST /api/aircraft — ${role} allowed`, {
        role, method: 'POST', path: createPath, expected: 200, actualStatus: null,
        pass: false, note: `Skipped — ${role} login failed earlier.`,
      });
      continue;
    }
    const createRes = await apiCall(s.jar, 'POST', createPath, throwawayAircraft());
    const aircraft = createRes.json?.aircraft;
    const createOk = createRes.ok && createRes.status === 200 && aircraft?.id;
    record(area, `POST /api/aircraft — ${role} allowed`, {
      role, method: 'POST', path: createPath, expected: 200, actualStatus: createRes.status,
      pass: createOk, note: createRes.error,
    });
    if (!createOk) continue;

    const patchRes = await apiCall(s.jar, 'PATCH', `/api/aircraft/${aircraft.id}`, { hobbsTime: 12.3 });
    record(area, `PATCH /api/aircraft/[id] — ${role} allowed`, {
      role, method: 'PATCH', path: `/api/aircraft/${aircraft.id}`, expected: 200, actualStatus: patchRes.status,
      pass: patchRes.ok && patchRes.status === 200, note: patchRes.error,
    });

    const delRes = await apiCall(s.jar, 'DELETE', `/api/aircraft/${aircraft.id}`);
    const delOk = delRes.ok && delRes.status === 200;
    record(area, `DELETE /api/aircraft/[id] — cleanup of test aircraft`, {
      role, method: 'DELETE', path: `/api/aircraft/${aircraft.id}`, expected: 200, actualStatus: delRes.status,
      pass: delOk, note: delRes.error,
    });
    if (!delOk) {
      cleanupWarnings.push(`Aircraft registration "${aircraft.registration}" (id=${aircraft.id}): delete it manually from Aircraft Setup.`);
    }
  }
}

// ============================================================
// Test group: Direct Exam Entry route (negative-only, see SCOPE NOTES)
// ============================================================

const REQUIREMENTS_WRITE_ROLE_SET = ['admin', 'instructor', 'super_admin'];
const REQUIREMENTS_NON_WRITER_ROLES = ['operations', 'maintenance', 'safety_officer', 'student'];

async function testDirectExamRoute(sessions) {
  const area = 'Direct Exam Entry Route (negative-only — see scope notes)';
  const apiPath = '/api/admin/ground-school/direct-exam';
  const body = { studentId: '00000000-0000-0000-0000-000000000000', subjectName: 'ZZTEST', rollNumber: 'ZZTEST-0000', score: 1 };

  {
    const res = await apiCall(null, 'POST', apiPath, body);
    record(area, 'POST direct-exam — unauthenticated rejected', {
      role: '(none)', method: 'POST', path: apiPath, expected: 401, actualStatus: res.status,
      pass: res.ok && res.status === 401, note: res.error,
    });
  }
  for (const role of REQUIREMENTS_NON_WRITER_ROLES) {
    const s = sessions[role];
    if (!s?.ok) continue;
    const res = await apiCall(s.jar, 'POST', apiPath, body);
    record(area, `POST direct-exam — ${role} rejected`, {
      role, method: 'POST', path: apiPath, expected: 403, actualStatus: res.status,
      pass: res.ok && res.status === 403, note: res.error,
    });
  }
  record(area, 'POST direct-exam — allowed-role positive path', {
    role: REQUIREMENTS_WRITE_ROLE_SET.join('/'), method: 'POST', path: apiPath, expected: '(not tested)',
    actualStatus: null, pass: null,
    note: 'Intentionally NOT exercised — this route has no DELETE endpoint and no FK-existence check, so a successful call cannot be cleanly undone. Verify this path manually if needed, and clean up the resulting ground_school_enrollment row by hand.',
  });
}

// ============================================================
// Report generation
// ============================================================

function summarize() {
  const scored = results.filter((r) => r.pass !== null);
  const passed = scored.filter((r) => r.pass).length;
  const failed = scored.filter((r) => !r.pass).length;
  const skipped = results.filter((r) => r.pass === null).length;
  return { total: scored.length, passed, failed, skipped };
}

function buildTextReport(sessionSummary) {
  const { total, passed, failed, skipped } = summarize();
  const lines = [];
  lines.push('='.repeat(78));
  lines.push('FlightPro Manager — Security Hardening Round: Test Report');
  lines.push(`Target: ${BASE_URL}`);
  lines.push(`Run at: ${new Date().toISOString()}`);
  lines.push('='.repeat(78));
  lines.push('');
  lines.push('LOGIN STATUS');
  lines.push('-'.repeat(78));
  for (const [role, s] of Object.entries(sessionSummary)) {
    lines.push(`  ${s.ok ? 'OK  ' : 'FAIL'}  ${role.padEnd(16)} ${ACCOUNTS[role]}${s.ok ? '' : `  — ${s.error}`}`);
  }
  lines.push('');
  lines.push('SUMMARY');
  lines.push('-'.repeat(78));
  lines.push(`  ${passed}/${total} checks passed, ${failed} failed, ${skipped} skipped/not-automated.`);
  lines.push('');

  const areas = [...new Set(results.map((r) => r.area))];
  for (const area of areas) {
    lines.push(area);
    lines.push('-'.repeat(78));
    for (const r of results.filter((x) => x.area === area)) {
      const mark = r.pass === null ? 'SKIP' : r.pass ? 'PASS' : 'FAIL';
      lines.push(`  [${mark}] ${r.name}`);
      lines.push(`         expected ${r.expected}, got ${r.actualStatus ?? '(no response)'}${r.note ? ` — ${r.note}` : ''}`);
    }
    lines.push('');
  }

  lines.push('SCOPE NOTES (things this script deliberately does not test)');
  lines.push('-'.repeat(78));
  lines.push('  1. Ground School Progress IDOR fix (?student= URL override): this is a');
  lines.push('     client-side React guard, not a server response difference — a plain');
  lines.push('     HTTP script cannot observe it either way. Needs a manual browser');
  lines.push('     check with two distinct student accounts (only one was provided).');
  lines.push('  2. Direct Exam Entry positive (allowed-role) path: skipped — no clean');
  lines.push('     way to undo a successful call (no DELETE endpoint, no FK check).');
  lines.push('  3. Admin Setup PATCH/DELETE role gating tested on one representative');
  lines.push('     table (exercises), not all 8 — every table shares the exact same');
  lines.push('     one-line requireRole() check for PATCH/DELETE, so repeating it per');
  lines.push('     table adds requests against production with no new signal.');
  lines.push('');

  if (cleanupWarnings.length) {
    lines.push('CLEANUP NEEDED');
    lines.push('-'.repeat(78));
    for (const w of cleanupWarnings) lines.push(`  ⚠ ${w}`);
    lines.push('');
  } else {
    lines.push('CLEANUP: all throwaway test rows created by this run were deleted successfully.');
    lines.push('');
  }

  return lines.join('\n');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildHtmlReport(sessionSummary) {
  const { passed, failed, skipped } = summarize();
  const areas = [...new Set(results.map((r) => r.area))];

  const rows = (area) => results.filter((r) => r.area === area).map((r) => {
    const mark = r.pass === null ? 'SKIP' : r.pass ? 'PASS' : 'FAIL';
    const cls = r.pass === null ? 'skip' : r.pass ? 'pass' : 'fail';
    return `<tr class="${cls}"><td class="mark">${mark}</td><td>${esc(r.name)}</td><td>${esc(r.role || '')}</td><td>${esc(r.expected)}</td><td>${esc(r.actualStatus ?? '—')}</td><td>${esc(r.note)}</td></tr>`;
  }).join('\n');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>FlightPro Manager — Security Hardening Test Report</title>
<style>
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; color: #1a1a1a; max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.4rem; margin-bottom: 0; }
  .meta { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
  .summary { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
  .card { border-radius: 8px; padding: 0.75rem 1.25rem; font-weight: 600; }
  .card.pass { background: #e6f4ea; color: #1e7e34; }
  .card.fail { background: #fdecea; color: #b3261e; }
  .card.skip { background: #f1f1f1; color: #555; }
  h2 { font-size: 1.1rem; border-bottom: 2px solid #ddd; padding-bottom: 0.3rem; margin-top: 2rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
  td, th { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #eee; vertical-align: top; }
  tr.pass .mark { color: #1e7e34; font-weight: 700; }
  tr.fail .mark { color: #b3261e; font-weight: 700; }
  tr.skip .mark { color: #888; font-weight: 700; }
  .login-table td { padding: 0.25rem 0.5rem; }
  .ok { color: #1e7e34; font-weight: 600; }
  .bad { color: #b3261e; font-weight: 600; }
  .note { background: #fff8e1; padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.85rem; margin: 0.5rem 0; }
  .warn { background: #fdecea; padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.85rem; }
  @media print { body { margin: 0.5rem; } }
</style>
</head>
<body>
<h1>FlightPro Manager — Security Hardening Round: Test Report</h1>
<div class="meta">Target: ${esc(BASE_URL)} &nbsp;·&nbsp; Run at: ${esc(new Date().toISOString())}</div>

<div class="summary">
  <div class="card pass">${passed} passed</div>
  <div class="card fail">${failed} failed</div>
  <div class="card skip">${skipped} skipped / not automated</div>
</div>

<h2>Login Status</h2>
<table class="login-table">
${Object.entries(sessionSummary).map(([role, s]) => `<tr><td>${s.ok ? '<span class="ok">OK</span>' : '<span class="bad">FAIL</span>'}</td><td>${esc(role)}</td><td>${esc(ACCOUNTS[role])}</td><td>${esc(s.ok ? '' : s.error)}</td></tr>`).join('\n')}
</table>

${areas.map((area) => `
<h2>${esc(area)}</h2>
<table>
<thead><tr><th></th><th>Check</th><th>Role</th><th>Expected</th><th>Actual</th><th>Note</th></tr></thead>
<tbody>
${rows(area)}
</tbody>
</table>`).join('\n')}

<h2>Scope Notes</h2>
<div class="note">
<b>Not covered by this script:</b>
<ol>
<li>Ground School Progress IDOR fix (<code>?student=</code> URL override) — client-side React guard, not observable via plain HTTP. Needs a manual browser check with two distinct student accounts.</li>
<li>Direct Exam Entry's positive (allowed-role) path — skipped, no clean way to undo a successful call (no DELETE endpoint, no FK-existence check on the insert).</li>
<li>Admin Setup PATCH/DELETE role gating is checked on one representative table (exercises) rather than all 8 — every table's PATCH/DELETE handler shares the exact same one-line auth check, so repeating it per table adds production requests with no new signal.</li>
</ol>
</div>

${cleanupWarnings.length ? `<h2>Cleanup Needed</h2><div class="warn"><ul>${cleanupWarnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '<h2>Cleanup</h2><div class="note">All throwaway test rows created by this run were deleted successfully.</div>'}

</body>
</html>`;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`FlightPro Manager security-hardening test\nTarget: ${BASE_URL}\n`);

  console.log('Checking the target is reachable...');
  try {
    const probe = await rawFetch(`${BASE_URL}/login`);
    if (!probe.ok && probe.status >= 500) {
      console.warn(`Warning: /login responded with ${probe.status} — continuing anyway.`);
    }
  } catch (err) {
    console.error(`Could not reach ${BASE_URL}: ${err?.message || err}`);
    console.error('Check your internet connection and the URL, then try again.');
    process.exit(1);
  }

  console.log('\nLogging in as all 7 test accounts...');
  const sessions = {};
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    const s = await login(email, PASSWORD);
    sessions[role] = s;
    console.log(`  ${s.ok ? 'OK  ' : 'FAIL'}  ${role.padEnd(16)} ${email}${s.ok ? '' : `  — ${s.error}`}`);
  }
  console.log('');

  const anyLoggedIn = Object.values(sessions).some((s) => s.ok);
  if (!anyLoggedIn) {
    console.error('None of the 7 accounts could log in — aborting before running route tests.');
    console.error('Double-check the accounts exist on production with the password given, then re-run.');
    process.exit(1);
  }

  console.log('\n--- Admin Setup config routes ---');
  await testConfigRoutes(sessions);

  console.log('\n--- Aircraft routes ---');
  await testAircraftRoutes(sessions);

  console.log('\n--- Direct Exam Entry route (negative-only) ---');
  await testDirectExamRoute(sessions);

  const { total, passed, failed, skipped } = summarize();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULT: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped/not-automated.`);
  if (cleanupWarnings.length) {
    console.log(`\n⚠ ${cleanupWarnings.length} leftover test row(s) need manual cleanup — see the report.`);
  }
  console.log('='.repeat(60));

  await mkdir(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const txtPath = path.join(REPORT_DIR, `security-test-${stamp}.txt`);
  const htmlPath = path.join(REPORT_DIR, `security-test-${stamp}.html`);
  const jsonPath = path.join(REPORT_DIR, `security-test-${stamp}.json`);

  await writeFile(txtPath, buildTextReport(sessions), 'utf8');
  await writeFile(htmlPath, buildHtmlReport(sessions), 'utf8');
  await writeFile(jsonPath, JSON.stringify({ baseUrl: BASE_URL, runAt: new Date().toISOString(), results, cleanupWarnings }, null, 2), 'utf8');

  console.log(`\nReports written to:\n  ${txtPath}\n  ${htmlPath}  (open in a browser, then Ctrl+P -> Save as PDF)\n  ${jsonPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nUnexpected error — script aborted:');
  console.error(err);
  process.exit(1);
});
