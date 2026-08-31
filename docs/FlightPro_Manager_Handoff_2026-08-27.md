# FlightPro Manager — Checkpoint & Handoff (updated 2026-08-25 — the modal-theming fix AND the no-explicit-any/exhaustive-deps/no-img-element lint cleanup (32 files, lint 97→32) are both ✅ CONFIRMED COMMITTED, PUSHED, AND MERGED INTO PRODUCTION (commit `91b5ff0`, fast-forward from `4aefc5c`) — see the new section directly below; ⚠️ FOUR rounds are now simultaneously live on `production` with NONE of them tested yet: session 7's security/accessibility hardening, the My-Students-scoping/Quick-Actions-removal round, the modal-theming fix, and the lint cleanup — user has explicitly asked the team to do a full click-through test of the whole app rather than sequence testing round-by-round; see the combined testing checklist in the new section below. Also carried forward: all three earlier "blocked on a decision" items resolved (IR required_hours now 15, instructor roster view access granted, next-steps-plan reconstructed); draft DGCA Maintenance Log + Incident Report templates delivered (unverified against real forms), implementation plan researched but not started; a Master Plan Tracker spreadsheet delivered and saved to `docs/`)

**Purpose of this doc:** a single entry point for anyone — the user, or a future Claude session with no memory of this one — to pick this engagement back up without re-deriving context. It doesn't replace the other three project docs; it points into them.

## ✅ 2026-08-27: Aircraft Maintenance Schedule Phase 1 CONFIRMED committed, pushed, AND merged into production (commit `b1a5bd8` → `819baef`) — plus a fleet-name-mismatch fix, Type/Model dropdown filtering, a 4-model fleet expansion, and moving the Type/Model mapping from hardcoded to DB-driven — all delivered, committed, pushed, merged, and independently verified against GitHub. Testing mostly complete; two items still open.

Everything below is this session's work, most-recent first within the section.

### 1. Real bug found via user testing: pre-existing aircraft showed NO items on the Maintenance Due panel

User reported that aircraft added before the Aircraft Maintenance Schedule feature showed no maintenance records/items at all on the Due panel. Root-caused (not guessed) by reading `getMaintenanceDueItems()` in `lib/store.ts`: it filters schedule templates by exact string equality — `templatesForModel = templates.filter(t => t.aircraftModel === ac.model)`. A pre-existing aircraft's `model` field holds whatever free text was typed into the OLD (pre-dropdown) Model field — if that text isn't byte-for-byte one of the seeded model strings, the aircraft matches zero templates and the panel shows nothing for it, not even NO_BASELINE placeholders.

**Not a bug in the due-tracking logic itself** — this is the AircraftFormModal/AircraftSetupTab "Other (custom)" fallback working exactly as designed for a Model value that predates the dropdown. **Fix was data, not code**: user opened the affected aircraft's Edit form (which auto-detects a non-matching Model and opens in custom-text mode), re-picked the correct model from the dropdown, saved — **user confirmed "works"** afterward. No file changes this round for this specific item.

**Worth flagging for anyone bringing an existing fleet onto this feature**: every aircraft added before Phase 1 needs its Model field re-saved through the dropdown once, or it will silently show nothing on the Due panel. There's no automated backfill/detection for this — it surfaces only when someone notices a specific aircraft's Due panel is empty. A future round could add a one-time admin banner ("N aircraft have an unrecognized Model — click to fix") if this keeps tripping people up.

### 2. NEW: Type/Model dropdown filtering — 3 files delivered, confirmed byte-for-byte, ✅ committed & pushed (folded into commit `819baef` below)

User asked: "if its multi engine selected it should only show multi engine models and if its single engine it should only show single engine models — this will help in manual entry error while creating the aircraft."

**What was built** (first pass — later superseded in shape, not in behavior, by item 3 below):
- `lib/store.ts` — a `MODEL_ENGINE_TYPE: Record<string, string>` map (hardcoded at this point) pairing each of the 5 original seeded models to `'Single Engine'`/`'Multi Engine'` (Cessna 172 → Single; the other 4 twins → Multi).
- `AircraftFormModal.tsx` / `AircraftSetupTab.tsx` — Model dropdown now filtered by the currently-selected Type; switching Type clears a now-mismatched Model rather than leaving a bad combo sitting in the form; a model not in the map is never hidden (shown for either Type) so nothing becomes unselectable by omission.

### 3. NEW: fleet expansion — 4 more models researched and seeded — 2 files delivered, confirmed byte-for-byte

User asked to add Cessna 152, Piper PA-28 Cherokee / Archer, Piper Archer DX, and Diamond DA40 to the schedule/dropdown. Researched via web search (real sources, same discipline as the original 5 models) rather than guessed:

- **Cessna 152** (Lycoming O-235): 2000 hrs / 12 yr TBO, standard 8-item schedule (Engine Overhaul, Annual, 100-Hour, Oil Change, 50-Hour, Avionics Check, Propeller Service, AD Compliance).
- **Piper PA-28 Cherokee / Archer** (Lycoming O-360, Archer-spec): same 2000 hrs/12 yr figure as the rest of the O-360 family in this fleet — flagged explicitly that this ONE row covers a whole model family spanning at least two Lycoming displacements (O-320 vs O-360) across variants; the seeded figure is for the O-360-powered Archer specifically.
- **Piper Archer DX** (Continental/Technify CD-155 diesel): only 7 items, no 50-Hour Inspection (same reasoning as the diesel DA42 NG). Its "Engine Overhaul" figure (2100 hrs) is flagged as a TBR — Time Between Replacement, a whole-engine swap, not a traditional overhaul — a genuinely different maintenance concept from every other engine in this table.
- **Diamond DA40** (classic, Lycoming IO-360-M1A, not the diesel/Austro-engined DA42 NG): 2000 hrs/12 yr, standard 8-item schedule.

New migration: `add-fleet-expansion-models.sql` (31 seed rows). `lib/store.ts`'s `MODEL_ENGINE_TYPE` map (item 2 above) extended to mark all 4 new models Single Engine.

Sources: [Lycoming O-235](https://en.wikipedia.org/wiki/Lycoming_O-235), [Lycoming O-360](https://en.wikipedia.org/wiki/Lycoming_O-360), [Archer DX TBR increased to 2,100 hours — Piper](https://www.piper.com/press-releases/archerdx/), [Continental increases diesel engines TBR to 2,100 hours](https://generalaviationnews.com/2016/04/21/continental-increases-diesel-engines-tbr-to-2100-hours/), [Diamond DA 40 with IO-360-M1A engine — Hartzell](https://hartzellprop.com/products/top-prop/other/da-40-io-360-m1a-engine/).

### 4. NEW: Type/Model mapping moved from hardcoded to DB-driven — 7 files delivered, confirmed byte-for-byte

User asked directly: "in place of updating store.ts every time we need change cant we get this into a table and call from there? is there any benefit of keeping this hardcoded?" — correct call. The Aircraft Model list itself has been DB-driven since Phase 1 (`SELECT DISTINCT aircraft_model`, no code/deploy needed to add a model); the engine-type mapping from item 2 above was the one remaining piece still requiring a code change and redeploy every time a model was added — exactly the "sibling entry point drift" pattern this engagement keeps hitting.

**What changed:**
- New migration `add-schedule-template-engine-type.sql` — adds `engine_type text` (nullable, `CHECK (... IN ('Single Engine','Multi Engine') OR NULL)`) to `aircraft_maintenance_schedule_templates`, denormalized across every item-row for a model (this table is already the closest thing to a per-model registry this app has) rather than a new `aircraft_models` table + FK migration — a bigger change than this ask needed. Backfills all 9 current models with the values the old hardcoded map had.
- `lib/store.ts` — `MODEL_ENGINE_TYPE` removed entirely; replaced with `deriveModelEngineTypeMap(rows)`, a pure function turning `{aircraft_model, engine_type}` rows (that `AircraftFormModal.tsx`/`AircraftSetupTab.tsx` already fetch via their own lightweight supabase queries) into the same shape of map, live from the DB.
- `app/api/admin/config/[table]/route.ts` — `engine_type` added to the `aircraft-maintenance-schedule` entry's column whitelist.
- `AircraftMaintenanceScheduleTab.tsx` — new "Engine Type for [model]" selector next to the Model picker. Changing it bulk-PATCHes every existing schedule-item row for that model to keep them in sync (the column is denormalized across ~8 rows per model); a brand-new model's first "Add Item" save carries whatever Engine Type is currently selected. A model with no Engine Type set still shows for either Type on the Aircraft form — same safe fallback the hardcoded map had for anything it didn't list.
- `types/index.ts` — `MaintenanceScheduleTemplate.engineType: string | null` added.

### Verification (items 2-4, all rounds this session)

- `npx tsc --noEmit` clean after every round.
- `npx eslint` on every touched file each round: only the same pre-existing, already-documented `react-hooks/set-state-in-effect` findings on lines this session didn't touch — confirmed via direct diff inspection each time, not assumed.
- Every file this session delivered via the device bridge with the full stage → diff-against-pre-edit-copy → `SendUserFile` → `device_commit_files` → re-stage → `cmp` byte-for-byte cycle — **zero mismatches, zero rejections, across all 3 rounds (3 + 2 + 7 files).**

### ✅ Real-machine commit + push + merge confirmed 2026-08-27 (TWO commits)

**Commit `b1a5bd8`** — Aircraft Maintenance Schedule Phase 1 (the whole feature: schema, 4 SQL migrations, the Due panel, the Admin Setup tab, all of Phase 1's supporting code) — 18 files, all 4 migrations confirmed run by the user beforehand ("sqls already executed in the same process"). User ran the commit/push on the real machine and pasted the full terminal output:

```
git add -A
git commit -m "Add Aircraft Maintenance Schedule (Phase 1): ..."
[main b1a5bd8] ... 18 files changed, 2743 insertions(+), 19 deletions(-)
git push origin main
   600cdb3..b1a5bd8  main -> main
```

**Independently verified against GitHub** (`git ls-remote origin main production`): `refs/heads/main` resolved to `b1a5bd84e3932524694104a138325e439bfef1a6`, matching exactly.

**Commit `819baef`** — items 2-4 above (Type/Model filtering, fleet expansion, DB-driven engine_type) — 8 files, both new SQL migrations confirmed run. User ran the commit/push and pasted the full terminal output:

```
git add -A
git commit -m "Add Cessna 152/Archer/Archer DX/DA40 to fleet schedule; filter Model dropdown by engine Type; move Type/Model mapping from hardcoded to DB-driven engine_type column"
[main 819baef] ... 8 files changed, 316 insertions(+), 20 deletions(-)
git push origin main
   b1a5bd8..819baef  main -> main
```

**Independently verified against GitHub**: `refs/heads/main` resolved to `819baefe38e36ee6881dadfd9dee1b50e97857a3`, matching exactly.

**✅ Both merged into `production` same day.** User asked directly whether to push to production before finishing every last testing item; given via AskUserQuestion the choice between "tested", "not fully — merge anyway", and "not fully — test first" — **user chose "not fully — merge anyway"** (explicit, informed call, same pattern as several earlier rounds in this engagement). User ran the merge and pasted the full terminal output:

```
git checkout production
git merge main
Updating 600cdb3..819baef
Fast-forward
 20 files changed, 3050 insertions(+), 30 deletions(-)
git push origin production
   600cdb3..819baef  production -> production
```

**Independently verified against GitHub**: both `refs/heads/main` and `refs/heads/production` resolve to `819baefe38e36ee6881dadfd9dee1b50e97857a3`. Fully synced, fully live — production now carries EVERYTHING through today's session: the whole Aircraft Maintenance Schedule feature (Phase 1, item-name/Oil-Change fix, Propeller Service/Avionics Check/AD Compliance, fleet expansion to 9 models) plus the Type/Model filtering and DB-driven engine-type work, all in one merge.

### Testing status as of this update

User confirmed, in their own words, "all well incorporated" and "Pending test log maintenance and regression test all other completed" — meaning:
- ✅ Admin Setup → Aircraft Maintenance Schedule tab (9 models, Engine Type selector) — tested, working.
- ✅ Add/Edit Aircraft Type/Model filtering (both single- and multi-engine paths, mismatch-clears-Model behavior, "Other (custom)" fallback, pre-existing aircraft Model re-pick) — tested, working.
- ✅ Maintenance Due panel — Set Baseline / Create Maintenance Record buttons — tested, working.
- ⚠️ **NOT yet tested: logging a completion through the normal "Log Maintenance" screen** (not the Due panel's own buttons) with Type = Oil Change (or similar), Status = Completed, Hobbs at Completion filled in — confirm the matching Due-panel item resets. This is the specific path the earlier item-name-mismatch bug (2026-08-26, second round) was found and fixed in, so it's worth deliberately exercising rather than assuming it still works.
- ⚠️ **NOT yet done: a general regression pass** over Booking, Flight Records, Ground School, and the other Admin Setup tabs — nothing in this session's work should have touched them, but worth a normal-use sanity check now that everything is live on `production`.

### Also this session: old project doc `claude/handoff-2026-08-18.md` deleted (superseded, verified)

User asked to check whether the old doc was fully covered by `claude/handoff-2026-08-26.md` before deleting it. Verified directly (not assumed) by reading both docs in full and confirming the newer doc's later portion — starting from "two follow-ups to the SPL/CPL bugfix" onward — matches the old doc word-for-word through its closing "Conventions worth knowing" section and full outstanding-items list, with only new 2026-08-26 sections added on top (matching this doc's own stated prepend-only convention). Deleted via `Projects.project_delete`. `claude/handoff-2026-08-26.md` (superseded in turn by whichever doc this content is published under this round — see the project doc list) is/was the sole authoritative handoff doc in between.

**User also asked how to set a project custom instruction** so a fresh session in this project picks up the latest handoff doc automatically — walked through the claude.ai UI steps (project settings → custom instructions field, not editable via any tool available to this session) and suggested exact instruction text pointing at the latest dated handoff doc. Not yet confirmed whether the user has actually added it — worth checking in a future session, and worth remembering this instruction needs manual updating by the user every time a new dated handoff doc supersedes the last one referenced in it.

---

## ✅ 2026-08-26: Aircraft Maintenance Schedule — Phase 1 BUILT and DELIVERED (12 files: 3 new, 9 edited) — awaiting user's SQL migration run + functional test + git commit

Builds Phase 1 of the design proposed/confirmed earlier the same day (see the "PROPOSED, NOT YET BUILT" section further below, now superseded — that section is left in place as the design record). User explicitly asked to do Phase 1 now and defer Phase 2 (hard-blocking bookings on overdue items) to the backlog; also confirmed, via a follow-up AskUserQuestion, that a newly-tracked aircraft/item with no maintenance history should prompt the admin for a manually-entered baseline (hobbs/date at last known service) rather than silently assuming "0 hours today."

**One scope simplification made unilaterally (informed the user, not asked):** the original design's "auto-create a SCHEDULED maintenance_records row when an item comes due" was simplified to a staff-confirmed one-click "Create Maintenance Record" / "Set Baseline" action instead of a silent background auto-insert. Reasoning: this Next.js/Supabase app has no server-side cron/scheduled job to run a silent auto-insert from, and a confirmed action avoids duplicate/stale-record risk — it also matches how every other entry in this app already works (nothing auto-creates itself in the background).

### What was built
- **`add-aircraft-maintenance-schedule.sql`** (new) — `aircraft_maintenance_schedule_templates` table (id, aircraft_model, item_name, interval_type `HOBBS_HOURS`/`CALENDAR_MONTHS`, interval_value, notes, is_active, unique(aircraft_model, item_name) so re-running the seed insert is safe), plus `maintenance_records.hobbs_at_completion` (nullable numeric). Seeded with the 5 researched aircraft models' engine-TBO + annual + 100-hour rows, each `notes` column carrying the same source/caveat language as the earlier research table (DGCA-vs-FAA caveat preserved).
- **`types/index.ts`** — `model`'s comment updated to describe the new dropdown; `MaintenanceRecord.hobbsAtCompletion` added; new `MaintenanceScheduleTemplate` and `MaintenanceDueItem` (computed, not stored) interfaces.
- **`app/api/admin/config/[table]/route.ts`** — one new `TABLES` entry, `aircraft-maintenance-schedule` → `aircraft_maintenance_schedule_templates`, reusing the existing whitelisted CRUD route (same pattern as every other Admin Setup config tab).
- **`app/api/maintenance-records/[id]/route.ts`** and **`app/api/maintenance-records/route.ts`** — `hobbsAtCompletion`/`hobbs_at_completion` threaded through PATCH's `FIELD_MAP` and POST's insert. The PATCH handler's existing "auto-clear aircraft status to ACTIVE" side effect was left untouched.
- **`lib/store.ts`** — `computeMaintenanceDueItems()` (pure function, same style as `getSchedulingBlockReason`): for each active template item on an aircraft's model, finds the most recent COMPLETED record matching that item by name, and computes OVERDUE / DUE_SOON (within 25 hobbs hrs or 30 days) / OK / NO_BASELINE. New store state `maintenanceScheduleTemplates` + `loadMaintenanceScheduleTemplates()` + `getMaintenanceDueItems(aircraftId)` getter.
- **`app/dashboard/admin/setup/AircraftMaintenanceScheduleTab.tsx`** (new) — CRUD tab for the template table, grouped by aircraft model (same pattern as `RequirementsTab.tsx`'s program-grouped CRUD), with an "Add Model" input for models with no seed row yet. Registered in `app/dashboard/admin/setup/page.tsx`'s `TABS` array, right after Aircraft Fleet.
- **`components/aircraft/AircraftFormModal.tsx`** and **`app/dashboard/admin/setup/AircraftSetupTab.tsx`** — Model field changed from free-text to a `<select>` sourced from `SELECT DISTINCT aircraft_model` on the template table, with an "Other (custom)…" option that reveals the old free-text input (and a "Use list" button to switch back). Editing an aircraft whose existing model isn't in the list automatically opens in custom-text mode so nothing gets silently blanked.
- **`components/maintenance/MaintenanceDueSection.tsx`** (new) — non-blocking "Maintenance Due" panel shown at the top of the Maintenance page, listing every aircraft+item combination that is OVERDUE, DUE_SOON, or NO_BASELINE (OK items are hidden — nothing to show). Each row has one action button, gated to the same `canWrite` check as the page's existing "Log Maintenance" button:
  - **NO_BASELINE → "Set Baseline"**: opens a small modal asking for the hobbs reading and/or date at the item's last known service, and creates a COMPLETED `maintenance_records` row anchoring future due-calculations.
  - **OVERDUE/DUE_SOON → "Create Maintenance Record"**: same modal, pre-filled for "just completed" — creates a COMPLETED record with today's date/current hobbs as defaults (editable), resetting the due clock for that item.
  Neither button silently auto-creates anything — both require the staff member to open the modal and click Save, per the scope simplification above.
- **`app/dashboard/maintenance/page.tsx`** — renders `<MaintenanceDueSection canWrite={canWrite} />` above the existing stats/records table.

### Verification
- `npx tsc --noEmit` clean on every touched file (checked after each batch of edits, and once more at the end).
- `npx eslint` on all 12 files: zero new findings. The five `react-hooks/set-state-in-effect` results reported (`AircraftMaintenanceScheduleTab.tsx`, `AircraftSetupTab.tsx`, `admin/setup/page.tsx`, `AircraftFormModal.tsx` ×2) were checked against this rule's behavior across the rest of the codebase — spot-checked `RequirementsTab.tsx` and `HolidaysTab.tsx`, both pre-existing/untouched files, and both trigger the identical warning on their own "load data on mount" `useEffect`s. This is a pervasive, pre-existing pattern across this whole app (every tab's mount-time load call trips this rule), not something introduced by this round — consistent with the established "accept only pre-existing findings" convention from earlier sessions.
- Delivered via the device bridge: staged the 9 pre-existing files from the real machine BEFORE this round's edits were written there, diffed byte-for-byte against the sandbox copies via Python `difflib` — every removed/changed line traced to an intended edit (the Model-field input→dropdown swap, the new type/interface additions, the new `TABLES`/`FIELD_MAP` entries) with zero unexplained drift. After `device_commit_files` (`written`: all 12, `rejected`: none), re-staged all 12 and ran `cmp` against the sandbox copies — byte-for-byte identical.

## ✅ 2026-08-26 (fourth round, same day): DGCA-specific research — AD Compliance added, closing the last gap in the "Log Maintenance" dropdown — 1 SQL file DELIVERED, confirmed byte-for-byte

User asked to research whether DGCA (India's regulator) has anything that would let "AD Compliance" — the one dropdown item still deliberately left untracked, on the grounds that ADs are ad hoc — actually be added.

**Research findings** (see `add-ad-compliance-review.sql`'s header for full detail): confirmed the "ad hoc" reasoning was right in one sense — DGCA's own Advisory Circular on Mandatory Modification compliance describes a **one-time submission per modification** (via the eGCA portal), not a recurring interval; there is no blanket "recheck ADs every N hours/months" DGCA rule, and any repeat-inspection requirement is specific to that one AD. BUT there is a genuine recurring DGCA checkpoint where AD/Mandatory Modification compliance status gets reviewed: the **Airworthiness Review Certificate (ARC)**, which has a maximum validity of 12 months (DGCA Airworthiness Procedures Manual) and must be renewed annually — the same Advisory Circular states compliance is confirmed "at the time of issuance of C of A/ARC."

**What was added:** `add-ad-compliance-review.sql` (new, run AFTER `add-propeller-service-and-avionics-check.sql`) seeds "AD Compliance" at 12 calendar months for all 5 models. The notes column is explicit that this represents "review/reconfirm AD & Mandatory Modification compliance status, coinciding with the annual ARC renewal" — an administrative/paperwork checkpoint, not a physical maintenance task with its own fixed interval like every other row in this table — so it isn't mistaken for a DGCA-mandated "check ADs every 12 months" rule, which does not exist as a blanket figure.

This closes the last gap — **all 10 items in `MaintenanceForm.tsx`'s Type dropdown are now either tracked with a real recurring interval (8 items: Oil Change, 50-Hour Inspection, 100-Hour Inspection, Annual Inspection, Engine Overhaul, Avionics Check, Propeller Service, AD Compliance) or deliberately left untracked because they are inherently unscheduled by nature (Emergency/AOG, Other).**

No code changes needed — "AD Compliance" already matches the dropdown exactly.

### Verification
Staged the file from the real machine after delivery, `cmp`'d against the sandbox copy — byte-for-byte identical.

### What must happen before this is testable
Run all four SQL migrations in order: `add-aircraft-maintenance-schedule.sql` → `fix-maintenance-schedule-item-names-and-add-oil-change.sql` → `add-propeller-service-and-avionics-check.sql` → `add-ad-compliance-review.sql`.

---

## ✅ 2026-08-26 (third round, same day): coverage check against the "Log Maintenance" dropdown — added Avionics Check + Propeller Service — 1 SQL file DELIVERED, confirmed byte-for-byte

User asked directly whether every item in `MaintenanceForm.tsx`'s Type dropdown was now covered by the schedule table. Checked all 10 options against the two earlier migrations:

| Dropdown item | Covered before this round? |
|---|---|
| Oil Change, 50-Hour Inspection, 100-Hour Inspection, Annual Inspection, Engine Overhaul | Yes (prior two migrations) |
| AD Compliance, Emergency / AOG, Other | No — deliberately (not recurring-interval items: ADs are issued ad hoc, AOG is inherently unscheduled, Other is free text) |
| Avionics Check, Propeller Service | No — genuine gap, both CAN have a real recurring interval, just weren't in the original research pass |

User asked to add both. **`add-propeller-service-and-avionics-check.sql`** (new, run AFTER `fix-maintenance-schedule-item-names-and-add-oil-change.sql`):
- **Avionics Check** — 24 calendar months, all 5 models, matching the standard pitot-static/altimeter/transponder recurring recertification convention (FAA 91.411/91.413-style; DGCA equivalent needs confirming against this FTO's actual approved programme, same caveat as the rest of the table).
- **Propeller Service** — HOBBS_HOURS, per-model, since propeller TBO is driven by the propeller's own make/model rather than the airframe/engine: 2,000 hrs/72 months for the Cessna 172's McCauley fixed-pitch prop (McCauley's own TBO table); 2,000 hrs used as a representative figure for the Seneca/Seminole's Hartzell/McCauley constant-speed props, though flagged as the least certain figure in the whole table since McCauley's table itself shows constant-speed models ranging 1,200–6,000 hrs/60–72 months by exact model/hub; 2,000 hrs/12 years for the Tecnam P2006T and Diamond DA42/DA42 NG's MT-Propeller composite-blade convention.

No code changes needed — both item names ("Avionics Check", "Propeller Service") already match `MaintenanceForm.tsx`'s dropdown exactly, and the existing `computeMaintenanceDueItems()`/due-panel machinery picks up any active template row automatically.

### Verification
Staged the file from the real machine after delivery, `cmp`'d against the sandbox copy — byte-for-byte identical.

### What must happen before this is testable
Run all three SQL migrations in order: `add-aircraft-maintenance-schedule.sql` → `fix-maintenance-schedule-item-names-and-add-oil-change.sql` → `add-propeller-service-and-avionics-check.sql`. After that, Avionics Check and Propeller Service should appear as NO_BASELINE items on the Maintenance Due panel alongside the other five, for every tracked aircraft.

---

## ✅ 2026-08-26 (second round, same day): DEFECT FOUND via user question — the "Log Maintenance" screen's Type dropdown couldn't feed the new due-tracker, and Oil Change/50-Hour Inspection weren't tracked at all — 3 files DELIVERED, confirmed byte-for-byte

User asked whether the existing Maintenance page's "Log Maintenance" Type dropdown (which already offers "50-Hour Inspection", "100-Hour Inspection", "Oil Change", etc.) was hardcoded or table-driven, and pointed out these items need due-tracking too, not just Engine Overhaul/Annual/100-Hour.

**What was actually wrong, once checked:**
1. The Type dropdown in `MaintenanceForm.tsx` (the normal "Log Maintenance" screen every completion goes through) is confirmed hardcoded — always has been, not new. That part was working as intended.
2. The real bug: the Phase 1 seed data used slightly different item-name phrasing ("100-hour inspection", "Annual inspection", "Engine overhaul (TBO)") than that dropdown's exact strings ("100-Hour Inspection", "Annual Inspection", "Engine Overhaul"). Since `computeMaintenanceDueItems()` matched by exact string equality, a staff member logging routine maintenance through the normal, already-familiar screen would silently never reset that item's due clock — the only way tracking actually worked was through the brand-new Maintenance Due panel's own dedicated action, which nobody would think to use for routine logging.
3. `MaintenanceForm.tsx` also had no field to capture hobbs-at-completion at all — so even with names aligned, a HOBBS_HOURS item logged there had nothing to anchor to.
4. Oil Change and 50-Hour Inspection — both already options in that same dropdown — had no template rows at all, so they were never tracked regardless of naming.
5. Minor: the DUE_SOON window was a flat 25 hrs/30 days, which for the newly-added 50-hr Oil Change item meant it would show DUE_SOON for literally half its life (25 of 50 hrs) — noise, not a warning.

**Fixes delivered:**
- `fix-maintenance-schedule-item-names-and-add-oil-change.sql` (new, run AFTER `add-aircraft-maintenance-schedule.sql`) — renames the 3 existing items to match `MaintenanceForm.tsx`'s dropdown exactly, and adds Oil Change (50 hrs Lycoming/Continental-powered models, 100 hrs Rotax/Austro-powered) + 50-Hour Inspection (50 hrs, all except the Diamond DA42/DA42 NG, whose Austro AE300 schedule doesn't follow that convention) — see the file's header for full sourcing (Lycoming SB 480, Rotax SI-912-016-R4, and the DA42's existing 100-hr oil+filter figure).
- `lib/store.ts` — item-name matching in `computeMaintenanceDueItems()` is now case/whitespace-insensitive (`normalizeItemName()`) as defense in depth, independent of the renaming above; the flat DUE_SOON constants were replaced with `dueSoonHobbsWindow()`/`dueSoonCalendarWindowDays()` — 20% of the item's own interval, floored/capped (a 50-hr item gets a ~10-hr window, a 2000-hr TBO item keeps the original 25-hr cap).
- `components/maintenance/MaintenanceForm.tsx` — added a "Hobbs at Completion" input, shown only when Status is COMPLETED, wired through to the existing `hobbsAtCompletion` field. Logging a routine Oil Change/100-Hour/Annual/Engine Overhaul through the normal screen now feeds the due-tracker exactly like the dedicated panel does.

**Known remaining gap, not fixed in this round:** the Maintenance page's quick one-click "Complete" button (for an already-SCHEDULED/IN_PROGRESS record, no form reopened) still doesn't prompt for hobbs — so that specific shortcut path still won't reset a HOBBS_HOURS item's due clock. Logging via Edit (or the Maintenance Due panel's own action) both work correctly. Flagging for a future round if it turns out to matter in practice.

### Verification
- `npx tsc --noEmit` and `npx eslint` clean on both touched code files.
- Staged `lib/store.ts` and `MaintenanceForm.tsx` from the real machine before writing this round's edits — `lib/store.ts`'s staged mtime/byte-count matched exactly what was delivered in the previous round (no drift since then); diffed both against the sandbox copies via Python `difflib` — every removed line traced to an intended edit (the old DUE_SOON constants, the old exact-match comparison), zero unexplained drift. After `device_commit_files` (all 3 written, none rejected), re-staged and `cmp`'d all 3 — byte-for-byte identical.

### What must happen before this is testable
0. **Run BOTH SQL migrations in order**: `add-aircraft-maintenance-schedule.sql` first (if not already run), then `fix-maintenance-schedule-item-names-and-add-oil-change.sql`. The second depends on the first's table existing.
1. Re-test the "Maintenance Due" panel — Oil Change and 50-Hour Inspection should now appear as NO_BASELINE items for every tracked aircraft, alongside the original three.
2. Log a completion through the normal "Log Maintenance" screen (not the due-panel's own action) with Status = Completed, Type = "Oil Change" (or 100-Hour/Annual/Engine Overhaul), and fill in Hobbs at Completion — confirm the matching item on the Maintenance Due panel updates/disappears afterward.

---

### What must happen before this is testable
1. **Run the SQL migration** (`add-aircraft-maintenance-schedule.sql`) against the Supabase database — this has NOT been run yet, only delivered as a file. Nothing in this feature works until it is.
2. **Restart/redeploy the app** so the new route/type/component code picks up.
3. Functional test checklist:
   - Admin Setup → Aircraft Maintenance Schedule tab loads, shows the 5 seeded models with their items, and add/edit/delete works.
   - Add/edit an aircraft — Model is now a dropdown sourced from the 5 seeded models, with "Other (custom)…" still available and working for a model with no template yet.
   - Maintenance page shows a "Maintenance Due" panel for any aircraft whose model has active template items — expect every item to show **NO_BASELINE** initially (no history exists yet in a live DB), each with a "Set Baseline" button.
   - Click "Set Baseline" on one item, save it, confirm the panel updates: for a HOBBS_HOURS item, either OK/DUE_SOON/OVERDUE depending on the aircraft's current hobbs vs. the interval; for a CALENDAR_MONTHS item, similarly by date.
   - For an item showing OVERDUE or DUE_SOON, click "Create Maintenance Record", save it, confirm the item drops off the panel (back to OK) and a new COMPLETED row appears in the regular maintenance records list/table.
4. Git: this sandbox's local clone is stale by design (ignore the per-turn "uncommitted changes" stop-hook notice) — as always, commit from `main` on the real machine, paste the terminal output back, and it will be independently verified via `git ls-remote origin main production` against the real GitHub remote before being confirmed here.
5. **Phase 2 (hard-blocking bookings on overdue mandatory items) is explicitly NOT built** — logged as a future backlog item once Phase 1 is confirmed working in practice, per the user's own request to sequence it this way.

---


## ✅ 2026-08-26: DEFECT FIXED — BA Test Register write access was too broad (included admin/super_admin) — 1 file DELIVERED, confirmed byte-for-byte, ✅ COMMITTED, PUSHED, AND MERGED (`main`/`production` both at `600cdb3`)

User flagged that the BA Test Register should only be writable by safety_officer and operations. The original 2026-08-20 spec (see that section further down) had deliberately included `admin`/`super_admin` in `BA_TEST_WRITE_ROLES` alongside `operations`/`safety_officer` — user confirmed via AskUserQuestion that this was in fact the defect (not the original intent) and asked for it narrowed to `operations` + `safety_officer` only, with admin/super_admin dropping to view-only (same level as instructor/maintenance already had).

**Fix:** `lib/permissions.ts` — `BA_TEST_WRITE_ROLES` changed from `['admin', 'super_admin', 'operations', 'safety_officer']` to `['operations', 'safety_officer']`. This is the single source of truth for the whole feature (client-side `canWrite` check in `breath-analyser/page.tsx`, and all three server-side `requireRole()` gates: `POST /api/ba-tests`, `PATCH`/`DELETE /api/ba-tests/[id]`, `GET /api/safety-officers`) — one change closes the gap everywhere, client and server. `BA_TEST_VIEW_ROLES` (broad, unchanged) still lets admin/super_admin see the register, just not add/edit/delete entries.

### Verification
- Sandbox `npx tsc --noEmit`: clean.
- Sandbox `npx eslint` on the touched file: clean, zero hits.
- Confirmed via grep that `BA_TEST_WRITE_ROLES` has exactly one definition and no other file hardcodes a duplicate copy of the old role list — the fix is complete everywhere it's used, not just the obvious call site.
- Pre-delivery check: staged the file from the device before editing, diffed (CRLF-normalized) against the sandbox's pre-fix copy — matched exactly, no undisclosed drift.
- Delivered via the device bridge (`SendUserFile` + `device_commit_files`, `expectedMtimeMs` guard), reported written, then re-staged and diffed byte-for-byte — **confirmed zero mismatches.**

### What must happen before this is testable
1. No SQL migration needed — pure permissions-constant change.
2. Test: log in as admin or super_admin, open BA Test Register — confirm the add/edit form is now gone (view-only), same as instructor/maintenance already see.
3. Test: log in as operations or safety_officer — confirm add/edit still works exactly as before.
4. (Optional/negative test) hit `POST /api/ba-tests` directly as an admin/super_admin session — confirm it's now rejected server-side, not just hidden client-side.
5. ~~This round is NOT yet committed to git~~ — ✅ **confirmed committed, pushed, AND merged into `production` (2026-08-26)**, see below.

### ✅ Real-machine commit + push + merge confirmed 2026-08-26

User correctly checked out `main` first this time (no repeat of the earlier commit-on-`production` mix-up) and pasted the full terminal output:

```
git add lib/permissions.ts
git commit -m "Restrict BA Test Register write access to operations and safety_officer only"
[main 600cdb3] Restrict BA Test Register write access to operations and safety_officer only
 1 file changed, 12 insertions(+), 8 deletions(-)
git push origin main
   e293653..600cdb3  main -> main
git checkout production
git merge main
Updating e293653..600cdb3
Fast-forward
 lib/permissions.ts | 20 ++++++++++++--------
 1 file changed, 12 insertions(+), 8 deletions(-)
git push origin production
   e293653..600cdb3  production -> production
```

**Independently verified against GitHub** (`git ls-remote origin main production`): both `refs/heads/main` and `refs/heads/production` resolve to `600cdb3cd07e4992666761494e598574f43a90a2`. Fully synced, fully live.

### What must happen next
1. Test: log in as admin/super_admin, open BA Test Register — confirm add/edit is now gone (view-only). Test operations/safety_officer still works. Not yet confirmed by the user as of this update.

---

## 🆕 2026-08-26 — PROPOSED, design confirmed by user, NOT YET BUILT: per-aircraft-model Maintenance Schedule table, driving a Model dropdown + auto-scheduled maintenance items

User asked for a maintenance-schedule reference table for the FTO's five aircraft types (Cessna 172, Tecnam P2006T, Piper PA-34 Seneca, Diamond DA42/DA42 NG, Piper PA-44 Seminole) that would (a) be referenced when an aircraft is added, (b) enforce the schedule based on engine/hobbs hours or calendar time, and (c) turn the currently free-text Aircraft "Model" field into a dropdown. Per this engagement's standing convention (research and propose a design before writing code — most recently followed for the Partial Weekly Off Day feature), this round did the research and got the design confirmed via AskUserQuestion; **no code has been written yet.**

### Research findings (engine/manufacturer maintenance intervals)

⚠️ **Important caveat before using any of this**: these are globally-published *engine manufacturer* TBO figures (Lycoming/Continental/Rotax/Austro all publish worldwide, not FAA-specific), sourced via web search — but the airframe-level inspection *cadence* convention ("100-hour inspection", "annual inspection") is an **FAA Part 91.409 concept**, not a DGCA one. This FTO operates under India's DGCA, which requires maintenance per an approved Continuing Airworthiness Maintenance Program (CAMP) — the actual required inspection intervals for a DGCA-registered aircraft may differ from the FAA convention below. **The engine TBO hour figures are solid and manufacturer-sourced; the "100hr/annual" cadence should be confirmed against the FTO's own DGCA-approved maintenance program before being treated as authoritative** — this mirrors the same caution already applied to the DGCA Class 1 medical validity research earlier in this engagement (conflicting sources found, reported back rather than guessed).

| Aircraft | Engine | TBO | Other periodic items found | Source |
|---|---|---|---|---|
| Cessna 172 | Lycoming O-320 or O-360 (variant depends on 172 model/year) | 2,000 hrs / 12 years (O-360, Lycoming factory spec) | — | [Lycoming O-360 — Wikipedia](https://en.wikipedia.org/wiki/Lycoming_O-360) |
| Tecnam P2006T | 2× Rotax 912 (S3 or ULS, variant-dependent) | 2,000 hrs / 15 years (current 912 figure; older variants were 1,500hr/12yr) | — | [Rotax 912 TBO extension discussion](https://forums.flyer.co.uk/viewtopic.php?t=123665), [Rotax-Owner forum](https://www.rotax-owner.com/en/912-914-technical-questions/7577-912uls-exrended-tbo) |
| Piper PA-34 Seneca | Continental TSIO-360 (variant depends on Seneca generation — I/II/III/V all differ) | 1,800–2,000 hrs / 12 years (TSIO-360-RB/SB, the Seneca V-era variant; earlier Seneca generations' TSIO-360 sub-variants are lower, 1,400–1,600 hrs) | — | [Continental SIL98-9E TBO schedule](https://www.flightcenter.aero/sites/default/files/docs/sil98-9e-tbo-continental.pdf) |
| Diamond DA42 / DA42 NG | Austro AE300 (diesel, Jet-A1) | 1,500 hrs (per a 2013 source — likely revised since; needs re-confirmation) | 100hr: oil + filter kit; 300hr: gearbox oil; 600hr: high-pressure pump service | [DA42 engine maintenance intervals](http://www.greatlakesdiamond.com/da42-engine-maintenance-intervals-explained/) |
| Piper PA-44 Seminole | Lycoming O-360-A1H6 | 2,000 hrs / 12 years (same Lycoming O-360 family as the 172) | — | [Lycoming Service Instruction 1009 BE](https://www.lycoming.com/service-instruction-1009-be), [Lycoming O-360 — Wikipedia](https://en.wikipedia.org/wiki/Lycoming_O-360) |

**Every one of these figures is variant/serial-number-dependent** (both Continental and Lycoming publish different TBOs for different sub-variants of the "same" engine family, and TBO figures get revised over time via service bulletins) — the table above is a reasonable *starting point* for seeding the new schedule-template table, not something to trust blindly. The proposed design (below) makes every seeded row editable for exactly this reason.

### Proposed design (confirmed with user via AskUserQuestion)

**New table, `aircraft_maintenance_schedule_templates`** (per-model, not per-aircraft — mirrors the existing `training_requirement_templates` template/per-student split pattern already used in this app): `aircraft_model` (text — becomes the dropdown source), `item_name` (text, e.g. "100-Hour Inspection", "Annual Inspection", "Engine Overhaul (TBO)", "Gearbox Oil"), `interval_type` ('HOBBS_HOURS' | 'CALENDAR_MONTHS'), `interval_value` (numeric), `notes` (text — source/caveat per row), `is_active`. Seeded with the 5 models above using the researched figures, each editable/deletable via a new Admin Setup tab (same CRUD-tab pattern as Exercises/Requirements/etc.).

**Aircraft "Model" field becomes a dropdown** sourced from `SELECT DISTINCT aircraft_model` on the new table, **plus an "Other (specify)" option that reveals a free-text field** (user's confirmed choice) — so a 6th aircraft type isn't blocked from being added, it just won't get an auto-populated schedule until someone adds template rows for it.

**Schema gap to close:** `maintenance_records` currently has no field capturing the aircraft's hobbs reading at the time a maintenance item was completed — needed to compute "next due" for HOBBS_HOURS-interval items. Proposed: add `hobbs_at_completion` (numeric, nullable) to `maintenance_records`, captured when a record's status is set to COMPLETED.

**Enforcement — Phase 1 only for now (user's confirmed choice, over immediately hard-blocking bookings):** non-blocking, matching the existing SPL/CPL/medical-expiry badge pattern already established in this app — a warning badge on the Aircraft card / Maintenance page when a computed item is overdue or coming due, PLUS auto-creating a `SCHEDULED` `maintenance_records` row with the computed due date/hobbs when an item comes due, which plugs into the Schedule Board's *existing* maintenance-block mechanic with zero new blocking logic needed. A harder "auto-ground the aircraft" enforcement (flipping `status` to `MAINTENANCE`) was explicitly deferred as Phase 2, to avoid a bad baseline-data false-positive grounding an aircraft on day one.

**Newly-added-aircraft baseline gap (not yet resolved — needs a decision before build):** an aircraft added today has no maintenance history, so there's no "last completed" hobbs/date to compute the first due-date from. Options for a future round to decide between: (a) require the admin to enter a baseline hobbs-at-last-TBO/date-at-last-annual when adding a new aircraft with a modeled schedule, or (b) treat "today" as hobbs-0/day-0 for the first cycle (simpler, but silently wrong if the aircraft actually has hours already on its current TBO cycle). Flagging this now so it isn't missed when this gets built.

### What must happen before this can be built
1. This is 100% design/research — **no SQL migration, no code exists yet.**
2. Before implementation: the FTO should confirm the TBO/interval figures above against the actual logbooks/engine data plates of its real aircraft (exact engine sub-variant matters), and someone needs to make the baseline-gap call flagged above.
3. When ready to build: new SQL migration for `aircraft_maintenance_schedule_templates` + `maintenance_records.hobbs_at_completion`, a new Admin Setup tab, the Model-field dropdown change in `AircraftFormModal.tsx`/`AircraftSetupTab.tsx`, and the due-date computation + auto-scheduling logic in `lib/store.ts`.

---


## ✅ 2026-08-25: real bug found via user testing of the new Partial Weekly Off Day feature — Settings saves never refreshed the shared app store — 1 file FIXED, delivered and confirmed byte-for-byte, ✅ COMMITTED AND PUSHED to `main` (commit `e293653`)

User set a partial weekly-off rule (Saturday, 1st/3rd/5th) and reported the calendar wasn't blocking `29-08-2026` — the 5th (last) Saturday of August 2026, which should match. Verified the date math itself was correct in isolation first (`Math.ceil(29/7) = 5`, confirmed `2026-08-29` really is a Saturday, `5` is in `[1,3,5]`) before looking for a different cause — an off-by-one in the occurrence math would have been the obvious first suspect, but it checked out clean.

**Root cause:** `SettingsTab.tsx` manages its own local component state and writes straight to Supabase — it never touched the shared Zustand app store's `ftoSettings`, which is what `BookingForm`/`ScheduleBoard`/`GroundSchoolCalendar` actually read for every weekly-off/partial-weekly-off/time-slot/etc. check. That store only loads `ftoSettings` once per session (`if (Object.keys(ftoSettings).length === 0) loadFTOSettings()`) and otherwise stays cached in memory for the rest of the browser session. So saving a Settings change while those other pages had already loaded earlier in the same session left them silently working off the pre-save values — no error, just stale state, until a full page reload. This is a pre-existing gap (predates this session's Partial Weekly Off Day feature — it would affect a `weekly_off_days` change the same way) that the new feature's testing happened to be the first thing to surface.

**Fix:** `SettingsTab.tsx` now imports the shared store and calls `loadFTOSettings()` at the end of a successful `handleSave`, alongside its own existing local `loadSettings()` reload — so ANY setting saved on this tab (not just the new partial-off rule) now takes effect app-wide immediately, no reload needed.

### Verification
- Sandbox `npx tsc --noEmit`: clean.
- Sandbox `npx eslint` on the touched file: 1 hit, the same pre-existing, already-documented `react-hooks/set-state-in-effect` on the tab's own load-on-mount effect — confirmed unrelated (different effect than the one touched).
- Pre-delivery check: staged the file from the device before editing, diffed (CRLF-normalized) against the sandbox's pre-fix copy — matched exactly, no undisclosed drift.
- Delivered via the device bridge (`SendUserFile` + `device_commit_files`, `expectedMtimeMs` guard), reported written, then re-staged and diffed byte-for-byte — **confirmed zero mismatches.**

### What must happen before this is testable
1. No SQL migration needed — pure client-side store-refresh fix.
2. Test: with the Schedule Board or Booking form already open in one browser tab, save a Settings change (e.g. toggle a weekly off day, or change the partial-off rule) in another tab/navigation — confirm the change takes effect immediately without a manual page reload.
3. Re-test the original report: set Saturday 1st/3rd/5th as the partial rule, save, then try booking/scheduling on `29-08-2026` (or navigate the Schedule Board to that date) — confirm it's now blocked with "Weekly off (5th Saturday)".
4. ~~This round is NOT yet committed to git~~ — ✅ **confirmed committed and pushed to `main` (2026-08-25)**, see below. **Not yet merged into `production`** — `production` is one commit behind at `ccc6a29`, correctly, until this is merged.

### ✅ Real-machine commit + push confirmed 2026-08-25

User ran it on the correct branch this time (`main`, not `production` — no repeat of the earlier mix-up) and pasted the full terminal output:

```
git add app/dashboard/admin/setup/SettingsTab.tsx
git commit -m "Fix FTO settings not taking effect app-wide until page reload (shared store wasn't refreshed on save)"
[main e293653] Fix FTO settings not taking effect app-wide until page reload (shared store wasn't refreshed on save)
 1 file changed, 16 insertions(+), 2 deletions(-)
git push origin main
   ccc6a29..e293653  main -> main
```

**Independently verified against GitHub directly** (`git ls-remote origin main production`): `refs/heads/main` resolves to `e2936530285c3355f9ca9cad50897b9826d988b4`; `refs/heads/production` correctly still resolves to `ccc6a29...`, one commit behind, pending merge.

**✅ Merged into `production` same day.** User ran it and pasted the output:

```
git checkout production
git merge main
Updating ccc6a29..e293653
Fast-forward
 app/dashboard/admin/setup/SettingsTab.tsx | 18 ++++++++++++++++--
 1 file changed, 16 insertions(+), 2 deletions(-)
git push origin production
   ccc6a29..e293653  production -> production
```

**Independently verified against GitHub** (`git ls-remote origin main production`): both `refs/heads/main` and `refs/heads/production` resolve to `e2936530285c3355f9ca9cad50897b9826d988b4`. Fully synced.

### What must happen next
1. Still outstanding: the user re-testing the original report (Saturday 1st/3rd/5th rule, `29-08-2026`) to confirm the calendar now blocks it correctly — not yet confirmed as of this update.

---


## ✅ 2026-08-25: NEW feature — Partial Weekly Off Day (occurrence-based, e.g. "every 2nd & 4th Saturday") — 5 files DELIVERED, confirmed byte-for-byte on the real machine, ✅ COMMITTED, PUSHED, AND MERGED INTO PRODUCTION (commit `e35fd11`)

User described three real-world FTO weekly-off patterns: (1) one full weekly off day, (2) two full weekly off days, (3) one full off day **plus** a day that's only off on specific occurrences each month (every 2nd & 4th Saturday, or every 1st/3rd/5th Saturday). Patterns 1-2 were already fully supported by the existing `weekly_off_days` day-of-week toggle. Pattern 3 needed a new, separate rule type — plan was proposed and confirmed with the user via AskUserQuestion **before writing any code**: scoped to one partial-off day at a time, blocked from overlapping a full weekly-off day, with occurrence-specific block messages (e.g. "Weekly off (2nd Saturday)").

**What was built:**
- **`lib/store.ts`** — new `PartialWeeklyOffRule` type (`{day, occurrences}`), `parsePartialWeeklyOffRule()` (lenient JSON parse, treats malformed as unset rather than throwing), `weekdayOccurrenceInMonth()` (`Math.ceil(dayOfMonth / 7)` — a month with fewer than 5 of a weekday simply never matches an `occurrences:[5]` rule, no special-casing needed), `isPartialWeeklyOffDay()`. `getSchedulingBlockReason()` extended with a 4th, defaulted (`= null`) `partialRule` param, checked after holiday and full weekly-off (priority order: holiday > full weekly off > partial weekly off) — the default keeps any not-yet-updated caller working exactly as before. Both in-store callers (`bookFlight`, `updateScheduledFlight`) updated to pass it.
- **`components/schedule/BookingForm.tsx`, `components/schedule/ScheduleBoard.tsx`, `components/ground-school/GroundSchoolCalendar.tsx`** — each now also parses `partial_weekly_off_days` from `ftoSettings` and passes it into `getSchedulingBlockReason()`, so every scheduling surface (flight booking, the schedule board's closed-day banner, ground-school class scheduling) picks up the new rule automatically.
- **`app/dashboard/admin/setup/SettingsTab.tsx`** — new "Partial Weekly Off Day" section below the existing "Weekly Off Day(s)" grid: a day-of-week dropdown (days already used by the full weekly-off toggle are disabled in the dropdown, with an inline note) plus, once a day is picked, five occurrence toggle chips (1st–5th). Stored as JSON in a new `partial_weekly_off_days` fto_settings key — additive, no migration needed (`fto_settings` is a plain key-value table), existing config untouched. The full weekly-off day toggle buttons are reciprocally disabled for whichever day the partial rule currently uses, with a tooltip explaining why — enforces the no-overlap rule confirmed with the user. A local, deliberately lenient parser (`getPartialRuleDraft`) is used only for this editing UI, separate from the strict store.ts parser used everywhere scheduling actually checks the rule — this lets a day be picked in the form before any occurrence is chosen yet, without the draft disappearing (the strict parser requires ≥1 occurrence to count as "set").

### Verification
- Sandbox `npx tsc --noEmit` (whole repo): clean.
- Sandbox `npx eslint` on all 5 touched files: 1 new hit caught and fixed mid-round (an unescaped apostrophe in new UI copy, `react/no-unescaped-entities`); after the fix, only the same pre-existing, already-documented `react-hooks/set-state-in-effect` findings remain on all 5 files — confirmed unrelated (none in the touched lines).
- Manually verified the date math in isolation (Node script, August 2026's five Saturdays: 1st/8th/15th/22nd/29th) — a `{day:6, occurrences:[2,4]}` rule correctly matches only the 8th and 22nd; a `{day:6, occurrences:[1,3,5]}` rule correctly matches the 1st/15th/29th; a non-Saturday date never matches a Saturday rule.
- Delivered via the device bridge (`SendUserFile` + `device_commit_files`, `expectedMtimeMs` guards), all 5 reported written, then re-staged and diffed byte-for-byte — **confirmed all 5 match exactly.**

### What must happen before this round is testable
1. No SQL migration needed — `fto_settings` is a schemaless key-value table, the new `partial_weekly_off_days` key is additive.
2. Test: Admin Setup → Settings → Time & Scheduling → set a partial rule (e.g. Saturday, 2nd & 4th) and save — confirm it persists after a page reload.
3. Test: try to also mark that same day as a full weekly off day — confirm the day-toggle button is disabled with an explanatory tooltip, and vice versa (the partial-rule dropdown disables a day already marked full-off).
4. Test: attempt to book a flight, schedule a ground-school class, and view the Schedule Board's closed-day banner on a matching occurrence date (e.g. the 2nd Saturday of a month) — confirm each is blocked with the message "Weekly off (2nd Saturday)". Confirm a NON-matching Saturday (e.g. the 1st, in a 2nd-&-4th rule) is NOT blocked.
5. ~~This round is NOT yet committed to git~~ — ✅ **confirmed committed, pushed, AND merged into `production` (2026-08-25)**, see below.

### ✅ Real-machine commit + push + merge confirmed 2026-08-25

User ran everything directly and pasted the full terminal output. First, the earlier null-input fix (commit `f797d1b`) was merged `main` → `production` (clean fast-forward), then this Partial Weekly Off Day round was committed and pushed to `main`:

```
git add lib/store.ts app/dashboard/admin/setup/SettingsTab.tsx components/schedule/BookingForm.tsx components/schedule/ScheduleBoard.tsx components/ground-school/GroundSchoolCalendar.tsx
git commit -m "Add Partial Weekly Off Day (occurrence-based, e.g. every 2nd/4th Saturday) alongside full weekly off days"
[main e35fd11] Add Partial Weekly Off Day (occurrence-based, e.g. every 2nd/4th Saturday) alongside full weekly off days
 5 files changed, 215 insertions(+), 18 deletions(-)
git push origin main
   f797d1b..e35fd11  main -> main
```

...then merged into `production`:

```
git checkout production
git merge main
Updating f797d1b..e35fd11
Fast-forward
 app/dashboard/admin/setup/SettingsTab.tsx         | 129 +++++++++++++++++++++-
 components/ground-school/GroundSchoolCalendar.tsx |   7 +-
 components/schedule/BookingForm.tsx               |   8 +-
 components/schedule/ScheduleBoard.tsx             |   9 +-
 lib/store.ts                                      |  80 +++++++++++++-
 5 files changed, 215 insertions(+), 18 deletions(-)
git push origin production
   f797d1b..e35fd11  production -> production
```

Real commit hash + push confirmation pasted directly from the user's terminal. **`main` and `production` are both now at `e35fd11`.** The `git commit` output explicitly says "5 files changed" — matching the 5 files in this round's own `git add` command — so this commit is scoped to the Partial Weekly Off Day round only.

**⚠️ Important: the broader icon-button `aria-label` coverage round (item 38, 11 files: the 7 Admin Setup CRUD tabs + Availability/Maintenance/Attendance) is STILL NOT COMMITTED.** The `git checkout production` output the user pasted listed all 11 of those files as locally modified (`M ...`) — that's git's "carrying uncommitted changes across the branch switch" listing, confirming they were never part of the `git add` for this commit and remain uncommitted working-tree changes on both `main` and `production` right now. Don't assume they're live just because `production` was just merged/pushed — they need their own separate `git add`/`git commit`/`git push`.

### What must happen next
1. **Commit the still-outstanding aria-label round (item 38)** — the 11 files listed above. Suggested command (same as given earlier in this doc):
   ```
   git add app/dashboard/admin/setup/AircraftSetupTab.tsx app/dashboard/admin/setup/ExercisesTab.tsx app/dashboard/admin/setup/GroundSchoolTab.tsx app/dashboard/admin/setup/HolidaysTab.tsx app/dashboard/admin/setup/RequirementsTab.tsx app/dashboard/admin/setup/RolesTab.tsx app/dashboard/admin/setup/SortieTypesTab.tsx app/dashboard/admin/setup/TrainingProgramsTab.tsx app/dashboard/availability/page.tsx app/dashboard/maintenance/page.tsx app/dashboard/ground-school/attendance/page.tsx
   git commit -m "Add aria-label to edit/delete icon buttons across Admin Setup, Availability, Maintenance, and Attendance"
   git push origin main
   ```
2. Spot-check on `production`: set a partial weekly-off rule (e.g. Saturday, 2nd & 4th) in Settings, then try booking a flight/ground-school class on a matching vs. non-matching Saturday — confirm only the matching one blocks, with the "Weekly off (2nd Saturday)" message.
3. Same for the day-toggle mutual-exclusivity UI (full weekly-off vs. partial-rule day) — confirm each disables the other as designed.

---


## ✅ 2026-08-25: DGCA Class 1 auto-expiry feature — USER-CONFIRMED WORKING

User tested the Medical Issue Date → auto-calculated Medical Expiry feature (12mo under 40 / 6mo 40+, DGCA Class 1, minus 1 day) directly and confirmed it works. Item 33/49's testing requirement for this specific feature is now closed — the round it shipped in (commit `1fd8db6`, live on both `main` and `production`) is confirmed functionally correct, on top of the sandbox's earlier manual verification.

## ✅ 2026-08-25: Broader icon-button `aria-label` coverage (edit/delete pencil/trash icons) — item 38 — 11 files DELIVERED, confirmed byte-for-byte on the real machine, ✅ COMMITTED, PUSHED, AND MERGED — `main`/`production` both at `ccc6a29`

Closes out item 38, deliberately deferred from session 7's accessibility round (which scoped itself to Close buttons only, the most acute gap). A JSX-aware scan (a naive regex broke on `onClick={() => ...}` arrow functions inside button attributes — `=>`'s `>` was mistaken for the tag close; rewritten as a small hand-rolled brace/string-aware parser) found every icon-only `<button>` containing a `Pencil`/`Trash2` icon with no visible text and no existing `aria-label`.

**11 files, 19 buttons total:**
- Admin Setup's 7 CRUD tabs (`AircraftSetupTab.tsx`, `ExercisesTab.tsx`, `GroundSchoolTab.tsx`, `HolidaysTab.tsx` [delete only — no edit for holidays], `RequirementsTab.tsx`, `RolesTab.tsx`, `SortieTypesTab.tsx`, `TrainingProgramsTab.tsx`) — each Edit/Delete pair now labeled with the row's own identifying name (e.g. `aria-label={\`Edit ${ac.registration}\`}`, `` `Delete ${exercise.exercise_name}` ``, etc.), not a generic "Edit"/"Delete".
- `app/dashboard/availability/page.tsx` — `` `Edit ${record.personName}'s leave record` `` / `` `Delete ...` ``.
- `app/dashboard/maintenance/page.tsx` — `` `Edit ${record.aircraftReg} ${record.maintenanceType} record` `` / `` `Delete ...` ``.
- `app/dashboard/ground-school/attendance/page.tsx` — one Remove-student button, `` `Remove ${student?.name || enr.student_id}` ``.

**Deliberately NOT touched this round (disclosed, scoped decision):** the password show/hide `Eye`/`EyeOff` toggle buttons in `app/login/page.tsx` and `app/change-password/page.tsx` (3 instances) — same icon-only-no-aria-label gap, but a different UI element (visibility toggle, not edit/delete) and outside this item's stated scope. Also confirmed NOT in scope: `StudentCard.tsx`, `InstructorCard.tsx`, `AircraftCard.tsx`'s Edit/Remove buttons — these already have visible "Edit"/"Remove" text next to the icon, so they were never actually icon-only despite using the same icons.

### Verification
- Sandbox `npx tsc --noEmit` (whole repo): clean.
- Sandbox `npx eslint` on all 11 touched files: 10 hits, every one the same pre-existing, already-documented `react-hooks/set-state-in-effect` on each file's "load on mount" `useEffect` — confirmed unrelated (none in the touched button lines).
- Delivered via the device bridge (`SendUserFile` + `device_commit_files`, `expectedMtimeMs` guards), all 11 reported written, then re-staged and diffed byte-for-byte (CRLF-normalized) — **confirmed all 11 match exactly, each diff containing only the intended `aria-label` addition.**

### What must happen before this round is testable
1. No SQL migration needed — pure accessibility attribute addition, zero logic/behavior change.
2. Test: tab to any Edit/Delete pencil/trash icon button across the 7 Admin Setup tabs, Availability, Maintenance, and Ground School Attendance — a screen reader (or an accessibility inspector) should now announce a specific label (e.g. "Edit VT-ABC", not just "button").
3. ~~This round is NOT yet committed to git~~ — ✅ **confirmed committed, pushed, AND synced across both branches (2026-08-25)** — see below.

### ✅ Real-machine commit + push + sync confirmed 2026-08-25 (with one wrinkle, now resolved)

The commit was made while on `production` rather than `main` (`git commit` output read `[production ccc6a29]`), and the immediate `git push origin main` reported "Everything up-to-date" — because it pushed `main` (unchanged) rather than `production` (which actually had the new commit). Caught by comparing the terminal output against a direct `git ls-remote` check of GitHub (not just trusting the local terminal text), which showed `origin/production` and `origin/main` both still at the previous commit `e35fd11` with `ccc6a29` nowhere on GitHub yet.

Resolved with:
```
git push origin production
   e35fd11..ccc6a29  production -> production
git checkout main
git merge production
Updating e35fd11..ccc6a29
Fast-forward
 11 files changed, 20 insertions(+), 20 deletions(-)
git push origin main
   e35fd11..ccc6a29  main -> main
```

**Independently verified against GitHub directly (`git ls-remote origin production main`) — both `refs/heads/main` and `refs/heads/production` now resolve to `ccc6a29927438b2c78642fb927fb47216ef4e8209`.** Fully synced, not just taken on the user's terminal-output word alone.

---


## ✅ 2026-08-25: React "value prop on input should not be null" console error on Medical Expiry — FIXED, confirmed working, ✅ COMMITTED AND PUSHED to `main` (commit `f797d1b`)

Found via the team's testing pass (per the new QA test plan): opening the Students form threw a React console error at `StudentFormModal.tsx:423` ("`value` prop on `input` should not be null") on the Medical Expiry field.

**Root cause:** `medical_expiry` can be `null` in the database for a student who never had one set. Unlike every other date field on the row, it was mapped straight through with no fallback in two places — `lib/store.ts`'s `loadStudents()` row mapper (`medicalExpiry: row.medical_expiry as string`) and `StudentFormModal.tsx`'s populate-on-edit effect (`medicalExpiry: student.medicalExpiry`) — so a raw `null` reached the controlled `<input value={form.medicalExpiry}>`.

**Fix:** both now fall back to `''` (not `undefined`, since `StudentRecord.medicalExpiry` is typed as a required, non-optional `string`). `lib/store.ts` line ~647 and `StudentFormModal.tsx` line ~126.

### Verification
- Sandbox `npx tsc --noEmit`: clean.
- Sandbox `npx eslint` on both files: `lib/store.ts` clean; `StudentFormModal.tsx` has only the same pre-existing, already-documented `react-hooks/set-state-in-effect` on its populate-on-edit effect — unrelated.
- Pre-delivery check: staged both files from the device before editing, diffed (CRLF-normalized) against the sandbox's pre-edit copies — no undisclosed drift.
- Delivered via the device bridge (`SendUserFile` + `device_commit_files`, `expectedMtimeMs` guards), reported written, then re-staged and diffed byte-for-byte — **confirmed zero mismatches.**
- **User confirmed 2026-08-25: "issue fixed"** — functional confirmation (console error gone).
- **✅ Real-machine commit + push confirmed 2026-08-25.** User ran it directly and pasted the full terminal output:

```
git add components/students/StudentFormModal.tsx lib/store.ts
git commit -m "Fix null value on Medical Expiry input (React controlled-input warning)"
[main f797d1b] Fix null value on Medical Expiry input (React controlled-input warning)
 2 files changed, 16 insertions(+), 2 deletions(-)
git push origin main
   1fd8db6..f797d1b  main -> main
git status
On branch main. Your branch is up to date with 'origin/main'. nothing to commit, working tree clean.
```

Real commit hash + push confirmation pasted directly from the user's terminal — `main` is now at `f797d1b`.

**✅ Merged into `production` same day — `production` now at `f797d1b`, matching `main`.** User ran the merge and push on the real machine and pasted back the full terminal output:

```
git checkout production
Switched to branch 'production'
Your branch is up to date with 'origin/production'.
git status
On branch production. Your branch is up to date with 'origin/production'. nothing to commit, working tree clean.
git merge main
Updating 1fd8db6..f797d1b
Fast-forward
 components/students/StudentFormModal.tsx |  8 +++++++-
 lib/store.ts                             | 10 +++++++++-
 2 files changed, 16 insertions(+), 2 deletions(-)
git push origin production
   1fd8db6..f797d1b  production -> production
git checkout main
Switched to branch 'main'
```

Clean fast-forward, real terminal output pasted directly. `main` and `production` are both at `f797d1b`.

### What must happen next
1. No SQL migration needed — pure client/store null-handling fix.
2. Spot-check on `production`: open the Students form (add and edit an existing student) and confirm the "value prop on input should not be null" console error is gone — this was already confirmed in testing before commit, so this is just a final sanity check now that it's live.

---


## ✅ 2026-08-25: two follow-ups to the SPL/CPL bugfix — the "-1 day inclusive" business rule, and a brand-new Medical Issue Date + age-based DGCA Class 1 auto-expiry feature — 6 files + 1 new SQL migration, delivered and confirmed byte-for-byte, migration NOT YET run, code NOT YET committed

Two follow-up requests from the user immediately after the SPL/CPL timezone bugfix above:

### 1. "-1 day inclusive" business rule for SPL/CPL expiry

User clarified the intended license-validity rule: a license issued 30-08-2026 should expire 29-08-2036 — exactly 10 years, *inclusive* of the issue date — not 30-08-2036. `addYears()` in both `StudentFormModal.tsx` and `InstructorFormModal.tsx` now subtracts one day after adding the years, on top of the timezone fix from the previous round. Verified against the user's exact example plus several edge cases (year-boundary rollover, and both Feb-29-target-is-leap and Feb-29-target-is-non-leap cases) — all correct. Delivered, confirmed byte-for-byte, still not yet committed (folds into the same pending commit as the timezone fix above).

### 2. New: Medical Issue Date field + age-based DGCA Class 1 auto-expiry for students

User noticed Students only ever had a manually-entered Medical Expiry with no Issue Date at all (unlike SPL/CPL, which already had the issue-date-plus-validity pattern). Investigated the actual DGCA medical validity rule via web search before building anything, since guessing wrong on a real compliance-facing date is worse than not automating it at all — found conflicting numbers across aviation-school blog sources (some said Class 2 = 24 months flat, others suggested different figures), reported the discrepancy back to the user rather than picking one silently. **User confirmed the applicable rule for flying SPL holders is DGCA Class 1, age-based: 12 months validity if under 40 on the issue date, 6 months if 40 or older** (same -1-day inclusive convention as SPL/CPL applied on top).

This requires knowing the student's age at the medical issue date, which requires Date of Birth — a field that already existed in `StudentFormModal.tsx`'s component state and was already wired all the way through the API/store, but **had no actual input in the form's JSX** (a pre-existing gap, not something this round introduced — Date of Birth was silently uncollectable via the UI this whole time). Added the missing Date of Birth input, and a new Medical Issue Date input, to the Students form.

**What was built:**
- **`add-medical-issue-date.sql` (NEW)** — `alter table students add column if not exists medical_issue_date date;`, same separate-migration convention as every other date field added this engagement. **Not yet run.**
- **`types/index.ts`** — `StudentRecord.medicalIssueDate?: string`.
- **`app/api/students/route.ts`** (POST) — accepts `medicalIssueDate` → `medical_issue_date`. Also hardened: `medical_expiry` and `date_of_birth` now use the same `|| null` coercion the SPL fields already had (previously missing — harmless while Date of Birth had no UI input to ever send `''`, but a live gap now that it does).
- **`app/api/students/[id]/route.ts`** (PATCH) — `medicalIssueDate` added to `FIELD_MAP`; the `'' → null` date-column coercion (previously only applied to `spl_expiry_date`/`spl_issue_date`) is now applied uniformly to all five date columns (`date_of_birth`, `medical_expiry`, `medical_issue_date`, `spl_expiry_date`, `spl_issue_date`) via a small loop instead of two one-off `if` blocks.
- **`lib/store.ts`** — `loadStudents()` row mapper maps the new column.
- **`components/students/StudentFormModal.tsx`** — new Date of Birth field (grid-paired with Total Hours) and Medical Issue Date field (grid-paired with Medical Expiry). Three new helpers: `addMonths()` (same local-time-safe, inclusive-of-issue-date pattern as `addYears()`, with day-of-month clamping for month-length differences), `ageAtDate()` (whole-years age as of a given date, correct at the exact-birthday boundary), and `computeMedicalExpiry()` (applies the 12mo/6mo DGCA Class 1 rule). Same "auto until touched" pattern as SPL/CPL: editing either Date of Birth or Medical Issue Date recomputes Medical Expiry unless it's been directly edited (or already had a real value when an existing student was loaded); a hint tells the user to enter Date of Birth first if it's missing.

### Verification

- Sandbox `npx tsc --noEmit` (whole repo): clean.
- Sandbox `npx eslint` on all touched files: 1 hit, the same pre-existing `react-hooks/set-state-in-effect` on `StudentFormModal.tsx`'s populate-on-edit effect already documented above — confirmed unrelated.
- Manually verified `addMonths()`/`ageAtDate()`/`computeMedicalExpiry()` under `TZ=Asia/Kolkata` against multiple cases: under-40, 40-or-older, and the exact-40th-birthday boundary (correctly resolves to the 6-month tier, not 12) — all correct.
- Pre-delivery check: staged all pre-existing files from the device before editing — `StudentFormModal.tsx` and `lib/store.ts` matched their last-delivered mtimes exactly (the timezone-bugfix round just before this one); `types/index.ts` and both API route files matched a much older mtime (session 2 era, untouched since) — no undisclosed drift on any of them.
- Delivered via the device bridge (`SendUserFile` + `device_commit_files`, `expectedMtimeMs` guards where a prior mtime existed), all reported written, then re-staged and diffed byte-for-byte (CRLF-normalized) — **confirmed all 6 files match exactly.**

### What must happen before this is testable

1. **Run `add-medical-issue-date.sql` in Supabase first** — nothing below works until this lands; the app will fail to save the new field until the column exists.
2. Test: add/edit a student, fill in Date of Birth and Medical Issue Date (for a student under 40) — confirm Medical Expiry auto-fills to issue date + 12 months − 1 day.
3. Test: same for a student who would be 40 or older on the issue date — confirm Medical Expiry auto-fills to issue date + 6 months − 1 day instead.
4. Test: manually edit the auto-filled Medical Expiry, then change Date of Birth or Medical Issue Date again — confirm Medical Expiry is NOT overwritten once touched directly.
5. Test: leave Date of Birth blank and enter only Medical Issue Date — confirm the "Enter Date of Birth above" hint shows and Medical Expiry does not auto-fill (should not silently guess an age).
6. Test SPL/CPL Expiry Date auto-fill once more with the updated -1-day rule: issue 30-08-2026 should now show expiry 29-08-2036 exactly, for both Students and Instructors.
7. This round is NOT yet committed to git — same as the timezone bugfix above — the user needs to run `git add`/`git commit`/`git push` and paste back confirmation. Both rounds can go in the same commit.

---

## ✅ 2026-08-25: real bug found via team testing — SPL/CPL Expiry Date auto-fill was silently wrong in IST — 2 files FIXED, delivered and confirmed byte-for-byte, NOT YET committed

User's team started testing per the new QA test plan (see the "New tester" deliverable note below) and immediately found a real bug: on Students, entering an SPL Issue Date was not auto-populating SPL Expiry Date as expected (session 6's "issue date + 10 years, auto until touched" feature).

**Root cause:** `addYears()` — a small date-math helper duplicated identically in both `components/students/StudentFormModal.tsx` and `components/instructors/InstructorFormModal.tsx` — built its result via `d.toISOString().split('T')[0]`. `Date.toISOString()` always converts to UTC first. For any timezone AHEAD of UTC — including IST (UTC+5:30), this FTO's own timezone — local midnight is still the *previous day* in UTC, so the computed expiry date came out **one calendar day early** every time (e.g. issue date 2026-08-25 produced 2036-08-24, not 2036-08-25). Confirmed directly: `new Date("2026-08-25T00:00:00").toISOString()` under `TZ=Asia/Kolkata` returns `2026-08-24T18:30:00.000Z`. Depending on exactly what the user saw/expected, this could plausibly read as "not populating" rather than "populating with the wrong date" — either way, it was a real, confirmed defect, not a false report.

**Fix:** both copies of `addYears()` now build the returned string directly from the `Date` object's own local-time fields (`getFullYear()`/`getMonth()`/`getDate()`) instead of round-tripping through `toISOString()`. Verified against multiple cases including the Feb-29-in-a-non-leap-target-year edge case (still correctly clamps to Feb 28) and a leap-target-year case (correctly keeps Feb 29) — all now produce the exact expected date under `TZ=Asia/Kolkata`.

**This is a pre-existing bug, not something introduced by this session's work** — the feature was built and committed back in session 6 (2026-08-21, part of commit `5c24c73`), and neither file was touched by any of today's rounds. It simply hadn't been exercised by anyone in the FTO's own timezone until the team's testing pass just now — a good early sign that the new QA test plan is doing its job.

### Verification

- Sandbox `npx tsc --noEmit` (whole repo): clean.
- Sandbox `npx eslint` on both touched files: 2 hits, both the same pre-existing, already-documented `react-hooks/set-state-in-effect` on each file's populate-on-edit `useEffect` — confirmed unrelated to this change (same lines flagged before and after).
- Pre-delivery check: staged both files from the device before editing and diffed — matched the sandbox's pre-fix copy exactly, confirming this is genuinely live on the real machine as-is (not already-patched, not something a stash race reverted).
- Manually verified the fixed `addYears()` logic under `TZ=Asia/Kolkata` against several inputs, including both Feb-29 edge cases — all correct.
- Delivered via the device bridge (`SendUserFile` + `device_commit_files`, `expectedMtimeMs` guards), reported written, then re-staged and diffed byte-for-byte (CRLF-normalized) — **confirmed zero mismatches.**

### What must happen before this is testable

1. No SQL migration needed — pure client-side date-math fix, no schema or API touched.
2. Test: on Students, add/edit a student and set SPL Issue Date — confirm SPL Expiry Date auto-fills to the exact same day, 10 years later (not one day earlier).
3. Test: same for an instructor's CPL Issue Date/Expiry Date.
4. Test: pick Feb 29 as an Issue Date in a leap year — confirm the +10-year expiry correctly falls back to Feb 28 (10 years later target is never a leap year in this specific case, but worth spot-checking any Feb 29 issue date against whichever target year applies).
5. This round is NOT yet committed to git — the user needs to run `git add`/`git commit`/`git push` on the real machine and paste back confirmation.

---

## ✅ 2026-08-25: modal-theming fix (third round) + no-explicit-any/exhaustive-deps/no-img-element cleanup (fourth round) CONFIRMED committed and pushed to `main`

User ran the commit and push on the real machine and pasted back the full terminal output:

```
git add -A
git commit -m "Fix hardcoded dark Tailwind classes in 5 modals; clean up no-explicit-any/exhaustive-deps/no-img-element lint issues"
[main 91b5ff0] Fix hardcoded dark Tailwind classes in 5 modals; clean up no-explicit-any/exhaustive-deps/no-img-element lint issues
 34 files changed, 410 insertions(+), 289 deletions(-)
 create mode 100644 docs/FlightPro_Manager_Master_Plan_Tracker.xlsx
git push origin main
   4aefc5c..91b5ff0  main -> main
```

This is a real commit hash + push confirmation pasted directly from the user's terminal — both the modal-theming round (5 files) and the lint cleanup round (32 files, some overlapping with the modal round since a few files needed both fixes, hence 34 total rather than 37) are now committed and pushed to `main`, together with the Master Plan Tracker xlsx (previously delivered but untracked).

**✅ 2026-08-25 (later same day): SPL/CPL "-1 day inclusive" fix + Medical Issue Date feature CONFIRMED committed and pushed to `main`.** User ran the commit and push on the real machine and pasted back the full terminal output:

```
git add -A
git commit -m "Fix SPL/CPL expiry auto-fill (timezone + inclusive-day rule); add Medical Issue Date with DGCA Class 1 age-based auto-expiry"
[main 1fd8db6] Fix SPL/CPL expiry auto-fill (timezone + inclusive-day rule); add Medical Issue Date with DGCA Class 1 age-based auto-expiry
 8 files changed, 189 insertions(+), 30 deletions(-)
 create mode 100644 add-medical-issue-date.sql
 create mode 100644 docs/FlightPro_Manager_QA_Test_Plan_NewTester.docx
git push origin main
   45a970e..1fd8db6  main -> main
```

Real commit hash + push confirmation pasted directly from the user's terminal. This is commit `1fd8db6`, covering: the SPL/CPL Expiry auto-fill fix (both the timezone bug and the "-1 day inclusive" business-rule correction), the new Medical Issue Date + DGCA Class 1 age-based auto-expiry feature (7 code/type/API/store files), the new `add-medical-issue-date.sql` migration, and the QA Test Plan docx (delivered earlier, previously untracked). **Note: the commit's base (`45a970e`) is not the same hash (`91b5ff0`) this doc last confirmed on `main`/`production` — something else landed on `main` in between that this session didn't make; not investigated, flagging only so a future session doesn't assume `git log` here is fully accounted for by this doc alone.**

✅ **`add-medical-issue-date.sql` confirmed run by the user (2026-08-25).** The new Medical Issue Date field and its DGCA Class 1 age-based auto-expiry are now functionally testable. **Not yet merged into `production`** — decision pending, same considerations as the modal-theming/lint-cleanup round above (this round hasn't been through any of the team's testing pass yet, unlike that round).

---

**✅ Merged into `production` same day — `production` now at `91b5ff0`, matching `main`.** User ran the merge and push on the real machine and pasted back the full terminal output:

```
git checkout production
Switched to branch 'production'
Your branch is up to date with 'origin/production'.
git status
On branch production. Your branch is up to date with 'origin/production'. nothing to commit, working tree clean.
git merge main
Updating 4aefc5c..91b5ff0
Fast-forward
 34 files changed, 410 insertions(+), 289 deletions(-)
 create mode 100644 docs/FlightPro_Manager_Master_Plan_Tracker.xlsx
git push origin production
   4aefc5c..91b5ff0  production -> production
```

Clean fast-forward, real terminal output pasted directly. User's explicit call: rather than sequence testing round-by-round, have the team do a full click-through test of the whole app now that everything is live together. **This means FOUR rounds are now simultaneously live on `production`, all still untested as of this update:** session 7's security/accessibility hardening (items 35-36), the My-Students-scoping/Quick-Actions-removal round (items 43-44), the modal-theming fix, and the lint cleanup round. See the combined testing checklist below.

### Combined testing checklist for the team (everything now live on `production` as of `91b5ff0`)

**Security (session 7 — highest priority, items 35):**
1. Each of the 7 Admin Setup config-route tabs (Exercises, Training Programs, Roles, Sortie Types, Ground School, Requirements, Holidays) still add/edit/delete correctly.
2. Aircraft Setup (in Admin Setup) still adds/edits/deletes aircraft correctly.
3. IDOR fix: log in as a student, try `/dashboard/ground-school/progress?student=<another-student-uuid>` — confirm it shows YOUR OWN progress, not theirs.
4. Direct exam entry (staff, Ground School → Progress → Mark as Completed) still records roll number/score/EXEMPTED result correctly.
5. (Optional/negative test) hitting `/api/admin/config/exercises` directly with a non-`super_admin` session is rejected; an extra non-whitelisted field in the body is silently dropped.

**Accessibility (session 7, item 36):**
6. Open each of the 15 modals and press Escape — confirms it closes.
7. Tab to each Close (X) button — screen reader/accessibility inspector announces "Close".

**My Students scoping + Quick Actions removal (items 43-44):**
8. Log in as instructor — "My Students" still appears in the sidebar and works.
9. Log in as admin/super_admin — "My Students" no longer appears; navigating to `/dashboard/instructor` directly shows "Not Authorized".
10. Dashboard home page — "Quick Actions" tile grid is gone; layout still looks right (NOTAM card flows directly into Fleet Fuel Status).

**Modal theming (item 46):**
11. Toggle light mode, open each of the 5 fixed screens (Flight Detail, Requirements Checklist's DGCA/SPL modals, Log Flight form, Booking form, Debrief form) — confirm text is readable.
12. Toggle back to dark mode on the same 5 — confirm no regression.
13. Confirm accent colors (submit buttons, warning banners, error text, status badges) are still correct in both themes.

**Lint cleanup (item 47) — should be functionally invisible, but worth a normal pass over:**
14. All four dashboards, Ground School attendance/progress, Admin Setup's Exercises/Requirements tabs, Booking/Flight Record/Maintenance forms — general use, nothing should behave differently than before. (`tsc`/`lint`/`build` already independently confirmed clean on the real machine — see above.)

**Also still open from earlier:** instructor roster view access (item 11, resolved but should be spot-checked), general smoke-testing items 3, 12, 29, 30.

---

## ✅ 2026-08-25 (fourth round): `no-explicit-any` / `react-hooks/exhaustive-deps` / `@next/next/no-img-element` cleanup — 32 files DELIVERED, confirmed byte-for-byte on the real machine, ✅ COMMITTED AND PUSHED to `main` (commit `91b5ff0`). Lint went from 97 problems → 32, all 32 remaining exclusively `react-hooks/set-state-in-effect` (deliberately untouched)

User, reviewing a pasted `npm run lint` output showing 97 problems (81 errors, 16 warnings) and asking whether the increase from an earlier-remembered "78 errors" was a regression, got an explanation that it wasn't (the 78 figure was the much older session-1 baseline; six sessions of feature work since then had added incremental debt in the same already-deferred lint categories — reproduced the exact 97-problem count independently in the sandbox to confirm). Given a roadmap of what's fixable vs. architectural, the user asked to proceed with the `no-explicit-any`/`exhaustive-deps` cleanup as a "quick win and non-disruptive," correctly guessing much of it traced back to older manual code — explicitly leaving `react-hooks/set-state-in-effect` alone (the established-pattern "load data on mount" `useEffect`, architectural rather than a bug — fixing it would mean a data-fetching-library migration).

### What was fixed

**`no-explicit-any`** — fixed via several recurring patterns:
- `catch (err: any)` → drop the annotation entirely (an untyped catch is `unknown` under this tsconfig); narrow with `err instanceof Error ? err.message : 'fallback text'` before accessing `.message`. Applied across ~10 files (API routes, `lib/email.ts`, several dashboard pages).
- Redundant `(session.user as any).role`/`.studentId` casts removed in favor of direct property access — `types/next-auth.d.ts` already declares `Session.user.role?`, `.studentId?`, `.forcePasswordReset?`, so these casts were unnecessary the whole time. Fixed in `app/dashboard/page.tsx`, `app/dashboard/student/page.tsx`, `app/dashboard/ground-school/page.tsx`, `app/dashboard/ground-school/progress/page.tsx`, `app/login/page.tsx`, `components/dashboard/RequirementsChecklist.tsx`. `components/ui/Header.tsx` kept an explicit `as { role?: string }` cast to match the pre-existing pattern already used in `Sidebar.tsx`.
- Redundant `(x as any)` casts on fields already declared in `types/index.ts` — `ScheduledFlight.exercise?`/`FlightRecord.exercise?` were already typed, so casts on `.exercise` access were dropped outright in `lib/store.ts`, `app/dashboard/instructor/page.tsx`, `components/schedule/ScheduleBoard.tsx`.
- Local interfaces added where a genuinely untyped shape needed one: `FaaNotamEntry` (`lib/notam.ts`), `MetarCloudLayer`/`MetarData` (`lib/weather.ts`), `GroundSchoolClassRow` (`app/dashboard/ground-school/attendance/page.tsx`, `app/dashboard/ground-school/page.tsx`), `JsPDFWithAutoTable extends jsPDF { lastAutoTable?: { finalY: number } }` (`lib/pdf.ts`, replacing 3 `(doc as any).lastAutoTable` casts).
- **Supabase embed-join array-vs-object mismatch** (`app/dashboard/ground-school/progress/page.tsx`) — Supabase's untyped client structurally infers every embedded relation as an array regardless of true FK cardinality, but this page's existing (working) code accesses `ground_school_subjects`/`instructors` as singular objects. Rather than fight the client's incorrect inferred type, cast via an intermediate `rawClasses` variable using `as unknown as {...}[]` matching the REAL runtime shape (with an explanatory comment), then mapped over that preserving the original singular-object access pattern exactly.
- `lib/store.ts` — 7 locations fixed, mostly redundant casts where the underlying param type (`Record<string, unknown>` row, `Partial<ScheduledFlight>`/`Omit<ScheduledFlight,...>`) already declared the field; no function signatures changed (widely-imported file).
- `app/dashboard/admin/setup/ExercisesTab.tsx` — `useState<any>(null)` → `useState<Exercise | null>(null)` for `editing`.

**`react-hooks/exhaustive-deps`** — fixed via two patterns depending on where the loader lives:
- A locally-defined `loadX` function: wrap in `useCallback(async () => {...}, [deps])` with its own correct deps, then add `loadX` to the calling `useEffect`'s dependency array. Applied to `RequirementsTab.tsx` (`loadPrograms`/`loadRequirements`), `app/dashboard/admin/setup/page.tsx` (`completedTabs`, safe via the functional-update pattern already in use), several small `isSolo`/`isMaintenance`-clearing effects in `BookingForm.tsx` (added `form.instructorId`/`form.studentId`/`form.exercise`, safe since they already use `setForm(prev => ...)`), and `GroundSchoolCalendar.tsx`'s `today` (`const today = useMemo(() => new Date(), [])`, needed once two `useMemo`s downstream started depending on it).
- A `loadX` sourced from the zustand store (`useFlightStore`): already a stable reference across renders, so just add it directly to the deps array — no `useCallback` needed. Applied to `app/dashboard/instructor/page.tsx`'s "load all data on mount" effect (`loadInstructors`, `loadStudents`, `loadScheduledFlights`, `loadFlightRecords`), `app/dashboard/flights/page.tsx`, `app/dashboard/maintenance/page.tsx`, load functions in `FlightRecordForm.tsx` and `MaintenanceForm.tsx`.

**`@next/next/no-img-element`** — the 2 hits, both admin-uploaded-image `<img>` tags, switched to Next's `<Image>` with `fill` + `unoptimized` (an external/admin-controlled URL, not one of the app's own optimizable static assets): `app/dashboard/admin/setup/SettingsTab.tsx` (org logo upload) and `components/ui/Header.tsx` (FTO logo).

### ⚠️ Discovered mid-round: concurrent `git stash`/`stash pop` operations on this shared sandbox silently reverted several already-fixed, already-verified files

Two of the seven parallel subagents used for this cleanup independently reported their own edits being reverted mid-task by what they described as a concurrent session's `git stash` activity on the same sandbox working directory, and claimed to have recovered. **Their self-reports were not taken at face value** — after all seven agents finished, an independent, centralized full-repo `tsc --noEmit` + `npm run lint` pass was run, and the count had only dropped from 97 to 45 (not to the expected ~30), revealing that several specific fixes had in fact been silently reverted *after* those agents' own clean verification: `ExercisesTab.tsx`, `app/dashboard/ground-school/progress/page.tsx`, `app/dashboard/instructor/page.tsx`, `app/dashboard/page.tsx`, `RequirementsTab.tsx`. Every one of these was re-fixed directly (Read + Edit + immediate per-file `tsc`/`eslint` check), deliberately not re-delegated to another agent, to avoid repeating the same race. A final full-repo pass after the direct fixes confirmed `tsc` clean and lint at exactly 32 problems, all `react-hooks/set-state-in-effect`, zero remaining in any targeted category. The earlier modal-theming round's 5 files were also re-checked at this point and confirmed NOT clobbered (grep for `var(--)` tokens intact, zero hardcoded dark classes).

**This is now flagged as a standing operational risk for this sandbox** — see the new Convention entry below. The practical rule going forward: after ANY batch of parallel-agent edits in this sandbox, always run one final independent full-repo `tsc`/`lint` pass before considering the work done, and fix any discovered gap directly rather than re-delegating.

### Verification

- Sandbox `npx tsc --noEmit` (whole repo, after all fixes including the direct re-fixes): clean.
- Sandbox `npm run lint` (whole repo, final pass): **32 problems, 32 errors, 0 warnings — all exclusively `react-hooks/set-state-in-effect`.** Zero `no-explicit-any`, zero `exhaustive-deps`, zero `no-img-element` remaining anywhere in the repo.
- All 32 touched files delivered via the device bridge (`SendUserFile` + `device_commit_files`, all reported written, zero rejected), then re-staged in two batches and diffed byte-for-byte (CRLF-normalized) against the sandbox copies — **confirmed all 32 files match byte-for-byte.**

### ✅ Real-machine confirmation (2026-08-25, same day)

User ran all three commands directly on the real machine and pasted the full output:

- `npx tsc --noEmit` — clean, zero errors.
- `npm run lint` — **exactly 32 problems, 32 errors, 0 warnings, all `react-hooks/set-state-in-effect`** — matches the sandbox's final prediction exactly (every one of the 32 flagged lines is a `loadX()`/`setForm(...)`/`setX(...)` call inside a "load/populate on mount or on dependency change" effect, the deliberately-deferred pattern).
- `npm run build` — **succeeded fully** (Turbopack, "Compiled successfully in 6.0s", TypeScript finished clean, all 32 routes generated with no errors).

This is the strongest confirmation this round has had — independently verifying not just `tsc`/`lint` (as sandbox predictions had matched exactly every round so far) but a full production `build`, on the actual machine, after a round that was unusually disrupted mid-flight by the concurrent-stash-race issue. No regressions found.

### What must happen before this round is testable

1. No SQL migration needed — pure type/lint cleanup, no logic behavior intentionally changed. The riskiest-looking change (the `rawClasses` cast in `ground-school/progress/page.tsx`) preserves the exact pre-existing runtime access pattern, just typed correctly instead of via `any`.
2. ~~Because this round touches so many files across the app..., the most efficient test is simply: use the app normally across every major surface~~ — `tsc`/`lint`/`build` all independently confirmed clean on the real machine (see above); a normal-use functional pass across the touched surfaces (dashboards, forms, ground school, admin setup) is still worthwhile but no longer blocking.
3. Specifically worth a deliberate look: Ground School → Progress page's class list (subject name / instructor initials columns, driven by the `rawClasses` cast) still renders correctly; the "load all data on mount" pages (Instructor dashboard, Flights, Maintenance) still load their lists on first visit.
4. ~~This round is NOT yet committed to git~~ — ✅ **confirmed committed & pushed 2026-08-25, commit `91b5ff0`** — see the confirmation section at the top of this doc. Still not yet merged into `production`.

---

## ✅ 2026-08-25 (third round): "4 modals' hardcoded dark Tailwind classes" UI/UX finding FIXED — 5 files DELIVERED, confirmed byte-for-byte on the real machine, ✅ COMMITTED AND PUSHED to `main` (commit `91b5ff0`)
This closes out the session 7 UI/UX finding that had been deliberately deferred as "needs visual verification — not fixable blind in a sandbox with no deployed URL" (see outstanding item 37, and the On Hold sheet of today's Master Plan Tracker). It turned out this didn't actually need a browser: a repo-wide grep for hardcoded neutral Tailwind color classes (`bg-slate-800`, `text-white`, `border-slate-700`, etc.) found the exact files and exact lines, and the app already has an established theme-token system (`app/globals.css`'s `--surface`/`--border`/`--text-secondary`/etc. CSS custom properties, plus semantic classes `surface-card`/`surface-inner`/`text-secondary`/`text-tertiary`) that other modals (e.g. `UserEditModal.tsx`) already use correctly — so this was a mechanical, verifiable class-swap, not a blind guess.

**Five files fixed** (the original review said "four" — grepping turned up a fifth with the identical pattern):
- `components/schedule/FlightDetailModal.tsx`
- `components/dashboard/RequirementsChecklist.tsx` (including its two inline sub-modals — DGCA roll-number modal and SPL-number modal)
- `components/flights/FlightRecordForm.tsx`
- `components/schedule/BookingForm.tsx`
- `components/schedule/DebriefForm.tsx`

**What changed, mechanically, in each file:** hardcoded `bg-slate-800`/`bg-slate-900`/`bg-gray-800`/`bg-gray-900` on modal panel wrappers → the `surface-card` class; `bg-slate-700`/`bg-gray-700` on nested inputs/cards → `surface-inner` or `bg-[var(--surface-muted)]`; `border-slate-700` → `style={{ borderColor: 'var(--border)' }}`; `text-white` → removed (inherits `var(--text-primary)` from `body`) except where sitting on an intentional fixed-color accent (a blue/green submit button, a status badge) — those were deliberately left alone; `text-gray/slate-400/300` → `text-secondary`; `text-gray/slate-500` → `text-tertiary`; `hover:bg-slate-700` → `hover:bg-[var(--surface-muted)]`. Semantic status colors (yellow fuel warnings, red conflict/error banners, green success buttons, blue accent buttons/badges) were explicitly left untouched in every file — this was a neutral-palette fix only, not a redesign.

**How this was built:** five parallel subagents, one per file, each given the token system, the `UserEditModal.tsx` reference pattern, and an explicit rule set (what to swap, what to leave alone, no logic/handler/import changes). Centrally re-verified afterward rather than trusting each agent's self-report: a repo-wide grep across all five files for any remaining `bg/text/border/divide/ring/placeholder-{gray,slate,zinc,neutral,stone}-{400-950}` came back empty, and every remaining `text-white` hit was manually confirmed to sit on an intentional accent button/badge, not a surface that should theme-track.

### Verification

- Sandbox `npx tsc --noEmit` (whole repo): clean.
- Sandbox `npx eslint` on all 5 touched files: 8 errors / 5 warnings, but every single one confirmed pre-existing, unrelated logic (`setForm(...)` population effects flagged `react-hooks/set-state-in-effect`, `(x as any)` casts flagged `no-explicit-any`, missing-dep warnings) — inspected each flagged line directly and confirmed none were touched by this round's color-only edits. All fall in the engagement's already-established "deferred lint bucket" categories (`no-explicit-any`, `react-hooks/exhaustive-deps`, `react-hooks/set-state-in-effect`). Zero new issues.
- Pre-delivery check: this sandbox's git HEAD is a stale `4ff6c09` (pre-dates sessions 2-7), but its *working tree* already carries every session's accumulated uncommitted changes forward (consistent with the rest of this engagement's history) — confirmed the 5 files' on-device mtimes before editing all clustered in the same batch as the last confirmed delivery/commit round, i.e. no independent user-side edits since.
- All 5 files delivered via the device bridge (`SendUserFile` + `device_commit_files`, `expectedMtimeMs` guards), reported written, then re-staged and diffed byte-for-byte (CRLF-normalized) — **confirmed zero mismatches.**

### What must happen before this round is testable

1. No SQL migration needed — pure CSS/className change, no schema or logic touched.
2. Toggle to **light mode** (header toggle) and open each of the 5 fixed screens/modals — confirm all text is readable against its background and no leftover dark-only panel appears: Flight Detail (click any scheduled flight on the Schedule Board), Requirements Checklist's DGCA modal and SPL modal (click "Mark as Completed" on a DGCA ground-school subject, and click the "Student Pilot License" requirement checkbox), Log Flight form (Flights page → Add/Edit), the Booking form (Schedule Board → new booking), and the Debrief form (complete a flight → Debrief).
3. Toggle back to **dark mode** on the same 5 screens — confirm nothing regressed (should look identical to before this round, since dark-theme token values match what was hardcoded).
4. Confirm the deliberately-untouched accent colors are still correct in both themes: submit buttons (blue/green), fuel/conflict warning banners (yellow), error text (red), status badges.

### Master Plan Tracker delivered (2026-08-25, same session)

A new `FlightPro_Manager_Master_Plan_Tracker.xlsx` (six sheets: Instructions, Completed [29 items], Pending [11], On Hold [15], New Features Backlog [7], Summary with `COUNTIF` formulas + a suggested next-steps ordering) was built, recalculated clean (`recalc.py`: 0 errors), delivered, and committed to `docs/FlightPro_Manager_Master_Plan_Tracker.xlsx` — alongside the existing Pre-Handover Test Plan. Its "On Hold" sheet is the source of the "4 modals' hardcoded dark Tailwind classes" row that this round just resolved — **that row is now stale in the spreadsheet itself** (the xlsx wasn't regenerated this round) and should be moved from On Hold to Completed next time that workbook is touched.

---

## ✅ 2026-08-25: both 2026-08-25 rounds CONFIRMED committed and pushed to `main`

User ran the commit and push on the real machine and pasted back the full terminal output:

```
git add app/dashboard/instructor/page.tsx app/dashboard/page.tsx components/ui/Sidebar.tsx lib/permissions.ts docs/FlightPro_Manager_PreHandover_Test_Plan.xlsx
git commit -m "Grant instructor view access to Instructors roster; scope My Students tab to instructor only; remove redundant Dashboard Quick Actions grid; add pre-handover test plan"
[main 4aefc5c] ...
 5 files changed, 28 insertions(+), 62 deletions(-)
 create mode 100644 docs/FlightPro_Manager_PreHandover_Test_Plan.xlsx
git push origin main
   5c24c73..4aefc5c  main -> main
git status
On branch main. Your branch is up to date with 'origin/main'. nothing to commit, working tree clean.
```

This is a real commit hash + push confirmation pasted directly from the user's terminal — both 2026-08-25 rounds (instructor-roster view access; My Students scoping + Quick Actions removal) are now committed and pushed to `main`, together with the pre-handover test plan (delivered earlier the same session, previously untracked).

## ✅ 2026-08-25: `main` merged into `production` — `production` now at `4aefc5c`

User ran the merge and push on the real machine and pasted back the full terminal output:

```
git checkout production
Switched to branch 'production'
git status
On branch production. Your branch is up to date with 'origin/production'. nothing to commit, working tree clean.
git merge main
Updating 5c24c73..4aefc5c
Fast-forward
 app/dashboard/instructor/page.tsx                 |   6 ++-
 app/dashboard/page.tsx                            |  53 +---------------------
 components/ui/Sidebar.tsx                         |  17 +++++--
 docs/FlightPro_Manager_PreHandover_Test_Plan.xlsx | Bin 0 -> 16855 bytes
 lib/permissions.ts                                |  14 ++++--
 5 files changed, 28 insertions(+), 62 deletions(-)
 create mode 100644 docs/FlightPro_Manager_PreHandover_Test_Plan.xlsx
git push origin production
   5c24c73..4aefc5c  production -> production
```

Clean fast-forward, real terminal output pasted directly. **`production` and `main` are now in sync at `4aefc5c`.** This means session 7's security/accessibility hardening (already live since 2026-08-24) is unchanged in risk profile — it was already live and untested before this merge, and remains so — while today's two earlier rounds (instructor roster access, My Students scoping, Quick Actions removal) are now also live, still untested (items 43-44 below). The third round (this doc's top section — the modal theming fix) is NOT part of this merge; it's still uncommitted. No new SQL migrations were part of this merge.

## ✅ 2026-08-25: Blocked-on-decision items resolved

Three items flagged as "Blocked on a decision only you can make" resolved this session, per user answers to an AskUserQuestion:

1. **IR `required_hours` (outstanding item 5)** — user confirmed the correct DGCA value is **15** (not 40) and updated it themselves directly via Admin Setup → Training Programs (routes through the now-secured `/api/admin/config/training-programs` endpoint from session 7). No code/SQL change was needed from this session — and it's a live, informal confirmation that the session 7 config-route fix works correctly in production for at least this one table.
2. **Instructor roster view access (outstanding item 11)** — user said yes, grant view access to all instructors. `lib/permissions.ts`'s `INSTRUCTORS_VIEW_ROLES` and `components/ui/Sidebar.tsx`'s `NAV_ITEMS` entry for `/dashboard/instructors` both updated to include `'instructor'`. Write access unchanged (`INSTRUCTORS_WRITE_ROLES` still `['admin', 'super_admin']`) — instructors can now see the full roster but can't add/edit/delete other instructors. ✅ **Committed and pushed to `main`, commit `4aefc5c`.**
3. **Overwritten `claude/next-steps-plan-2026-08-11.md` (outstanding item 2)** — user chose "Attempt reconstruction." A best-effort rebuild, pieced together from `claude/flow-audit-2026-08-11.md` and `claude/engagement-summary-2026-08-20.md`, was written and published to that same path (explicitly marked as a reconstruction, not the original). This doc remains the live, authoritative source of truth going forward — the reconstructed doc isn't meant to be kept updated in parallel.

## 2026-08-25 (second round): "My Students" tab scoped to instructor only + Dashboard "Quick Actions" tile grid removed — 3 files DELIVERED, confirmed byte-for-byte on the real machine, ✅ committed and pushed (`4aefc5c`)

User caught two more things while reviewing the app: (1) the "My Students" tab was visible to admin/super_admin as well as instructors, and should be restricted to instructors only; (2) the Dashboard's "Quick Actions" tile grid is now redundant now that the persistent sidebar (2026-08-17) covers the same navigation, and should go away.

**1. "My Students" scoped to `instructor` only.** Previously `['instructor', 'admin', 'super_admin']` in two hand-synced places (per this engagement's standing convention — nav link + page RoleGate): `components/ui/Sidebar.tsx`'s `NAV_ITEMS` entry for `/dashboard/instructor`, and `app/dashboard/instructor/page.tsx`'s own `RoleGate allowedRoles={...}`. Both now `['instructor']`. Read as: this is a personalized "my assigned students" view (the page already scopes its own data to the logged-in instructor's `instructorId`), not a general roster — admin/super_admin already have the full roster via "Instructors" and "Students". Checked for any other reference expecting admin/super_admin to reach `/dashboard/instructor` (`Header.tsx`'s role-based home-link redirect, `unauthorized/page.tsx`'s "go home" link) — both only route the `instructor` role there, so nothing else depends on the wider access.

**2. Dashboard "Quick Actions" tile grid removed** — `app/dashboard/page.tsx`. The entire role-filtered 11-tile grid (lines ~607-655, its own inline `actions` array + `visibleActions` filter) deleted, along with the now-unused icon imports (`FileText`, `Wrench`, `GraduationCap`, `UserRound`, `Umbrella`, `ChartColumnIncreasing`, `BookOpen` — confirmed via grep that none of these are used anywhere else in the file; `Calendar`/`Plane`/`Users`/`Fuel`/`ChevronRight` stay, they're used elsewhere on the page). `Sidebar.tsx`'s header comment (which referenced the Quick Actions grid as "kept as-is") updated to reflect the removal and note the sidebar is now the sole navigation surface.

### Verification

- Sandbox `npx tsc --noEmit`: clean.
- Sandbox targeted lint on all 3 touched files: pre-existing hits only (`react-hooks/set-state-in-effect`, `react-hooks/exhaustive-deps`, `no-explicit-any` — all in the established deferred bucket, confirmed via `git diff` hunk ranges as untouched by this round's edits).
- Pre-delivery undisclosed-edit check: staged all 3 files from the device, diffed (CRLF-normalized) against the sandbox's edited copies — each diff contained exactly and only this round's intended change, no undisclosed drift. `Sidebar.tsx`'s pre-edit device mtime matched exactly the mtime from the instructor-roster-access round's delivery earlier the same day (no drift in between).
- All 3 files delivered via the device bridge (`SendUserFile` + `device_commit_files`, `expectedMtimeMs` guards), reported written, then re-staged and diffed byte-for-byte — **confirmed zero mismatches.**

### What must happen before this round is testable

1. No SQL migration needed — UI-only change.
2. Test: log in as instructor — confirm "My Students" still appears in the sidebar and works as before.
3. Test: log in as admin/super_admin — confirm "My Students" no longer appears in the sidebar, and navigating directly to `/dashboard/instructor` now shows "Not Authorized" instead of the personalized dashboard.
4. Test: Dashboard home page — confirm the "Quick Actions" tile grid is gone and the page layout still looks correct (Fleet Fuel Status card, which sat directly below it, should now follow directly after the NOTAM alerts card).

✅ **Committed, pushed, and merged into `production`** — `main` at `4aefc5c` (`5c24c73..4aefc5c`), together with the instructor-roster-access round and the pre-handover test plan, and `production` fast-forwarded to match the same day. See the confirmation sections at the top of this doc.

---

## Session 7 (2026-08-24): Security hardening (IDOR + client-side-write fixes) + accessibility hardening (Escape-to-close + aria-labels) — DELIVERED, confirmed written on the real machine, NOT YET committed

User, presented with an AskUserQuestion offering four options for what to tackle next (fix security findings / run an accessibility audit / build DGCA templates / commit & merge to production), **selected all four**. This session completed the first two; DGCA templates are blocked on a question to the user (see below); commit instructions follow this section.

### 1. Security hardening — closes findings #1-#4 from the whole-frontend review above

**New: a generic whitelisted config-CRUD route — `app/api/admin/config/[table]/route.ts` (NEW).** Rather than writing 6-7 near-identical bespoke route files, one route maps a URL segment to `{dbTable, columns[]}` and only ever writes pre-approved columns:

```typescript
const TABLES: Record<string, { dbTable: string; columns: string[] }> = {
  exercises: { dbTable: 'exercises', columns: [...] },
  'training-programs': { dbTable: 'training_programs', columns: [...] },
  'instructor-roles': { dbTable: 'instructor_roles', columns: [...] },
  'sortie-types': { dbTable: 'sortie_types', columns: [...] },
  'ground-school-subjects': { dbTable: 'ground_school_subjects', columns: [...] },
  'requirement-templates': { dbTable: 'training_requirement_templates', columns: [...] },
  holidays: { dbTable: 'holidays', columns: [...] },
};
```

`POST`/`PATCH`/`DELETE` all gated behind a new `ADMIN_SETUP_WRITE_ROLES = ['super_admin']` in `lib/permissions.ts` (matching the wizard page's own `RoleGate allowedRoles={['super_admin']}`). `POST` accepts either a single object or an array body (array triggers a bulk insert, needed for CSV import). A `pickAllowed()` helper filters any request body down to only the whitelisted columns before it ever reaches Supabase — an attacker sending extra fields (e.g. trying to set `is_active` on a row that shouldn't allow it, or writing to a column not in the list) gets those fields silently dropped, not written.

**Seven Admin Setup tabs switched from direct client-side `supabase.from(...)` writes to this route:** `ExercisesTab.tsx`, `TrainingProgramsTab.tsx`, `RolesTab.tsx`, `SortieTypesTab.tsx`, `GroundSchoolTab.tsx`, `RequirementsTab.tsx` (`handleSave`/`handleDelete`, and `ExercisesTab.tsx`'s CSV bulk-import path), plus `lib/store.ts`'s `addHoliday`/`addHolidaysBulk`/`removeHoliday`. All now call `fetch('/api/admin/config/<resource>', {method, body})` instead of touching Supabase with the public anon key.

**`AircraftSetupTab.tsx`** — discovered `/api/aircraft` and `/api/aircraft/[id]` already existed (built earlier in the engagement for the main Aircraft page) and already secured — reused them instead of adding a duplicate route. Built a small payload-mapping layer translating this tab's snake_case form fields to the route's expected camelCase body (`hobbsTime: form.hobbs_time`, `fuelCapacity: form.fuel_capacity`, `currentFuel: form.current_fuel`, `nextMaintenance: form.next_maintenance`, `isSimulator: form.is_simulator`); `handleSave`/`handleDelete` now call that route.

**IDOR fix — `app/dashboard/ground-school/progress/page.tsx` (finding #1).** The init effect that resolves which student's progress to show now checks `userRole === 'student'` FIRST, unconditionally forcing `selectedStudent = userStudentId` for a logged-in student regardless of what's in the URL. The `?student=` URL parameter now only applies for staff roles (instructor/admin/etc.) — a student can no longer view another student's DGCA roll number/exam scores by editing the URL.

**Forged-exam-records fix — `app/api/admin/ground-school/direct-exam/route.ts` (NEW) (finding #2).** `addDirectExam()` in `progress/page.tsx` no longer inserts directly into `ground_school_enrollment` from the client; it now calls this new route (`POST`, `requireRole(REQUIREMENTS_WRITE_ROLES)`), which validates `studentId`/`subjectName`/`rollNumber`/`score`, inserts the EXEMPTED enrollment row server-side via `supabaseAdmin`, then syncs the matching `training_requirements` row (`.includes(subjectName)` match, `completed_by` derived from the verified session, not the client). The now-unused `syncRequirementsFromGroundSchoolPass` client import was removed from `progress/page.tsx`.

**`training_requirement_templates` (finding #3)** — now covered by the generic config route above (`requirement-templates` key), same as the other six tables.

### Deliberately NOT hardened this round (disclosed, scoped decision)

While investigating, grep turned up **two more client-side write paths into `ground_school_enrollment`/`training_requirements`** beyond the one fixed above: the Attendance page (`app/dashboard/.../attendance/page.tsx`) and `RequirementsChecklist.tsx`'s own separate exam-entry path. Neither was in the four numbered findings from the original review, and both are a similar-but-separate fix (same shape as the `direct-exam` route, but a distinct call site). Deliberately deferred to a future round rather than scope-creeping this one — added to the outstanding list below (item 39).

### 2. Accessibility hardening

**New shared hook — `lib/useEscapeToClose.ts` (NEW):**

```typescript
import { useEffect } from 'react';
export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}
```

A grep across every custom modal (the `fixed inset-0` overlay pattern) confirmed all 15 had zero Escape handling — the UI/UX finding from the whole-frontend review ("no modal closes on Escape"). Wired into all 15: `UserPermissionsModal.tsx`, `UserEditModal.tsx`, `FuelLogForm.tsx`, `StudentFormModal.tsx`, `FlightRecordForm.tsx`, `DebriefForm.tsx`, `BookingForm.tsx`, `FlightDetailModal.tsx`, `MaintenanceForm.tsx`, `AvailabilityForm.tsx`, `InstructorFormModal.tsx`, `AircraftFormModal.tsx` (all: `useEscapeToClose(onClose);` as the first line of the component body), plus three special-case files with inline modal state rather than an `onClose` prop: `RequirementsChecklist.tsx` (`useEscapeToClose(() => { if (dgcaModal) setDgcaModal(null); if (splModal) setSplModal(null); });`), `GroundSchoolCalendar.tsx` (`useEscapeToClose(() => { if (showModal) setShowModal(false); });`), and `progress/page.tsx` (`useEscapeToClose(() => { if (directExamModal) setDirectExamModal(null); });`).

**`aria-label="Close"` added to 11 icon-only Close buttons** — the other UI/UX finding ("icon-only buttons mostly lack `aria-label`"), scoped specifically to each modal's `X`-icon Close button: the 8 simple modals above that have one, plus the 3 special-case inline close buttons.

### Deliberately NOT fixed this round (disclosed, scoped decision — matches the review's own lower-urgency framing)

- ~~**Four modals' hardcoded dark Tailwind classes** (unreadable in light mode) — requires visual verification this sandbox can't perform (no deployed URL/browser access). Deferred rather than guessing at a blind CSS fix.~~ — ✅ **fixed 2026-08-25 (third round)** — see the top section of this doc. Turned out not to need a browser: a grep for the app's own theme-token system vs. hardcoded classes found and fixed it directly (5 files, not 4).
- **Icon-only edit/delete (pencil/trash) buttons still lack `aria-label`** — this round scoped to Close buttons only, since those were the most acute (keyboard/screen-reader users had no way to identify the escape hatch); broader icon-button coverage is a natural follow-up.
- **3 modals that can overflow on short viewports** — also needs visual/viewport verification, not fixable blind.

### Verification

- Sandbox `npx tsc --noEmit` (whole repo, both rounds): clean.
- Sandbox `npm run lint` (full repo): stayed at the established **97-problem baseline** throughout both rounds — one self-inflicted regression (an unnecessary `// eslint-disable-next-line react-hooks/exhaustive-deps` comment on `useEscapeToClose.ts` triggered a NEW "unused eslint-disable directive" warning, pushing the count to 98) was caught and fixed by removing the comment; confirmed back to 97 before delivery. All other lint hits cross-checked via `git diff` hunk ranges as pre-existing, not newly introduced.
- `npm run build`: not verified in sandbox — same pre-existing Google Fonts network-egress restriction as every prior round.
- All files (2 new API routes + `lib/permissions.ts` + 7 Admin Setup tab files + `lib/store.ts` for security; `lib/useEscapeToClose.ts` new + 15 modal files for accessibility) delivered via the device bridge (`SendUserFile` + `device_commit_files`); all reported written.

### What must happen before this round is testable

1. No SQL migration needed — this round only touches app code and API routes.
2. **Security:** confirm each of the 7 Admin Setup tabs (Exercises, Training Programs, Roles, Sortie Types, Ground School, Requirements, Holidays) still add/edit/delete correctly through the new route — behavior should be identical to before, just routed through the server now.
3. **Security:** confirm Aircraft Setup (in Admin Setup) still adds/edits/deletes aircraft correctly via the reused `/api/aircraft` route.
4. **Security — IDOR:** log in as a student, try navigating to `/dashboard/ground-school/progress?student=<another-student-uuid>` — confirm it now shows YOUR OWN progress, not theirs.
5. **Security — direct exam entry:** as staff, use Ground School → Progress → "Mark as Completed" (Direct Exam Entry) for a student — confirm it still records the roll number/score/EXEMPTED result correctly.
6. **Security — negative test (recommended):** try hitting `/api/admin/config/exercises` (or any of the 7) directly with a non-`super_admin` session — confirm it's rejected. Try sending an extra, non-whitelisted field in the body — confirm it's silently dropped, not written.
7. **Accessibility:** open each of the 15 modals and press Escape — confirm it closes. Tab to each Close (X) button with a screen reader or browser dev tools accessibility inspector — confirm it announces "Close".

~~This round is NOT yet committed to git~~ — ✅ **confirmed committed & pushed 2026-08-24, commit `5c24c73`** — see the confirmation section directly below.

---

## ✅ 2026-08-24: sessions 2-4, 6, and 7 (plus the DGCA draft templates) all CONFIRMED committed and pushed to `main`

User ran the commit and push on the real machine and pasted back the full terminal output:

```
commit 5c24c73 (origin/main, 983b0cd..5c24c73)
"SPL/CPL issue dates, sidebar fixes, Breath Analysis Report, SPL/CPL expiry alerts,
security hardening, accessibility hardening"
32 files changed, 961 insertions(+), 115 deletions(-)
```

`git push origin main` succeeded (`983b0cd..5c24c73  main -> main`). This is a real commit hash + push confirmation pasted directly from the user's terminal — everything through session 7 (security hardening, accessibility hardening) and the two DGCA draft template files (`docs/dgca-templates/`) is now on `main`.

**Update, same day: user merged `main` into `production` immediately after, before session 7 testing was done.** The recommendation at the time was to hold the production merge until the session 7 testing checklist (items 35-36) was run clean — the user made an explicit, informed call to merge anyway rather than wait. Pasted terminal output confirms a clean fast-forward merge and push:

```
git checkout production
Switched to branch 'production'
git merge main
Updating 983b0cd..5c24c73
Fast-forward
 32 files changed, 961 insertions(+), 115 deletions(-)
git push origin production
   983b0cd..5c24c73  production -> production
```

**⚠️ This means the session 7 security fixes (IDOR fix, forged-exam-records fix, the 7 Admin Setup tabs + Aircraft Setup switched to server-checked routes) and accessibility fixes (Escape-to-close, aria-labels) are now live on `production`, untested.** Testing items 35-36 below is no longer routine follow-up — it's the priority, since any bug in the new routes is now affecting real users, not just sitting on `main`. Particularly worth checking first: the 7 Admin Setup config-route tabs and Aircraft Setup still save/delete correctly (a regression there would block staff from managing exercises/training programs/aircraft/etc.), and the IDOR fix doesn't accidentally block a legitimate staff view of a student's progress.

---

## Session 6 (2026-08-21): SPL/CPL auto-expiry-from-issue-date + expiry alert/notification system — 5 files DELIVERED, confirmed written on the real machine; also confirms User Management "Edit" action tested

User confirmed the User Management "Edit" action (name/email/role, session 1) has now been tested and works. Then, in the same message, a new request: "SPL/CPL validity is for 10 years from the date of issue... so can we make it like issue date will add expiry date automatically (but editable) Also give an alert and send notification as done for medical expiry."

Two distinct pieces, both delivered this session:

### 1. Auto-calculated Expiry Date = Issue Date + 10 years (still directly editable)

**`components/students/StudentFormModal.tsx`** and **`components/instructors/InstructorFormModal.tsx`** — same "auto until touched" pattern already used for the Initials-from-Name auto-fill in `StudentFormModal.tsx` (`initialsManuallyEdited`). New state (`splExpiryManuallyEdited` / `licenseExpiryManuallyEdited`) tracks whether the Expiry Date field has been directly edited by the user, or already had a real value when an existing record was loaded for editing (`!!student.splExpiryDate` / `!!instructor.licenseExpiryDate` on populate). While untouched, changing Issue Date recomputes Expiry Date via a new `addYears(dateStr, 10)` helper (handles the Feb-29-in-a-non-leap-target-year edge case by clamping to Feb 28). The moment the user edits Expiry Date directly, that flag flips and further Issue Date edits stop overwriting it — exactly the "automatic but editable" behavior asked for. A small "Auto-generated" hint (green, matching the Initials field's existing style) shows under Expiry Date while it's still auto-tracking.

### 2. SPL/CPL expiry alerts — UI badge + email notification, mirroring the existing medical-expiry pattern exactly

**UI badge — `components/students/StudentCard.tsx`** (new "SPL Expiry" box) and **`components/instructors/InstructorCard.tsx`** (new "CPL Expiry" box, instructor cards had no expiry-style UI at all before this round). Both are a direct copy of `StudentCard.tsx`'s pre-existing Medical Status box: same `expired`/`critical`(≤5d)/`warning`(≤30d)/`ok`/`none` status derivation, same theme-token-based coloring (`--danger`/`--warning`/`--success`/`--surface-muted`), same icon set (`TriangleAlert`/`CircleAlert`/`CircleCheck`). `StudentCard.tsx`'s header avatar pulse-dot (the small red dot signaling something needs attention) now also lights up on an expired/critical SPL, not just medical.

**Email notification — `app/api/cron/check-notifications/route.ts`** — four new checks added, same shape as the existing medical-expiry checks #1/#2: student SPL expiring within 30 days, student SPL already expired, instructor CPL expiring within 30 days, instructor CPL already expired. Each pushes a `🟡`/`🔴` line into the response `notifications` array and calls the existing `sendAdminAlert()` helper (same admin/super_admin recipient list, same Resend email template) — no new email infrastructure needed, this reuses 100% of the existing plumbing. Queries `.not('spl_expiry_date', 'is', null)` / `.not('license_expiry_date', 'is', null)` first so records with no expiry date on file are silently skipped rather than false-alerting. Numbered code comments renumbered 1-8 to keep the file's own inline index accurate (was 1-4, is now 1-8, maintenance checks pushed to #7/#8).

### Judgment calls made without an explicit user answer (disclosed per this engagement's standing convention)

- **Alert thresholds**: reused the medical-expiry thresholds verbatim — 30-day warning, already-expired alert, and (UI-only) a ≤5-day "critical" sub-state — since the user said "as done for medical expiry" and didn't specify different numbers for SPL/CPL.
- **Alert recipients**: admin/super_admin only, same as medical-expiry — not the affected student/instructor themselves. The existing `sendAdminAlert()` has no per-person email path; adding one would be a larger, separate change.
- **Instructor UI badge**: the user's ask only explicitly mentioned "an alert and send notification," but since `StudentCard.tsx` already had a UI badge for medical expiry (not just an email), the SPL/CPL feature was built with the equivalent UI badge on both `StudentCard.tsx` and `InstructorCard.tsx` for parity — `InstructorCard.tsx` had zero expiry-style UI before this round.
- **What counts as "expiring"**: the alert is keyed off Expiry Date, not Issue Date + 10 — since Expiry Date is directly editable after auto-fill, it may not always be exactly issue+10y (e.g. a manually corrected DGCA-issued expiry), so the alert always reflects whatever is actually on file rather than recomputing from Issue Date.

### Verification

- Sandbox `npx tsc --noEmit` (whole repo): clean.
- Sandbox `npx eslint` targeted on all 5 touched files: 2 hits, both confirmed pre-existing (not introduced this round) — a `react-hooks/set-state-in-effect` on `InstructorFormModal.tsx`'s and `StudentFormModal.tsx`'s populate-on-edit `useEffect`s (the same `setForm({...})` call these effects already had before this round; only new state initializers were added inside it, not the effect/setState pattern itself).
- `npm run build`: not verified in sandbox — same pre-existing Google Fonts network-egress restriction as every prior round.
- All 5 files delivered via the device bridge (`SendUserFile` + `device_commit_files`); `device_commit_files` reported all 5 written with no rejections. (Per the standing convention, a "written" response alone isn't proof of a clean delivery — a byte-for-byte re-stage-and-diff verification pass is the next step before this round is fully confirmed delivered, not yet done this session.)

### What must happen before this round is testable

1. No SQL migration needed — this round only touches app code; `spl_expiry_date`/`license_expiry_date`/`spl_issue_date`/`license_issue_date` all already exist (session 2, confirmed run session 5).
2. Test: create/edit a student, set SPL Issue Date, confirm SPL Expiry Date auto-fills to +10 years and shows the "Auto-generated" hint.
3. Test: manually edit that auto-filled Expiry Date, then change Issue Date again — confirm Expiry Date is NOT overwritten (the "auto until touched" behavior).
4. Test: same two checks for an instructor's CPL Issue/Expiry Date.
5. Test: a student/instructor with an SPL/CPL expiring within 30 days (or already expired) shows the correct colored badge on their card.
6. Test: manually hit `/api/cron/check-notifications` (with the correct `CRON_SECRET`) with at least one SPL/CPL record expiring within 30 days or expired — confirm the new checks appear in the JSON `notifications` array and an email actually arrives.

**This round is NOT yet committed to git**, same as sessions 2, 3, and 4 — this session cannot run git on the user's real machine.

---

## (2026-08-20, session 4): Breath Analysis Report — separate daily/weekly/monthly report page with PDF + Excel/CSV export, sidebar reorder, Reports card rename — 4 files DELIVERED, confirmed byte-for-byte on the real machine, NOT YET committed

User feedback after seeing the session-3 sidebar link (below): (1) the "BA Test Register" sidebar link should sit **above** "Reports", not below it; (2) in the Reports section, the card should say **"Breath Analysis Report"**, not "Register"; (3) that report should show **daily, weekly, and monthly** rollups of the BA register data, not just a single day; (4) it should support **PDF download alongside Excel/CSV**.

Read as: the sidebar's "BA Test Register" link stays pointed at the existing data-entry page (`/dashboard/reports/breath-analyser`, unchanged — where staff add/edit/delete today's tests). The Reports section's card is a **different, new page** — a read-only reporting/compliance view over a date range, not a data-entry form. Built accordingly rather than trying to cram both jobs into one page.

### 1. Sidebar reorder

**`components/ui/Sidebar.tsx`** — "BA Test Register" moved to directly above "Reports" in `NAV_ITEMS` (was below it in session 3). Same roles, same icon (`Wind`), same nav-highlight caveat as before (visiting it also highlights "Reports" since it's a genuine parent/child URL nesting, not the string-prefix bug fixed earlier in session 2).

### 2. New page: Breath Analysis Report (`app/dashboard/reports/breath-analysis/page.tsx`, NEW)

Deliberately a **separate page** from the register (`.../breath-analyser/page.tsx`, untouched) rather than adding tabs to it — the register is a daily data-entry workflow, this is a reporting view with export. Both read from the same `ba_tests` table via the same `GET /api/ba-tests` endpoint (already supported `from`/`to` range filtering, so no API changes were needed).

- **Period selector**: Daily / Weekly / Monthly toggle buttons.
  - Daily: a date picker, `from = to = date`.
  - Weekly: a date picker where the picked date resolves to its containing Monday–Sunday week (`weekRange()` helper).
  - Monthly: an `<input type="month">` picker, resolves to that month's first/last day (`monthRange()` helper).
- **Summary stat tiles**: Total Tests, Positive, Nil (same `baPercentage > 0` = "Positive" threshold the register page's own badge already uses — kept consistent rather than inventing a new one), Students Tested, Instructors Tested.
- **Table**: same columns as the register, plus a **Date** column (needed once the view spans more than one day) — read-only, no edit/delete actions here (that stays exclusively on the register page).
- **Export Excel/CSV** — reuses the register page's `Papa.unparse` pattern, scoped to the selected period's rows.
- **Export PDF** — new `generateBreathAnalysisReport()` function in `lib/pdf.ts` (see below), using the same `jsPDF` + `jspdf-autotable` library already used for the Daily Flying Report and student logbook PDFs (no new dependency needed — `jspdf`/`jspdf-autotable` were already in `package.json`).
- Access: `RoleGate allowedRoles={BA_TEST_VIEW_ROLES}` — same view roles as the register (admin, instructor, super_admin, operations, maintenance, safety_officer). No separate write-role gating needed since this page has no write actions at all.

### 3. `lib/pdf.ts` — new `generateBreathAnalysisReport()` export

Modeled directly on the existing `generateDailyFlyingReport()` (header band, `autoTable` for the row data, a Summary block, a two-line sign-off, footer) — deliberately not refactored into a single shared "report PDF" helper with that function, since the two reports' columns and summary stats are different enough that forcing a shared shape would cost more clarity than it saves (same reasoning `generateStudentLogbook` and `generateDailyFlyingReport` already don't share a table-rendering helper). Takes `{ period, periodLabel, tests }` and derives its own Total/Positive/Nil/Student/Instructor counts from the passed `BATest[]`, so the PDF always matches whatever's on screen. File name: `Breath_Analysis_Report_<Period>_<label>.pdf`.

### 4. Reports landing page card renamed

**`app/dashboard/reports/page.tsx`** — the card's `href` now points to the new `/dashboard/reports/breath-analysis` page (not the register); title changed from "Breath Analyser Register" to **"Breath Analysis Report"**; description updated to mention daily/weekly/monthly + PDF/Excel export, and explicitly tells the reader to use the sidebar's "BA Test Register" link for adding/editing entries (so the rename doesn't leave anyone hunting for where data entry went).

### What was deliberately NOT changed

- The register page itself (`app/dashboard/reports/breath-analyser/page.tsx`) — untouched. Still the only place entries are added/edited/deleted, still single-day-scoped, still titled "Breath Analyser Register" in its own header (that title wasn't part of what the user asked to rename — only the Reports-section card name was in scope).
- No new API route or schema change — `GET /api/ba-tests` already supported `from`/`to`, so the new report page just calls it with a wider range than the register page does.
- No PDF/Excel export was added to the register page itself — exports live only on the new report page, matching "Register = data entry, Report = view/export" split.

### Verification

- Sandbox `npx tsc --noEmit`: clean.
- Sandbox targeted lint on the 3 touched + 1 new file: 2 hits, both in the deferred/pre-existing-pattern bucket — a `react-hooks/set-state-in-effect` on the new page's `useEffect(() => { loadRange(...) }, ...)` (textually identical to the already-accepted pattern on the register page's own `loadForDate` effect and the Daily Flying Report page's equivalent), and a `no-explicit-any` on `lib/pdf.ts`'s new `(doc as any).lastAutoTable` cast (identical to the two pre-existing casts already in that file for the other two report generators). Neither is a new category of debt.
- Sandbox `npm run lint` (full repo): **97 problems (81 errors, 16 warnings)** — the expected 95 (post-session-2 baseline) + 2 new hits described above, both confirmed pre-existing-pattern, not new debt categories.
- `npm run build`: not verified in sandbox — same pre-existing Google Fonts network-egress restriction as every prior round.
- **Pre-delivery undisclosed-edit check:** staged all 3 pre-existing files (`Sidebar.tsx`, `lib/pdf.ts`, `app/dashboard/reports/page.tsx`) from the device before editing. `Sidebar.tsx`'s device mtime matched the exact mtime from its session-3 delivery (no drift). `lib/pdf.ts` and `reports/page.tsx` were diffed (CRLF-normalized) against sandbox `HEAD` and matched exactly — confirming no undisclosed device-side edits since the last commit for either. (One transient staging-cache hiccup on the first `reports/page.tsx` stage attempt — the file briefly didn't materialize at the mount path despite a "dispatched" response; an immediate re-stage resolved it, same transient-artifact pattern seen before in this engagement, not a real gap.)
- All 4 files (3 modified + `breath-analysis/page.tsx` new) delivered via the device bridge, `device_commit_files` reported all 4 written, then re-verified by re-staging and diffing byte-for-byte (CRLF-normalized) against the sandbox copies — **confirmed zero mismatches.**

### What must happen before this round is testable

1. No SQL migration needed — this round only adds a new read-only page and a PDF-generation function; `ba_tests` and its API route already existed.
2. Test: open "BA Test Register" from the sidebar (now above "Reports") — confirm it still opens the data-entry register page unchanged.
3. Test: open Reports → "Breath Analysis Report" — confirm it opens the NEW page (not the register), toggle between Daily/Weekly/Monthly, confirm the date/week/month picker and the row range update correctly for each.
4. Test: with at least one BA test entry logged (from the register), confirm it shows up in the matching Daily/Weekly/Monthly view and the summary tiles count correctly.
5. Test: Export Excel/CSV and Export PDF buttons — confirm both download and contain the right rows/columns for the selected period.

**This round is NOT yet committed to git**, same as sessions 2 and 3 below — this session cannot run git on the user's real machine. The user needs to run `git add`/`git commit`/`git push` themselves and paste back the result.

---

## Session 5 (2026-08-20): three quick confirmations from the user — no code changes

1. **`add-license-issue-dates.sql` — ✅ confirmed run.** The SPL/CPL Issue Date fields (session 2) are now unblocked and testable.
2. **SPL row removed from `training_programs`; `MULTI` row added.** No code change needed — confirmed earlier (third round, "SPL/design discussion") that `training_programs` and the actual SPL enforcement (blocking solo flights without an SPL number) are not connected; enforcement lives entirely in `BookingForm.tsx`'s requirement-name matching via `lib/spl.ts`, not in this table. Removing the SPL row is safe. With `MULTI` now present, the long-pending target-hours-consistency smoke test (Dashboard widget / Progress page / Instructor dashboard agreeing for a MULTI student) is finally testable.
3. **The four previously-unconfirmed SQL migrations — ✅ ALL CONFIRMED RUN**, via a read-only verification script (`verify-four-pending-migrations.sql`, delivered this session, checks `information_schema` for each expected column/table) that the user ran directly in Supabase SQL Editor:

```
check_name,status
holidays table,✅ present
instructors.can_self_book,✅ present
training_programs.cross_country_hours,✅ present
training_programs.instrument_hours,✅ present
training_programs.landings_required,✅ present
training_programs.night_hours,✅ present
training_programs.solo_hours,✅ present
users.permission_overrides,✅ present
```

All eight checks passed — `add-training-program-requirement-columns.sql`, `add-holidays-table.sql`, `add-instructor-self-booking-permission.sql`, and `add-user-permission-overrides.sql` are all confirmed already applied. **No migrations remain unconfirmed as of this session** — every SQL file in the repo has now been either confirmed run or (for `add-license-issue-dates.sql`, item 1 above) confirmed run this same session.

---

## Session 3 (2026-08-20): "BA Test Register" added as a direct sidebar link — 1 file DELIVERED, confirmed byte-for-byte on the real machine, NOT YET committed (superseded in part by session 4 above)

User: the Breath Analyser Register (built in session 1, previously only reachable via a card on the Reports landing page) should be reachable directly from the left sidebar too, since staff use it as a daily form, not just something to browse to via Reports.

**`components/ui/Sidebar.tsx`** — added a `Wind`-icon nav item, `{ href: '/dashboard/reports/breath-analyser', label: 'BA Test Register', ... }`, initially placed directly below "Reports" in `NAV_ITEMS`. Roles matched to `BA_TEST_VIEW_ROLES`/`REPORTS_VIEW_ROLES` (admin, instructor, super_admin, operations, maintenance, safety_officer) — same convention as every other nav item, page-level `RoleGate` remains the real access control.

Noted at the time: because this href nests under `/dashboard/reports`, visiting it also highlights "Reports" in the nav — a genuine parent/child relationship (not the string-prefix bug fixed in session 2), so left as expected behavior unless the user said otherwise.

**Superseded by session 4 above**: the user then asked for this link to sit **above** "Reports" instead of below it (done), and separately asked for the Reports-section card to be renamed to "Breath Analysis Report" and point to a new, richer report page rather than the register directly (also done, see session 4).

### Verification (at the time)

- Sandbox `npx tsc --noEmit` and targeted lint on `Sidebar.tsx`: clean, zero issues.
- Sandbox `npm run lint` (full repo): 95 problems — unchanged from the session-2 baseline.
- Delivered via the device bridge, `device_commit_files` reported written, re-staged and diffed byte-for-byte against the sandbox copy — confirmed zero mismatches.

---

## Session 2 (2026-08-20): SPL/CPL Issue Date fields + Sidebar nav-highlight bug fix — 10 files DELIVERED, confirmed byte-for-byte on the real machine, NOT YET committed

User confirmed `add-license-expiry-dates.sql` was run and the expiry-date fields work, then asked for two more things in the same message: (1) add a license **issue** date alongside the existing expiry date for both SPL (students) and CPL (instructors), and (2) fix a bug found during testing — clicking "Instructors" in the left sidebar also highlighted "My Students".

### 1. SPL/CPL Issue Date — same pattern as the expiry-date round directly below

**`add-license-issue-dates.sql` (NEW)** — separate migration, same reasoning as `add-license-expiry-dates.sql`'s own header (editing an already-run migration file and asking the user to "run it again" is confusing even though `ADD COLUMN IF NOT EXISTS` is safe to re-run):

```sql
alter table students add column if not exists spl_issue_date date;
comment on column students.spl_issue_date is 'Issue date of the student''s Student Pilot License (SPL). Nullable — not every student has one filled in yet.';

alter table instructors add column if not exists license_issue_date date;
comment on column instructors.license_issue_date is 'Issue date of the instructor''s CPL (Commercial Pilot License) / License Number.';
```

**Both nullable, both optional** — identical pattern to `spl_expiry_date`/`license_expiry_date`. **✅ Confirmed run (session 5)** — the SPL/CPL issue-date form fields are now unblocked, functional testing still pending.

- **`types/index.ts`** — `Instructor.licenseIssueDate?: string`; `StudentRecord.splIssueDate?: string`.
- **`app/api/students/route.ts`** (POST) and **`app/api/students/[id]/route.ts`** (PATCH `FIELD_MAP`) — both extended for `splIssueDate`/`spl_issue_date`. The PATCH route's existing `''` → `null` date-column coercion (needed since `spl_expiry_date`/`spl_issue_date` are Postgres `date` columns, unlike the tolerant-of-`''` text `spl_number`) was extended to cover `spl_issue_date` too.
- **`app/api/instructors/route.ts`** (POST) and **`app/api/instructors/[id]/route.ts`** (PATCH `FIELD_MAP`) — same treatment for `licenseIssueDate`/`license_issue_date`, including the `''` → `null` coercion.
- **`lib/store.ts`** — `loadStudents()`/`loadInstructors()` row mappers both map the new column.
- **`components/students/StudentFormModal.tsx`** — new "SPL Issue Date" field added, paired in the same grid row as "SPL Number" (pairing a follow-up field right next to the original one). "SPL Expiry Date" now sits in its own row below.
- **`components/instructors/InstructorFormModal.tsx`** — form reorganized: "License Number *" is now paired with "Ratings" in one row; "CPL Issue Date" and "CPL Expiry Date" are paired together in the next row; "Status" and "Max Daily Hours" paired below that; "Email" and "Phone" paired last.

### 2. Sidebar nav-highlight bug — "Instructors" click also highlighted "My Students"

**Root cause:** `components/ui/Sidebar.tsx`'s active-link logic used a plain `pathname?.startsWith(item.href)` for every non-home nav item. "My Students" has `href: '/dashboard/instructor'` (singular) and "Instructors" has `href: '/dashboard/instructors'` (plural). Because `'/dashboard/instructors'.startsWith('/dashboard/instructor')` is `true` (a textual prefix, not a route-segment prefix), visiting the Instructors roster page also lit up My Students in the nav.

**Fix:** changed the match to `pathname === item.href || pathname.startsWith(item.href + '/')` — matches the href exactly, or as a real path segment prefix, but no longer matches on a bare string prefix that isn't a real segment boundary.

### Verification

- Sandbox `npx tsc --noEmit`: clean. Sandbox targeted lint on all 9 touched files: zero new issues (pre-existing `set-state-in-effect`/`no-explicit-any` patterns only, confirmed via `git diff`).
- Sandbox `npm run lint` (full repo): **95 problems (79 errors, 16 warnings)** — matches the expected post-BA-Register baseline (94 + 1) exactly.
- Pre-delivery undisclosed-edit check: all 9 pre-existing files matched sandbox `HEAD` exactly (fresh clone that session, so plain HEAD was the right baseline).
- All 10 files (9 modified + `add-license-issue-dates.sql` new) delivered via the device bridge, confirmed byte-for-byte after re-staging.

### What must happen before this round is testable

1. ~~Run `add-license-issue-dates.sql` in Supabase~~ — ✅ **confirmed run (session 5).**
2. Test: add/edit a student, fill in (or clear) SPL Issue Date alongside SPL Expiry Date.
3. Test: same for an instructor's CPL Issue Date/Expiry Date.
4. Test: click "Instructors" in the sidebar and confirm "My Students" no longer highlights alongside it.

**None of sessions 2, 3, or 4 are committed to git yet** — this session cannot run git on the user's real machine (no remote shell available). The user needs to run `git add`/`git commit`/`git push` themselves and paste back the result before this doc is updated to say any of it's committed (per the standing convention below).

---

# Everything below this point is carried over unchanged from the 2026-08-18 handoff, last updated through commit `4ff6c09` (2026-08-20, session 1)

## ✅ Git commit status — CONFIRMED: all five 2026-08-20 (session 1) rounds committed and pushed to `main`

User ran the commit and push on the real machine and pasted back the full terminal output, resolving the ambiguity the previous version of this doc flagged:

```
commit 4ff6c09 (origin/main, 03bf0d2..4ff6c09)
"Safe-batch lint cleanup; add Breath Analyser Test Register; enforce SPL/CPL numbers on
completion; add SPL/CPL expiry date fields; add User Management edit action"
54 files changed, 1669 insertions(+), 263 deletions(-)
```

`git push origin main` succeeded (`03bf0d2..4ff6c09  main -> main`), and the follow-up `git status` showed "On branch main. Your branch is up to date with 'origin/main'. nothing to commit, working tree clean." This is a real commit hash + push confirmation pasted directly from the user's terminal, not an inference — all five 2026-08-20 rounds (lint cleanup, BA Test Register, SPL/CPL enforcement, SPL/CPL expiry dates, User Management Edit) are now committed and pushed, same as the five 2026-08-19 rounds under commit `03bf0d2` below.

**Sessions 2, 3, and 4 above (SPL/CPL issue dates, sidebar link, sidebar reorder + Breath Analysis Report page) all happened after this commit and are NOT part of it — all still uncommitted.** (Session 5 made no code changes — just confirmations.)

**Still not done: merge `main` into `production`.** That's a separate, deliberate, unstarted step — see the Git status section further down and the security findings from the frontend review (recommended to fix first).

## Latest: User Management "Edit" action added (name/email/role) + role list centralized — 4 files modified, 1 new, DELIVERED, confirmed byte-for-byte on the real machine

User asked two things in the same message: (1) where to add/edit an instructor's CPL License Number and its new Expiry Date, and (2) Admin Setup → User Management should have an Edit button to edit an existing user's details.

**On (1): no code change needed.** The CPL License Number + CPL Expiry Date fields already exist — Instructors page → click "Edit" on any instructor card opens `InstructorFormModal.tsx`, which has had both fields (paired in the same grid row) since the expiry-date round directly below this one. The Edit button is gated behind `canWriteModule('instructors')` (admin/super_admin by default, or a per-user override) — if it's not visible, that's the likely reason. Just pointed the user at the existing location; nothing was broken.

**On (2): real gap, fixed.** User Management had create, toggle active/inactive, force password reset, per-user permission overrides, and delete — but no way to edit an existing user's name, email, or role at all.

### What was built

**`components/admin/UserEditModal.tsx` (NEW)** — same visual pattern as the sibling `UserPermissionsModal.tsx` (opened from the same table row's actions). Editable fields: Full Name, Email Address, Role (dropdown). Deliberately does NOT touch password, active status, force-password-reset, or permission overrides — those already have their own dedicated actions in the table and stay separate, keeping each action's blast radius small.

**`app/dashboard/admin/setup/UserManagementTab.tsx`** — new `editingUser` state; a new "Edit" button (pencil icon) added to each row's Actions column, between "Permissions" and "Reset PW"; renders `UserEditModal` when a user is selected, `onSaved={loadUsers}` to refresh the table.

**`app/api/admin/users/[id]/route.ts` (PATCH)** — extended to accept any of `{ name?, email?, role? }` on top of the existing `isActive`/`forcePasswordReset`/`permissionOverrides` fields (all independently optional, same convention as the rest of the route — the modal only sends what actually changed). Validates: name/email can't be sent blank; role must be one of `VALID_USER_ROLES`. **Self-demotion guard**: a super_admin can't change their own account's role away from `super_admin` through this route (identity via the verified session's email, same convention as the existing self-delete guard on `DELETE` in the same file) — this is the only way to grant/revoke super_admin in the app, so a self-demotion could otherwise lock every super_admin out with no path back in short of direct DB access. A duplicate-email save now returns a specific 409 ("That email address is already in use by another account.") instead of a generic 500, by checking the Postgres `23505` unique-violation error code.

**`lib/permissions.ts`** — added `USER_ROLE_OPTIONS`/`VALID_USER_ROLES`, centralizing what used to be two independently hand-maintained copies of the same role list: the labeled dropdown array in `UserManagementTab.tsx` and the values-only array in `app/api/admin/users/route.ts`. Both now import from here, and the new edit modal's role dropdown uses the same list — one source of truth instead of three (another instance of the "sibling entry points drift apart" pattern this engagement keeps hitting — see Conventions).

### What was deliberately NOT changed

- No new frontend was needed for instructor CPL License Number/Expiry Date — see above, this was purely a "where do I find it" question.
- Password reset/active-status/permission-override actions were left exactly where they are — not folded into the new Edit modal.
- No confirmation step was added before saving a role change (unlike Delete, which has a `window.confirm()`) — role changes are reversible by editing again, unlike a delete.

### Verification

- Sandbox `npx tsc --noEmit`: clean.
- Sandbox targeted lint on all 5 touched/new files: 2 pre-existing hits in `UserManagementTab.tsx` (a `react-hooks/set-state-in-effect` on the pre-existing `loadUsers()` mount effect, and a `no-explicit-any` on the pre-existing `catch (err: any)` in `handleCreateUser`) — both confirmed pre-existing via `git diff` (on lines this round didn't add), same deferred bucket as every prior round. Zero new issues.
- `npm run build`: not verified in sandbox — same pre-existing Google Fonts network-egress restriction as every prior round.
- Pre-delivery check: staged all 4 pre-existing files from the device and diffed against the sandbox's edited copy — every diff contained exactly and only this round's intended changes.
- All 5 files (4 modified + `UserEditModal.tsx` new) delivered via the device bridge, `device_commit_files` reported all written, then re-verified by re-staging and diffing byte-for-byte (CRLF-normalized) against the sandbox copies — **confirmed zero mismatches.**

### What must happen before this round is testable

1. No SQL migration needed — this round only touches app code (`users.role`/`.name`/`.email` are all pre-existing columns with no schema change).
2. Test: click "Edit" on an existing user, change their name/email, save, confirm the table refreshes with the new values.
3. Test: change a user's role via Edit, confirm it takes effect (e.g. their available modules/nav change on next login).
4. Test: try to change your own (currently logged-in super_admin) account's role away from Super Admin — should be rejected with the "You cannot change your own role away from Super Admin." message.
5. Test: try to set two users to the same email — should be rejected with the new specific "already in use" message rather than a generic failure.

This work is **committed and pushed to `main`** — commit `4ff6c09`, together with all four other 2026-08-20 (session 1) rounds. See the confirmation note at the top of this doc.

---

## SPL Expiry Date (students) + CPL Expiry Date (instructors) — 9 files DELIVERED, confirmed byte-for-byte on the real machine

User's request, verbatim, after confirming the SPL checkbox modal works (see below): "we need to add the expiry date as well to the SPL along with License number... same with CPL details with expiry date for Instructors."

Researched the existing `medical_expiry` pattern first (via a subagent) to follow established convention — nullable `date` column, plain `<input type="date">`, no special required-ness — rather than inventing a new shape. Confirmed instructors had **no** existing expiry-style field at all before this round (`Instructor` interface, both API routes, and `InstructorCard.tsx` all had zero date-comparison logic).

### What was built

**`add-license-expiry-dates.sql` (NEW)** — a separate migration from `add-ba-test-and-license-numbers.sql` rather than editing that file in place, since the earlier one has **already been run** (confirmed indirectly: the SPL checkbox modal, which depends on `students.spl_number` existing, was just tested and works). Editing an already-applied migration and asking the user to "run it again" would be confusing even though the `ADD COLUMN IF NOT EXISTS` pattern is technically safe to re-run.

```sql
alter table students add column if not exists spl_expiry_date date;
comment on column students.spl_expiry_date is 'Expiry date of the student''s Student Pilot License (SPL). Nullable — not every student has one filled in yet.';

alter table instructors add column if not exists license_expiry_date date;
comment on column instructors.license_expiry_date is 'Expiry date of the instructor''s CPL (Commercial Pilot License) / License Number.';
```

**Both nullable, both optional** — same pattern as `spl_number`/`license_number` themselves; not every existing record will have this filled in immediately, and neither expiry date is required to complete the SPL requirement or create an instructor (that requirement/enforcement is scoped to the *number*, not the *expiry date* — see the round below).

- **`types/index.ts`** — `Instructor.licenseExpiryDate?: string`; `StudentRecord.splExpiryDate?: string`.
- **`app/api/students/route.ts`** (POST) and **`app/api/students/[id]/route.ts`** (PATCH `FIELD_MAP`) — both extended for `splExpiryDate`/`spl_expiry_date`.
- **`app/api/instructors/route.ts`** (POST) and **`app/api/instructors/[id]/route.ts`** (PATCH `FIELD_MAP`) — both extended for `licenseExpiryDate`/`license_expiry_date`.
- **`lib/store.ts`** — `loadStudents()`/`loadInstructors()` row mappers both map the new column.
- **`components/students/StudentFormModal.tsx`** — "SPL Number" field (added earlier the same day) is now a 2-column grid alongside a new "SPL Expiry Date" date input; the helper text moved below the pair. **(Superseded by session 2 above — SPL Issue Date now sits in that paired slot, and SPL Expiry Date moved to its own row.)**
- **`components/instructors/InstructorFormModal.tsx`** — "License Number *" field is now paired with "CPL Expiry Date" in the same grid row (previously paired with Status); Status moved down to pair with Ratings instead, so the row layout stays a clean 2-column grid throughout. **(Superseded by session 2 above — the form was reorganized again to fit CPL Issue Date.)**

**One data-type wrinkle handled explicitly:** unlike `spl_number`/`license_number` (text columns, tolerate `''`), `spl_expiry_date`/`license_expiry_date` are Postgres `date` columns — an empty string sent from a cleared date input is an invalid date literal and would error the whole update. Both PATCH routes now coerce `''` → `null` specifically for these two fields before writing (the POST routes already handled this via `|| null`, since a brand-new record's date field starts genuinely absent rather than being cleared). **(Session 2 extended this same coercion to the two new issue-date fields.)**

### What was deliberately NOT changed

- **No expiry-based enforcement was added.** The prior round's "cannot be blank" rule is scoped to the *number* (SPL Number / CPL License Number), not the expiry date — the user didn't ask for the SPL requirement checkbox or instructor creation to also require an expiry date, so neither blocks on it. If the FTO wants that later (e.g. block a BA test entry or SPL completion for an expired license), that's a new, explicit ask.
- **No expiry warning/badge UI was added** (e.g. a red "SPL EXPIRED" banner like `StudentCard.tsx`'s existing medical-expiry traffic-light logic, or a cron notification like `check-notifications/route.ts`'s medical-expiry scan). Not requested this round — the fields exist and are captured/editable, but nothing surfaces "this is expiring soon" yet. Worth flagging as a natural follow-up if the FTO wants it, same pattern as the existing medical-expiry warning system.
- **The Breath Analyser Register form was not touched** — it still only auto-fills License Number, not an expiry date. Not requested; can be added later if useful for the register.

### Verification

- Sandbox `npx tsc --noEmit`: clean.
- Sandbox targeted lint on all 9 touched files: zero new issues — the `set-state-in-effect` hits inside `InstructorFormModal.tsx`'s and `StudentFormModal.tsx`'s populate-on-edit `useEffect`s are pre-existing (confirmed via `git diff` hunk ranges: I only added lines inside an already-existing `setForm({...})` call, didn't introduce the pattern).
- `npm run build`: not verified in sandbox — same pre-existing Google Fonts network-egress restriction as every prior round.
- Pre-delivery check: staged all 8 modified files from the device, diffed each against the sandbox's edited copy, confirmed every diff contained exactly and only this round's intended additions.
- All 9 files (8 modified + `add-license-expiry-dates.sql` new) delivered via the device bridge. One transient hiccup: the first post-delivery verification pass showed `lib/store.ts` as a byte mismatch despite `device_commit_files` reporting it written — re-staging the same file immediately after (no other action taken) resolved it with an identical match, confirming this was a stale-cache artifact in the staging step itself rather than a real delivery gap. All 9 files **confirmed byte-for-byte matching** on the final pass.

### What must happen before this round is testable

1. **Run `add-license-expiry-dates.sql` in Supabase.** ✅ **Confirmed run** (user, session 2 — expiry-date fields work).
2. Test: add/edit a student, fill in (or clear) SPL Expiry Date. **✅ Confirmed working** (session 2).
3. Test: same for an instructor's CPL Expiry Date. **✅ Confirmed working** (session 2, implied by the user's "this works" confirmation covering both fields together).

This work is **committed and pushed to `main`** — commit `4ff6c09`, together with all four other 2026-08-20 (session 1) rounds. See the confirmation note at the top of this doc. **The session-2/3/4 changes on top of this (issue-date fields, sidebar link, Breath Analysis Report page) are NOT yet committed.**

---

## SPL Number / CPL Number required-on-completion enforcement — 7 files DELIVERED, USER-CONFIRMED WORKING (SPL checkbox modal path)

User's request, verbatim: "if a student has SPL then the SPL number can not be blank and same with instructors their CPL number can not be blank... this should be captured either while creating the student or when we click the SPL checkbox."

Researched the actual data model first (via a subagent) before writing anything, since this touches three previously-separate mechanisms: the `students.spl_number` field added earlier the same day, the "Student Pilot License" requirement checkbox in `RequirementsChecklist.tsx` (checked off per-student to mark SPL obtained — this is what BookingForm.tsx checks before allowing any flight), and instructors' `licenseNumber` (their CPL number).

**Finding: instructor CPL number was already required client-side** (`InstructorFormModal.tsx` — HTML `required` + a JS blank-check in `handleSubmit`) but **not enforced server-side** — a direct call to the API route could set it blank. **Finding: the SPL requirement checkbox had no connection at all to `students.spl_number`** — checking "Student Pilot License" complete in the Requirements Checklist never asked for or checked the number, so a student could be marked SPL-complete (and therefore clear to fly solo, per `BookingForm.tsx`'s SPL gate) with no number on file anywhere.

### ⚠️ Testing note: "Solo Release" vs "Student Pilot License" are two different requirements

User initially reported the modal wasn't appearing, with a console log showing `Skipping "Solo Release" — not a ground school subject`. Turned out to be a test mis-click, not a bug: **"Solo Release" and "Student Pilot License" are two separate requirements** in this FTO's Requirements Checklist — Solo Release is a later-stage instructor sign-off with no license number involved, while the SPL modal is wired specifically to the requirement literally named "Student Pilot License" (same match string `BookingForm.tsx` already used). Confirmed via AskUserQuestion that the FTO's Requirements list does have a separate "Student Pilot License" item, distinct from "Solo Release." **Re-tested against the correct checkbox — user confirmed "This works."**

### What was built

**`lib/spl.ts` (NEW)** — a small shared helper, `isSPLRequirement(name)`, matching the same substring (`'Student Pilot License'`) `BookingForm.tsx` already used inline. Extracted so the match string can't drift between the two files independently — the same "sibling entry points into shared data" pattern that's bitten this codebase repeatedly (exercise lists, stage lists, DGCA exam entry points, the aircraft Type dropdown). `BookingForm.tsx` now imports and uses this instead of its own inline `.includes(...)`.

**`components/dashboard/RequirementsChecklist.tsx`** — the "captured... when we click the SPL checkbox" half. `handleCheckboxClick` now special-cases the SPL requirement (checked via `isSPLRequirement`, same priority position as the existing ground-school-subject check): if the student already has a non-blank `spl_number` on their profile (i.e. it was captured "while creating the student" or edited in later), the requirement completes immediately, no extra step. If not, a new modal opens (same visual pattern as the existing DGCA roll-number modal) requiring an SPL Number before the requirement can be marked complete; submitting it saves the number to the student's profile (`PATCH /api/students/[id]`, same field/path as editing it directly on the Student form) and only then completes the requirement. If the save fails, the requirement is deliberately NOT marked complete rather than silently succeeding with no number recorded.

**`app/api/admin/requirements/toggle/route.ts`** — the same rule re-enforced server-side, so it can't be bypassed by calling this route directly (the same reasoning already applied to `completedBy` in this route, and to the DGCA roll number elsewhere in this engagement — client-side capture alone is never treated as a guarantee in this codebase). Before completing any requirement, if it resolves to the SPL requirement, the route now looks up the student's `spl_number` and rejects with 400 if blank.

**`lib/store.ts`** — `updateStudent`'s return type changed from `Promise<void>` to `Promise<boolean>` (does the underlying PATCH actually succeed, yes or no) so the new SPL modal can avoid completing the requirement on a failed save. The one pre-existing caller (`app/dashboard/students/page.tsx`) just awaits it without reading the return value, so this is backward-compatible.

**Instructor CPL number — closed the client-only gap:**
- **`app/api/instructors/route.ts`** (POST) — now rejects a blank/missing `licenseNumber` with 400, matching the existing `name`/`initials` check. `InstructorFormModal.tsx` already sends a non-blank value in normal use (its own required-field guard), so this is a defense-in-depth backstop, not expected to ever fire through the UI.
- **`app/api/instructors/[id]/route.ts`** (PATCH) — rejects an explicit blank `licenseNumber` in an update (a field simply not sent stays untouched as normal — only a sent-but-blank value is rejected).

### What was deliberately NOT changed

- **No new "Has SPL" flag was added to `students`.** "Has SPL" is defined as "the SPL requirement is marked complete in the Requirements Checklist" (same as it always was) — `spl_number` being non-blank on the profile is just a prerequisite for completing it, not a separate parallel status to keep in sync.
- **`StudentFormModal.tsx` itself needed no *validation* change.** The SPL Number field there was already optional (correctly — most students won't have one yet at creation), and there's nothing in that form that asserts "has SPL" independently of the number field, so there was nothing to validate there beyond what already exists.
- **Existing students who were already marked SPL-complete with no number on file are not retroactively touched.** The new checks only apply going forward, at completion time.

### Verification

- Sandbox `npx tsc --noEmit`: clean.
- Sandbox targeted lint on all 7 touched files: zero new issues.
- All 7 files (6 modified + `lib/spl.ts` new) delivered via the device bridge, confirmed byte-for-byte.
- **✅ Functional confirmation (2026-08-20):** user tested the SPL requirement checkbox against the correctly-named "Student Pilot License" item — **"This works."**

### What must happen before this round is fully testable

1. Requires `students.spl_number` to exist — ✅ **Confirmed run** (indirectly, via the working SPL modal test above).
2. ~~Test: check the "Student Pilot License" requirement for a student with no SPL Number on file yet~~ — ✅ confirmed working.
3. Test: check it for a student who already has an SPL Number on their profile — confirm it completes immediately with no modal. Not yet explicitly confirmed.
4. Test: try creating/editing an instructor with a blank CPL/License Number — confirm the client-side block still fires; optionally confirm via a direct API call that the server now also rejects it. Not yet tested.

This work is **committed and pushed to `main`** — commit `4ff6c09`, together with all four other 2026-08-20 (session 1) rounds. See the confirmation note at the top of this doc.

---

## Breath Analyser (BA) Test Register — new feature, DELIVERED (17 files: 5 new, 12 modified, all confirmed byte-for-byte on the real machine)

User shared two photos of the FTO's actual paper BA Test register and asked for it to be digitized, with four explicit requirements: (1) CPL License number for Instructors, (2) SPL License number for Students, (3) a way to capture the FTO's Safety Officer(s), (4) a form Super Admin/Admin/Operations/Safety Officer can use to add/edit entries with all the columns from the paper register (Aircraft, Safety Officer, Student/Instructor, Name, License Number, Reporting Time, BA Time, BA Percentage, BA Equipment).

### Two design questions asked via AskUserQuestion, both answered with the recommended option

1. **How should the Safety Officer be captured?** Chose **"New login role (Recommended)"** over a separate roster/tab: `safety_officer` is now a real user role (like `operations`/`maintenance`), created the same way as any other user via Admin Setup → User Management. The BA form's Safety Officer picker pulls from active users with that role — no separate roster to keep in sync.
2. **Where does the License Number come from?** Chose **"Auto-pull from profile (Recommended)"** over free-text re-entry: License Number auto-fills from the selected person's own record when they're picked in the form (Student → `spl_number` field; Instructor → existing `license_number` field, reused as their CPL number), still editable in the form for a one-off correction.

### What was built

**New table, `ba_tests`** — one row per test: `test_date`, `aircraft_id`/`aircraft_reg`, `safety_officer_id`/`safety_officer_name`, `person_type` (`STUDENT`/`INSTRUCTOR`), `person_id`/`person_name`, `license_number`, `reporting_time`, `ba_time`, `ba_percentage`, `ba_equipment`, `recorded_by` (server-derived from session), timestamps. Person/license/safety-officer data is **snapshotted at entry time** (denormalized), same pattern as `safety_incidents`. RLS disabled on the new table.

**`students.spl_number`** — nullable text column, the Student-side counterpart to Instructor's existing `license_number`. **Both `spl_number` and `license_number` now have companion expiry-date and issue-date fields** — see sessions 1 and 2 above.

- **`add-ba-test-and-license-numbers.sql`** — adds `students.spl_number` and creates the `ba_tests` table. **✅ Confirmed run.**

```sql
alter table students add column if not exists spl_number text;
comment on column students.spl_number is 'Student Pilot License number (SPL), used for Breath Analyser register + license tracking.';

create table if not exists ba_tests (
  id bigint generated always as identity primary key,
  test_date date not null,
  aircraft_id text,
  aircraft_reg text,
  safety_officer_id text,
  safety_officer_name text not null,
  person_type text not null check (person_type in ('STUDENT', 'INSTRUCTOR')),
  person_id text,
  person_name text not null,
  license_number text,
  reporting_time text,
  ba_time text,
  ba_percentage numeric,
  ba_equipment text,
  recorded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ba_tests_date on ba_tests (test_date);
alter table ba_tests disable row level security;
```

**Built secure-by-design from the start** (server-side role-checked API routes, not direct-client Supabase writes). Modeled on `app/api/safety-incidents/route.ts`.

- **`app/api/ba-tests/route.ts` (NEW)** — `GET` (date/from/to filterable, `BA_TEST_VIEW_ROLES`-gated — the `from`/`to` support is what session 4's new Breath Analysis Report page reuses for its weekly/monthly views) and `POST` (`BA_TEST_WRITE_ROLES`-gated).
- **`app/api/ba-tests/[id]/route.ts` (NEW)** — `PATCH` and `DELETE`, both `BA_TEST_WRITE_ROLES`-gated.
- **`app/api/safety-officers/route.ts` (NEW)** — `GET` only, narrow lookup for active `role = 'safety_officer'` users.
- **`lib/permissions.ts`** — `REPORTS_VIEW_ROLES` extended with `'safety_officer'`; new `BA_TEST_VIEW_ROLES` (= `REPORTS_VIEW_ROLES`) and `BA_TEST_WRITE_ROLES = ['admin', 'super_admin', 'operations', 'safety_officer']`.
- **`app/dashboard/reports/breath-analyser/page.tsx` (NEW, ~456 lines)** — the data-entry REGISTER: date-scoped list + inline add/edit form + CSV export. **This page is unchanged as of session 4** — it remains the only place entries are added/edited/deleted, reachable directly via the sidebar's "BA Test Register" link (session 3) as well as previously.
- **`app/dashboard/reports/page.tsx`** — Breath Analyser Register card flipped from `planned` to `live`, linked to the register page. **Superseded by session 4** — the card is now titled "Breath Analysis Report" and links to the new `/dashboard/reports/breath-analysis` reporting page instead.

**Safety Officer role plumbing** — since `safety_officer` is a brand-new role value (`users.role` has no DB-level enum/CHECK constraint):
- **`app/api/admin/users/route.ts`** — `VALID_USER_ROLES` extended.
- **`app/dashboard/admin/setup/UserManagementTab.tsx`** — `ROLES` dropdown gained `🦺 Safety Officer`.
- **`lib/email.ts`** — `roleLabels` map gained `safety_officer: 'Safety Officer'`.
- **`components/ui/Header.tsx`** — `RoleIcon()` gained a `safety_officer` branch.
- **`components/ui/Sidebar.tsx`** — `Dashboard` and `Reports` nav entries both extended to include `safety_officer`.

### Verification

- Sandbox `npx tsc --noEmit`: clean.
- Sandbox `npm run lint`: one new hit at the time (`react-hooks/set-state-in-effect`), confirmed not a new category of debt.
- All 17 files (5 new, 12 modified) delivered via the device bridge, confirmed byte-for-byte.

### What must happen before this round is usable

1. ~~Run `add-ba-test-and-license-numbers.sql` in Supabase~~ — ✅ **confirmed run.**
2. Create at least one **Safety Officer** user via Admin Setup → User Management. **User reported having created "Dummy Safety Officer" (session 3)** — presumed done, not explicitly re-confirmed via a screenshot.
3. Add SPL numbers to existing students as needed — optional.
4. Test the register end to end, AND the new Breath Analysis Report page (session 4) — **still not explicitly tested end to end.**
5. Reconfirm on the real machine: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

This work is **committed and pushed to `main`** — commit `4ff6c09`, together with all four other 2026-08-20 (session 1) rounds. See the confirmation note at the top of this doc.

---

## Safe-batch lint cleanup (166→94 problems) run against `main`@`03bf0d2` — 29 files, DELIVERED, re-verified byte-for-byte on the real machine, FULLY CONFIRMED (tsc/lint/build all match sandbox predictions exactly)

User pasted the full `npm run lint` output (166 problems: 130 errors, 36 warnings) and asked for a plan to clear it. Asked via AskUserQuestion how to approach it, given the app was mid-way toward a `production` merge; **user explicitly chose "Safe batch now, rest later (Recommended)"** — fix the zero-risk/mechanical issues in one round, defer anything touching active-form behavior (any-types, exhaustive-deps, setState-in-effect) to a later, unhurried round.

### What was fixed (7 mechanical categories, 29 files, zero behavior-risk)

1. **`no-var`** — `app/api/cron/check-notifications/route.ts` (full-file rewrite, 34 `var` → `let`/`const`).
2. **Unescaped JSX entities** — apostrophes/quotes in `app/dashboard/instructor/page.tsx`, `app/dashboard/student/page.tsx`, `app/login/page.tsx`.
3. **Unused vars/imports/catch-bindings** — across 14 files, including `lib/weather.ts` (removed the unused `taf` parameter — confirmed this project's eslint config has no `argsIgnorePattern`, so `_`-prefixing does NOT suppress the warning here).
4. **Function-hoisting order** — moved `const loadX = async () => {...}` above the `useEffect` that calls it, in 11 files.
5. **`Date.now()` render-purity** — `AircraftSetupTab.tsx` and `AircraftFormModal.tsx`, fixed with a module-level `getDefaultForm()` helper and `useState(getDefaultForm)` lazy initializer.
6. **Static-component identity** — `app/reset-password/page.tsx`'s `EyeIcon`/`EyeOffIcon` hoisted to module scope.
7. **`prefer-const`** — `GroundSchoolCalendar.tsx`.

**Bonus real fix:** wired `visibleStudents` into `app/dashboard/progress/page.tsx`'s student-selector dropdown — the Stage filter dropdown now actually filters the student list (was dead code before).

### Verification

- Sandbox: 166 → 94 problems (78 errors, 16 warnings), all residual issues confirmed in the deliberately-deferred categories.
- All 29 files delivered, confirmed byte-for-byte.
- **✅ Real-machine confirmation (2026-08-20):** user ran all three commands on the real machine. `tsc --noEmit` clean, `npm run lint` exactly 94 problems (matching prediction), `npm run build` succeeded fully (Turbopack, all 29 routes).

This work is **committed and pushed to `main`** — commit `4ff6c09`, together with all four other 2026-08-20 (session 1) rounds. See the confirmation note at the top of this doc.

---

## Whole-frontend review (correctness/security/UX/code-quality) run against `main` post-commit — 24 findings, several security-relevant. **RECOMMENDATION: fix the security findings below before merging `main` into `production`.**

After committing and pushing all five 2026-08-19 rounds to `main` (commit `03bf0d2`), the user asked for a frontend code review before merging to `production`. Four parallel reviews were run (correctness, UI/UX, security, code quality) against a fresh clone of `main` at that exact commit.

### Security (highest priority — recommend fixing before `production` merge)

1. **IDOR — `app/dashboard/ground-school/progress/page.tsx:215` — CONFIRMED.** The `?student=` URL parameter overrides the session-derived student ID with no ownership/role check. Any logged-in student can navigate to `/dashboard/ground-school/progress?student=<other-uuid>` and view another student's DGCA roll number and exam scores.
2. **Forged exam records — same file, `addDirectExam()` at line 255.** Combined with #1, a client-side insert with no role check lets anyone set an arbitrary PASS/EXEMPTED result, score, and roll number for any student.
3. **`training_requirement_templates` writable via anon key — `RequirementsTab.tsx:107`.** Holds the `blocks_solo`/`blocks_all_flights` flags gating the hardened Solo Release toggle.
4. **The same direct-write-bypass pattern recurs across most of the Admin Setup wizard**, not just `AircraftSetupTab.tsx`: `ExercisesTab.tsx:74`, `TrainingProgramsTab.tsx:86`, `RolesTab.tsx:56`, `SortieTypesTab.tsx:75`, `GroundSchoolTab.tsx:46`, and holiday-calendar writes in `lib/store.ts:1506`.

**Why this matters:** the app's anon key is public by design, and this codebase's own RLS pattern is permissive `USING (true)` policies on most tables — "client-side role check only" is very likely equivalent to "no real protection" for every table listed. The Requirements toggle route is the existing model for the fix. **Note: the BA Test Register feature, the SPL/CPL required-number enforcement round, and the SPL/CPL date-field rounds (sessions 1-4) were all deliberately built following this exact model from the start — none add to this list.**

### Correctness

- **0-vs-null bug in progress percentages — `app/dashboard/progress/page.tsx:234` — CONFIRMED.** `??` only falls through on `null`/`undefined`, not `0` — a `0` in any Training Programs hour field produces `NaN`/`Infinity`-clamped-100%.
- `app/dashboard/student/page.tsx:104` hardcodes 40h/200h targets instead of using `matchTrainingProgram()`.
- `FlightDetailModal.tsx:313` — "Student Medical Valid" doesn't null-guard `medicalExpiry`.
- `FlightRecordForm.tsx:74`/`DebriefForm.tsx:42` — flight duration silently clamps to 0h for midnight-crossing sorties.
- `AircraftCard.tsx:28` — fuel-percent calc unguarded against `fuelCapacity = 0`.
- `ScheduleBoard.tsx:545` — printed Daily Ops Sheet's IST hour-column math drops minutes.
- `lib/store.ts` — several write actions fail silently while calling pages close the edit modal unconditionally.

### UI/UX

- ~~Four core modals hardcode dark Tailwind classes, unreadable in light mode.~~ — ✅ **fixed 2026-08-25 (third round)**, see top of this doc (5 files, not 4).
- Icon-only buttons mostly lack `aria-label`.
- No modal closes on Escape; 3 modals can overflow on short viewports.
- The two aircraft forms still diverge on several fields.
- IST time-conversion logic reimplemented in 4 files.
- No expiry/issue warning-badge UI exists yet for the SPL/CPL dates.

### Code quality

- ~~`app/dashboard/progress/page.tsx:141` dead `visibleStudents` filter~~ — ✅ fixed in the lint-cleanup round.
- CSV import logic duplicated and drifted between `ExercisesTab.tsx`/`HolidaysTab.tsx`.
- `GroundSchoolCalendar.tsx` is a 1036-line monolith.
- Admin Setup CRUD-tab boilerplate duplicated across ≥4 tabs.

### Recommendation

Hold off on merging `main` into `production` until at minimum the security findings above are addressed, or the user makes an explicit informed call to accept the risk. The correctness/UX/code-quality findings are lower urgency.

---

## 2026-08-19 round (fifth round): CPL hour-segregation gap — Multi Engine + Simulator hours added, plus an aircraft type/model data-model fix needed to make Multi Engine auto-track — DELIVERED, SQL RUN, USER-CONFIRMED WORKING ("For now all looks good"), COMMITTED & PUSHED TO MAIN

User caught a real gap while reviewing CPL's hour breakdown: the syllabus also mandates Multi Engine Hours (15h) and Simulator Hours (20h) minimums, which were never added alongside the five requirement columns from the second round. Also gave the REAL correct CPL numbers — Solo 90h and Cross-Country 60h (vs. earlier seeded guesses 100h/50h).

**Design decisions (AskUserQuestion):** Multi Engine Hours computed **by aircraft flown**; Simulator Hours computed **by aircraft/device flown** (FTO registers its simulator as its own aircraft entry).

**Aircraft `type`/`model` data-model fix:** `aircraft.type` was holding a SPECIFIC MODEL CODE with an independently-drifted hardcoded dropdown in two files. Fixed: `type` is now the engine category (`'Single Engine'`/`'Multi Engine'`, a genuine fixed 2-value enum), `model` holds the specific variant (free text), and a new `is_simulator boolean` flags an FTO's simulator.

**Migration — `restructure-aircraft-type-model.sql` (RUN 2026-08-19):** freezes existing fuel-burn rates, adds `is_simulator`, backfills `model`, re-purposes `type` into the new 2-value category.

**`lib/flight-classification.ts`** — `isMultiEngineFlight(aircraft)`/`isSimulatorFlight(aircraft)`. **`add-multi-engine-simulator-hours-to-training-programs.sql` (RUN 2026-08-19)** — adds `multi_engine_hours`/`simulator_hours` to `training_programs`, sets CPL's corrected numbers.

**Post-delivery bug (fixed once migration ran):** editing an aircraft failed with a generic error until `restructure-aircraft-type-model.sql` was run, since the edit form always sent `isSimulator` but the column didn't exist yet.

**User confirmed "For now all looks good"** after running both migrations and retrying the aircraft edit.

---

## DGCA roll number + real exam score capture across all three ground-school exam entry points, plus a store.ts delivery gap found and fixed (2026-08-19, fourth round) — DELIVERED, USER-CONFIRMED WORKING, COMMITTED & PUSHED TO MAIN

**1. `store.ts` delivery gap** — a file recorded as delivered was actually stale on the real machine (`loadTrainingRequirementsForStudents` missing), surfaced by a live `TypeError`. Fixed, and — critically — **re-verified by staging back down and diffing byte-for-byte** rather than trusting `device_commit_files`'s "written" response alone. This is now standard practice every round.

**2. DGCA roll number + real exam score** — ground school subjects are DGCA-administered, not FTO-administered; none of the three ways to record a subject complete/passed actually captured the real roll number/score. Fixed across all three entry points: Ground School → Progress "Mark as Completed" (Direct Exam Entry), the Attendance page's per-student exam editor, and the Requirements Checklist (found by the user as a third independent path).

**User-confirmed working end to end** ("great works now").

### Follow-up decision: PPL Phase 1/Phase 2 split explicitly declined for now

Only a `MULTI` row is being added to `training_programs`; PPL Phase 1/2 rows explicitly declined.

---

## SPL/design discussion, training_requirements table split (templates vs. per-student), fully DB-driven training-stage dropdown, second hardcoded-list fix, instructor dashboard fix (2026-08-19, third round) — SQL RUN, RLS GAP FOUND AND FIXED, STORE.TS DELIVERY GAP FOUND AND FIXED, SMOKE TESTING MOSTLY COMPLETE, COMMITTED & PUSHED TO MAIN

**New table, `training_requirement_templates`** — master list only, split apart from `training_requirements` (per-student assignments). Migration `split-training-requirement-templates.sql` run and verified clean.

**⚠️ Post-migration RLS bug found and fixed** — new tables in this Supabase project do NOT inherit anon-key access; `training_requirement_templates` had RLS-on with zero policies. Fixed via `fix-templates-rls-policy.sql`. **Superseded by the simpler current convention** (`disable row level security` outright on any new table).

**`StudentFormModal.tsx`'s training-stage dropdown made fully DB-driven**, hardcoded fallback removed entirely.

**Second hardcoded stage list found** in `app/dashboard/students/page.tsx`'s filter dropdown, fixed.

**Instructor dashboard**: overfetch fix (scoped `training_requirements` query) + third occurrence of the hardcoded target-hours pattern, fixed via `matchTrainingProgram()`.

### Open incident: accidental overwrite of `claude/next-steps-plan-2026-08-11.md` — ✅ resolved 2026-08-25 (reconstruction)

A `project_write` without a preceding `project_read` destroyed this doc's real content. Disclosed immediately. **Resolved 2026-08-25** — user chose "Attempt reconstruction" over starting fresh or waiting; a best-effort rebuild (sourced from `claude/flow-audit-2026-08-11.md` and `claude/engagement-summary-2026-08-20.md`, explicitly marked as reconstructed, not original) is now published at that path. See the 2026-08-25 section at the top of this doc for details.

---

## Solo Release server-side hardening + full-codebase hardcoded-data audit/cleanup + per-phase training-program matching (2026-08-19, second half of the day) — DELIVERED, PARTIALLY VERIFIED, COMMITTED & PUSHED TO MAIN

**Part A** — `app/api/admin/requirements/toggle/route.ts` (NEW): real server-side role check + server-derived `completedBy` for the Requirements Checklist toggle (previously UI-only + client-trusted). **User-confirmed working.**

**Part B** — Full-codebase hardcoded-data audit (subagent). `lib/data.ts` deleted (dead mock module). Several live duplicates migrated to DB-driven sources (`StudentFormModal.tsx`, `StudentCard.tsx`, `StudentProgressWidget.tsx`, `lib/ground-school-sync.ts`).

**Part C** — `lib/training-programs.ts` (NEW): `matchTrainingProgram()`, exact-match-first per-phase resolution.

---

## 2026-08-19 round (first half of the day): Solo Release exercise gate, DB-backed exercise lists, audit-identity fix, and visibility improvements — FULLY CONFIRMED on the real machine, COMMITTED & PUSHED TO MAIN

Solo Release exercise gate in `BookingForm.tsx`; exercise dropdown made DB-backed (removed hardcoded 27-entry array, found and fixed a SECOND copy in `ScheduleBoard.tsx`); audit-identity fix in `RequirementsChecklist.tsx`; visibility improvements. **User confirmed: "Yes all works."**

---

## Where things stood before the 2026-08-18 round

The app was **live on `production`** with everything through the per-user permission override feature. Repo: `https://github.com/gauravjee/FlightPlanner` (public). User works locally at `C:\Users\gaura\Documents\flightpro-app` on Windows. Branch flow: `main` first, then `git checkout production; git merge main; git push origin production`.

**Working model:** Claude sessions work in a parallel sandbox clone (no push access to the real repo — confirmed via a 403 from the git proxy in session 2, `gauravjee/FlightPlanner is not in this session's authorized repository set`) for research/verification — tsc/lint/build predictions have matched the real machine's output exactly, round after round. **Note (2026-08-25): this sandbox's git HEAD can lag several commits behind the real repo's `main` (observed at a stale `4ff6c09` this session, with sessions 2-7's work sitting as accumulated uncommitted working-tree changes) — the working tree itself has stayed current because each round's edits are made directly on top of whatever the sandbox already had, but `git diff`/`git log` in this sandbox should NOT be trusted as a proxy for "what's on the real `main`" without cross-checking mtimes/content against the device.** **Default delivery method: when a desktop device is connected (`mcp__remote-devices__*` tools), request folder access once, then edit/verify/deliver files directly there (stage → Read → Edit → sandbox tsc/lint check → SendUserFile → device_commit_files with an `expectedMtimeMs` guard).** **`device_commit_files` reporting a path as `"written"` is NOT sufficient proof a delivery landed — re-stage that same file immediately and diff it against the sandbox copy before considering the delivery verified.** **Caveat: the device bridge can write/overwrite files but has no delete capability in this session (no `device_bash` tool was available) — file deletions must be asked of the user directly.** Git commands still have to be handed to the user to run themselves; nothing is "done" until the user confirms `tsc`/`lint`/`build` and functional smoke test on the real machine, AND until the user pastes back real `git commit`/`push` output.

## The three other project docs, and when to read which

- **`claude/next-steps-plan-2026-08-11.md`** — the full backlog + status log, newest update at the top. **This file's real content was accidentally destroyed (overwritten with placeholder text) during the third round; a best-effort reconstruction was published 2026-08-25 — see the "Open incident" section above. Safe to read, but it's a reconstruction, not the original — treat any fine-grained wording/prioritization detail from it as approximate. `claude/handoff-2026-08-18.md` (this doc) is the authoritative source of truth going forward.**
- **`claude/qa-test-plan-2026-08-14.md`** — the QA test plan. Addendum B (2026-08-18) covers through the permission-override round. Doesn't yet cover Reports or any 2026-08-19/08-20 work.
- **`claude/flow-audit-2026-08-11.md`** — the original code-level audit that seeded a lot of this backlog. Mostly historical.
- **`claude/engagement-summary-2026-08-20.md`** — a readable, non-technical summary of this whole engagement, written for someone who wants the high-level picture without reading this entire file. **Not yet updated for sessions 2-5 above — worth refreshing next time that doc is touched.**
- **`claude/FlightPro_Manager_Master_Plan_Tracker.xlsx` (in `docs/` on the real repo, not a project doc)** — the 2026-08-25 spreadsheet consolidating Completed/Pending/On Hold/New Features. Its On Hold sheet's "4 modals hardcoded dark Tailwind classes" row is now stale (fixed, see top of this doc) — update next time that workbook is regenerated.

## What's still outstanding — the actual to-do list

1. ~~fix the security findings above before merging `main` into `production`~~ — ✅ **fixed (session 7)**: IDOR, forged exam records, `training_requirement_templates`, and the Admin Setup wizard tabs + holidays are all now server-side enforced via `/api/admin/config/[table]` and `/api/admin/ground-school/direct-exam`. **Pending user testing (see session 7's testing checklist above) before this can be considered fully closed.** Two related-but-out-of-scope write paths (Attendance page, `RequirementsChecklist.tsx`'s own exam entry) remain unhardened — see item 39.
2. ~~**Resolve the open incident:** `claude/next-steps-plan-2026-08-11.md` was accidentally overwritten — needs a user decision.~~ — ✅ **resolved (2026-08-25)**: user chose reconstruction; a best-effort rebuild is now published at that path (marked as a reconstruction, not the original). See the 2026-08-25 section at the top of this doc.
3. **Finish smoke-testing**: training-stage dropdown, student cards, students-list filter, target-hours consistency (now testable — MULTI row confirmed added, session 5), optional role-block check, Multi Engine/Simulator progress cards against real flight data, the Breath Analyser Register AND the new Breath Analysis Report page end-to-end, the instructor CPL server-side block, the SPL/CPL issue-date fields (now unblocked — session 5).
4. ~~Add the Admin Setup → Training Programs `MULTI` row~~ — ✅ **done (session 5)**, and the SPL row was removed (confirmed safe, no code dependency on it — see session 5).
5. ~~**Consider revising IR's `required_hours` (currently 40)** and whether it's intentional.~~ — ✅ **resolved (2026-08-25)**: user confirmed the correct DGCA value is 15 and updated it themselves via Admin Setup → Training Programs (through the now-secured `/api/admin/config/training-programs` route). No code/SQL change needed — this session's role was just to record the confirmation.
6. ~~Consider a fix for SPL's `required_hours = 0`~~ — **no longer applicable (session 5)** — the SPL row itself was removed from `training_programs`. The same `??`-vs-`0` bug class still affects the five Progress-page fields noted in the frontend review, though — worth keeping in mind for any program row that legitimately has a `0` in one of those fields.
7. ~~Commit/push sessions 2, 3, and 4~~ — ✅ **confirmed committed, pushed, AND merged into `production`**, first at commit `5c24c73` (2026-08-24, sessions 6, 7, DGCA drafts), then advanced to `4aefc5c` (2026-08-25, today's two earlier rounds) — see the confirmation sections above. **⚠️ Merged before testing, both times** — items 35-36 (session 7) and 43-44 (today's rounds) remain urgent since those fixes are live on `production` untested. The modal-theming round (this doc's top section) is a THIRD, separate 2026-08-25 change, still uncommitted — see item 46.
8. **Deliberately deferred:** the Dashboard widget/instructor-dashboard vs. Progress page fallback-when-no-program-matches inconsistency (200h vs 40h).
9. ~~Four SQL migrations still not confirmed run in Supabase~~ — ✅ **ALL CONFIRMED RUN (session 5)**: `add-training-program-requirement-columns.sql`, `add-holidays-table.sql`, `add-instructor-self-booking-permission.sql`, `add-user-permission-overrides.sql` all verified present via `information_schema` check. **No SQL migrations remain unconfirmed as of session 5.**
10. **No live test yet of the permission override feature.**
11. ~~**Open judgment call:** should `instructor` regain view access to the Instructors roster page?~~ — ✅ **resolved (2026-08-25)**: yes — `lib/permissions.ts`'s `INSTRUCTORS_VIEW_ROLES` and `components/ui/Sidebar.tsx`'s nav entry for `/dashboard/instructors` both updated to include `'instructor'`; write access unchanged (`INSTRUCTORS_WRITE_ROLES` still admin/super_admin only). ✅ **Committed and pushed, commit `4aefc5c`.** Add to the pending testing list: confirm instructor can now view but not edit the full roster.
12. **QA Addendum B hasn't been run against the real app yet**, and doesn't cover Reports or any 2026-08-19/08-20 work.
13. **Backlog item 5, Checkbox-style Requirements UI**, the natural next feature once the above is cleared.
14. ~~DGCA templates still needed for the Maintenance Log and full Incident Report~~ — ✅ **draft templates delivered, see item 41.**
15. **Pre-existing, deliberately-not-fixed data inconsistency:** exercise field storage format differs between `FlightRecordForm.tsx` and `BookingForm.tsx`.
16. **Cosmetic:** a historical flight shows a slightly different exercise short code than before.
17. **Minor DRY nit:** leave-type list duplicated between two files, no table to migrate to.
18. **Minor cosmetic:** two `ground_school_enrollment` rows from pre-DGCA-fix testing have blank `dgca_roll_number`/stale examiner label.
19. **Review every existing aircraft's Type/Model** after `restructure-aircraft-type-model.sql`.
20. **The remaining non-security findings from the post-commit frontend review** — lower urgency than item 1.
21. ~~**The deferred lint bucket** — `no-explicit-any`, `react-hooks/exhaustive-deps`, `react-hooks/set-state-in-effect`, `@next/next/no-img-element` — deliberately left for later.~~ — ✅ **`no-explicit-any`/`exhaustive-deps`/`no-img-element` all cleared 2026-08-25 (fourth round)**, see top of this doc — 32 files, lint 97→32. `react-hooks/set-state-in-effect` (32 remaining) remains deliberately deferred — architectural, not a bug.
22. **Confirm the Safety Officer user was actually created** — user reported creating "Dummy Safety Officer" (session 3) but this hasn't been independently re-verified (e.g. via a screenshot of the User Management table).
23. **Test the instructor CPL server-side block** — not yet explicitly confirmed.
24. **Test the SPL/CPL expiry date fields** — ✅ **done** (session 2).
25. **Optional:** backfilling expiry/issue dates for existing SPL/CPL numbers already on file.
26. ~~Optional: no expiry/issue warning-badge UI exists yet for the new SPL/CPL dates~~ — ✅ **built (session 6)** — SPL/CPL auto-expiry-from-issue-date + UI badge + email alert all delivered; still needs functional testing (item 33 below).
27. ~~Test the User Management "Edit" action~~ — ✅ **confirmed working (session 6)** — name/email/role edit tested by the user.
28. ~~Run `add-license-issue-dates.sql`~~ — ✅ **confirmed run (session 5).** Test SPL/CPL Issue Date fields — including the empty-string-clears-to-null path — still pending.
29. **Test the sidebar nav-highlight fix** — click "Instructors", confirm "My Students" no longer also highlights.
30. **Test the new Breath Analysis Report page** — Daily/Weekly/Monthly toggle, summary tiles, PDF export, Excel/CSV export — and confirm the sidebar's "BA Test Register" link (now above "Reports") still opens the unchanged register page, while the Reports-section card now opens the new report page.
31. ~~Commit and push sessions 2, 3, and 4 together~~ — ✅ **done (2026-08-24, commit `5c24c73`)**, see confirmation section above.
32. **NEW (session 5):** Test target-hours consistency for a MULTI student across Dashboard widget / Progress page / Instructor dashboard, now that the `MULTI` training program row exists.
33. **NEW (session 6):** Test the SPL/CPL auto-expiry-from-issue-date feature (issue date auto-fills expiry +10y, stays editable, doesn't get overwritten once touched) and the new SPL/CPL expiry alert system (UI badges on Student/Instructor cards, email notification via the cron endpoint) — see "What must happen before this round is testable" under session 6 above.
34. ~~Commit and push session 6~~ — ✅ **done (2026-08-24, commit `5c24c73`)**, see confirmation section above.
35. **⚠️ URGENT — now live on production, untested:** Test the security-hardening round — all 7 Admin Setup config-route tabs, Aircraft Setup, the IDOR fix (student can no longer view another student's progress via URL param), and the direct-exam-entry route — see session 7's testing checklist above.
36. **⚠️ URGENT — now live on production, untested:** Test the accessibility-hardening round — Escape closes all 15 modals, all 11 Close buttons announce correctly to a screen reader.
37. ~~**NEW (session 7):** Four modals' hardcoded dark Tailwind classes (light-mode readability) — deferred, needs visual verification not possible in this sandbox.~~ — ✅ **fixed 2026-08-25 (third round)** — turned out fixable without a browser via the token system; 5 files (not 4), see top of this doc. **Still needs a real-machine visual spot-check in both themes — see item 46.**
38. **NEW (session 7):** Broader icon-button `aria-label` coverage (edit/delete pencil/trash icons) beyond this round's Close-button scope — deferred.
39. **NEW (session 7):** Two more client-side write paths into `ground_school_enrollment`/`training_requirements` found but deliberately deferred — the Attendance page and `RequirementsChecklist.tsx`'s own separate exam-entry path. Same class of fix as the `direct-exam` route, different call sites.
40. **NEW (session 7):** 3 modals that can overflow on short viewports — deferred, needs viewport verification.
41. ~~DGCA templates for the Maintenance Log and full Incident Report are still blocked on the user providing the actual prescribed format~~ — ✅ **draft templates delivered (2026-08-24)**: two Word docs (`FlightPro_Maintenance_Log_Template_DRAFT.docx`, `FlightPro_Incident_Report_Template_DRAFT.docx`), built from standard CAR/ICAO Annex 13 conventions rather than the real DGCA forms (user chose "build a reasonable draft now" over waiting), explicitly marked DRAFT with a callout box in each, committed to the repo at `docs/dgca-templates/`. **User still needs to verify both against the FTO's actual CA Form 19-10 / CAR Section 5 paperwork before either is implemented in-app.**
42. **NEW (2026-08-24):** Implementation plan for the two DGCA drafts, researched but explicitly NOT started (user chose "hold off until I verify the forms" over building now):
    - **Incident Report** — extend the existing `safety_incidents` table (`add-reports-module.sql`: `incident_date/time`, `aircraft_id/reg`, `student_id/name`, `instructor_id/name`, `description`, `severity`, `reported_by`) with the draft's missing fields (occurrence classification, per-person injury, damage, contributing factors, corrective action, DGCA notification date/reference). The API route (`app/api/safety-incidents/route.ts`) is already the correct secure pattern (`requireRole` + `supabaseAdmin`, both GET/POST) — just needs the new columns added to its accepted payload. Also needs a proper standalone form/page; today entry is a small panel buried in the Daily Flying Report page.
    - **Maintenance Log** — extend the existing `maintenance_records` table (currently: `aircraftId`, `maintenanceType`, `description`, `scheduledDate`, `completedDate`, `status`, `cost`, `performedBy`, `notes`) with the draft's DGCA-specific fields (airframe hours at entry, flight/block hours, parts used, AME license number, CRS reference — split `description`/`notes` into `defect_reported`/`rectification_action` if useful). **Found in the same investigation: `maintenance_records` writes are secured (`requireModuleAccess('maintenance','full')`) but reads still go through a legacy direct client-side Supabase call in `lib/store.ts`'s `loadMaintenanceRecords` — worth adding a `GET` to `app/api/maintenance-records/route.ts` and switching that read while this table is being touched anyway.**
    - Both follow the same "extend the existing table, don't build a parallel one" reasoning already used for `AircraftSetupTab.tsx` reusing `/api/aircraft`.
43. **NEW (2026-08-25):** Test "My Students" is now instructor-only — confirm admin/super_admin no longer see the tab and get "Not Authorized" if they navigate to `/dashboard/instructor` directly; confirm instructors still see it and it works as before.
44. **NEW (2026-08-25):** Test the Dashboard after the "Quick Actions" tile grid removal — confirm the page layout still looks right with the NOTAM card flowing directly into Fleet Fuel Status, and that every module the tile grid used to link to is still reachable via the sidebar for each role.
45. ~~Commit and push both 2026-08-25 rounds (instructor-roster view access; My Students scoping + Quick Actions removal)~~ — ✅ **done (2026-08-25, commit `4aefc5c`, `5c24c73..4aefc5c`)**, and ✅ **merged into `production` the same day** — `production` now matches `main` at `4aefc5c`. Both are now live; items 43-44 (functional testing) are the remaining follow-up.
46. ~~**NEW (2026-08-25, third round):** Commit and push the modal-theming fix (5 files)~~ — ✅ **done (2026-08-25, commit `91b5ff0`)**, ✅ **merged into `production` same day** — see the confirmation section at the top of this doc. Still outstanding: spot-check the 5 modal files in both light and dark mode on the real machine (now part of the combined testing checklist at the top of this doc), and update the Master Plan Tracker xlsx's On Hold sheet (move this row to Completed).
47. ~~**NEW (2026-08-25, fourth round):** Commit and push the `no-explicit-any`/`exhaustive-deps`/`no-img-element` lint cleanup (32 files)~~ — ✅ **done (2026-08-25, commit `91b5ff0`)**, ✅ **merged into `production` same day**, same commit as item 46 above. `tsc`/`lint`/`build` all independently confirmed clean on the real machine before commit.
48. **⚠️ URGENT — NEW (2026-08-25): four rounds now simultaneously live on `production`, ALL untested** — session 7's security/accessibility hardening (items 35-36), the My-Students-scoping/Quick-Actions-removal round (items 43-44), the modal-theming fix (item 46), and the lint cleanup (item 47). User's explicit call: rather than sequence testing, the team will do one full click-through test of the whole app covering all four at once. **See the combined testing checklist at the top of this doc** — it consolidates every individual round's testing steps into one list for the team to work through.
49. ~~**NEW (2026-08-25): commit and push the SPL/CPL expiry timezone-plus-inclusive-day bugfix, AND the new Medical Issue Date / age-based DGCA Class 1 auto-expiry feature together**~~ — ✅ **done (2026-08-25, commit `1fd8db6`)** — see the confirmation section near the top of this doc. ~~Run `add-medical-issue-date.sql` in Supabase~~ — ✅ **confirmed run by the user (2026-08-25)**, the new Medical feature is now functionally testable. **Still outstanding: (a) merge `main` into `production` when ready (not yet done for this round); (b) run the testing checklist in the top section of this doc for both the SPL/CPL fix and the new Medical feature — this round has not been through the team's testing pass yet.**
50. **A new QA Test Plan (`docs/FlightPro_Manager_QA_Test_Plan_NewTester.docx`) was delivered for a newly-hired tester** — a self-contained, 16-page, no-prior-context-assumed plan covering every role, page, and feature currently live, with the four untested production rounds flagged as priority up front. The SPL/CPL expiry bug (item 49) was the first real finding from the team using it, which led directly to the Medical Issue Date feature also in item 49.
51. **NEW (2026-08-25) — flagged, NOT yet investigated or fixed: the `.toISOString().split('T')[0]` pattern used to compute "today's date" appears in roughly 20 more places across the codebase**, most commonly `new Date().toISOString().split('T')[0]` as a default for exam_date/completedDate/today-marker fields, and — more concerning — in `app/api/cron/check-notifications/route.ts`'s medical/SPL/CPL/scheduled-flight expiry-window date-range queries (`.gte(...)`/`.lte(...)` against `today.toISOString().split('T')[0]`, `thirtyDaysFromNow`, `sevenDaysFromNow`). Unlike the `addYears()` bug just fixed (which used a LOCAL-midnight-constructed Date), these use `new Date()` — the actual current instant — so `.toISOString()` gives the correct UTC calendar date, but if the server or a user's browser is meant to be reasoning in IST "today," the UTC date and the IST date genuinely differ for roughly the first 5.5 hours of every IST calendar day (00:00–05:29 IST is still "yesterday" in UTC). Whether this is a REAL bug depends on where each check actually runs (a serverless cron route very likely runs in UTC) and whether "today" was ever meant to mean "today in India" specifically. **Not fixed this round — flagged for a future scoped investigation, since blindly patching ~20 call sites without confirming which ones are actually reachable during that ~5.5-hour daily window (and whether it matters for each) risks its own set of new bugs.** Worth a dedicated look, likely starting with the cron notification route since a one-day-early/late alert on a medical/SPL/CPL expiry is the highest-stakes version of this bug class.

## Conventions worth knowing before touching any of this

- **Project doc edits are full-content replace (no partial patch) — ALWAYS `project_read` before `project_write`.**
- New status section appended at the **top**, full history kept below, older "latest" headers get that word stripped once superseded, plus a running reverse-chronological log.
- Judgment calls made without an explicit user answer are always disclosed in-doc rather than shipped silently.
- Sandbox lint/build predictions have matched the user's real-machine output exactly on every round so far. `npm run lint` scans the whole repo every run — isolate with a before/after test rather than assume a warning is new. `npm run build` could not be verified in the sandbox for 2026-08-20 rounds — Google Fonts network egress is blocked in this cloud environment; `tsc`/`lint` remain the reliable sandbox checks, `build` needs the real machine.
- **Device-bridge editing is the default delivery method when a desktop is connected.** Never call `device_stage_files` on a file again after making local edits to it unless deliberately verifying device state. `device_commit_files` reporting "written" is NOT sufficient proof — re-stage and diff immediately after. The device bridge has no file-delete capability unless `device_bash` happens to be available. When checking for undisclosed device-side edits and a PRIOR uncommitted round also touched the file, diff against the sandbox's edited copy, not raw git HEAD; when starting fresh right after a commit, plain HEAD is correct. **As of 2026-08-25: this sandbox's git HEAD can be several commits stale even though its working tree is current — cross-check on-device file mtimes (do they cluster with the last known delivery/commit round?) rather than trusting `git diff`/`git log` alone to judge "pre-existing vs. new" when the working tree carries many sessions' accumulated uncommitted changes.**
- **This session has NO push access to the real repo** — confirmed via a 403 from the git proxy (`gauravjee/FlightPlanner is not in this session's authorized repository set`) when a stop-hook nudged toward committing in the sandbox clone. This is intentional, not a bug to work around: the sandbox clone is disposable, edit/verify-only; the user commits from their own machine with their own credentials. A generic "uncommitted changes" stop-hook warning in this sandbox should be read in that light, not acted on by trying to push.
- **A session with no folder connected yet must call `device_request_folder_access` before any device-bridge work can happen** — the first request can silently time out with no user response (the dialog closing itself), which is not the same as a decline — simply retry once.
- **This repo has Windows CRLF line-ending conversion active** — always normalize with `tr -d '\r'` on both sides before diffing.
- **The default `@typescript-eslint/no-unused-vars` config in this project has no `argsIgnorePattern`** — `_`-prefixing does NOT suppress the warning here.
- **When adding a module-level helper to fix a `Date.now()`/render-purity lint error, use React's lazy `useState` initializer pattern** — `useState(getDefaultForm)`, function reference not called inline.
- **When asked to remove a hardcoded/static list and replace it with a DB-backed one, grep the whole repo for that data first** — seen 5+ times this engagement.
- **A feature/fix implemented at one entry point into shared data often has sibling entry points that need the identical fix.**
- **A UI-only "required" field is not real enforcement** — always check whether the API route the form posts to actually enforces it too.
- **A nullable `date` column is not equivalent to a nullable `text` column when it comes to clearing a field** — `''` is valid for `text` but Postgres rejects it as an invalid date literal for `date`. Now needed for `spl_expiry_date`/`license_expiry_date` AND `spl_issue_date`/`license_issue_date`.
- **When two similar records need the same shape of paired fields, pair the related fields' UI right next to each other.**
- **A plain `pathname?.startsWith(href)` check for nav-item "active" state is unsafe when two sibling routes' paths are a literal string-prefix of each other but not a real path-segment prefix** — confirmed concretely session 2 with `/dashboard/instructor` vs `/dashboard/instructors`. Always match on `pathname === href || pathname.startsWith(href + '/')`. **Note: a genuine parent/child URL nesting (e.g. `/dashboard/reports` and `/dashboard/reports/breath-analyser`) is NOT this bug** — that's intended structure, and both nav items correctly co-highlight when visiting the child route.
- **Two visually-similar checklist items can be entirely different requirements with no relationship to each other** — e.g. Solo Release vs. Student Pilot License.
- **Admin Setup is a 10-tab wizard**, `super_admin`-only. New user roles are purely app-level changes (`users.role` has no DB CHECK constraint).
- **Not every apparent duplicate is a DB-staleness bug** — some hardcoded lists are genuinely fixed enums.
- **This session had no `device_bash` tool** — only file transfer, not a remote shell.
- **A shared matching helper, `lib/training-programs.ts`'s `matchTrainingProgram()`, exists for resolving a student's `trainingStage` to a `training_programs` row.**
- **A parallel helper, `lib/spl.ts`'s `isSPLRequirement()`, exists for the "is this the SPL requirement?" name match** — note this match is entirely independent of whether a `training_programs` row named SPL exists (session 5 confirmed the row can be removed with zero effect on this).
- **"Loosely coupled by a matched string, not a foreign key" is an intentional pattern in this codebase** — confirm via grep before assuming a delete/rename needs a cascading fix.
- **Two tables can look like duplicates of one concept but serve genuinely different purposes** — `training_requirement_templates` vs. `training_requirements` is the canonical example.
- **Current convention for RLS on a brand-new table: `alter table X disable row level security;` outright.** When adding a column to an EXISTING table, no RLS/policy changes are needed.
- **This app's "exam" terminology throughout ground school is DGCA-administered, not FTO-administered.**
- **Not every progress metric applies to every training program** — some are program-specific extras with NO fallback; NULL means "hide this card."
- **Some data that reads as a single concept can actually be two conflated ones** — `aircraft.type` was really "engine category" + "model" mashed together.
- **A migration that adds a column/table a live feature depends on must be run BEFORE that feature is exercised** — say explicitly which must land first.
- **SQL migration files belong in the repo**, even though applied by hand via the Supabase SQL editor.
- **`??` (nullish coalescing) is not a safe fallback pattern for admin-settable numeric fields that can legitimately be `0`.**
- **A role check enforced only in the UI is not real protection in this app** — most tables have permissive `USING (true)` RLS policies. The Requirements Checklist toggle route is the reference pattern for doing this correctly.
- **When a create form and its sibling edit form/modal share a dropdown's option list, centralize the list in one shared module.**
- **An "auto-fill until the user touches it" field (Expiry Date from Issue Date, or Initials from Name) needs an explicit tracking flag** (`fooManuallyEdited` state, set `true` either on direct user edit or when loading an existing record that already has a real value) — without it, either the auto-fill never fires past the first keystroke, or it silently clobbers a value the user (or a prior save) deliberately set. `StudentFormModal.tsx`'s `initialsManuallyEdited` was the original instance of this pattern; session 6's `splExpiryManuallyEdited`/`licenseExpiryManuallyEdited` reused it verbatim for SPL/CPL Expiry Date.
- **A nav link (`Sidebar.tsx`'s `NAV_ITEMS`) is a separate, hand-synced layer from actual access control** — a new role needs both the page-level `RoleGate`/`requireRole()` check AND the nav item's `roles` array updated.
- **A new page that reports/exports over already-collected data (like session 4's Breath Analysis Report) can often reuse an existing API route's filtering (here, `GET /api/ba-tests`'s pre-existing `from`/`to` support) with zero backend changes** — worth checking what an existing endpoint already supports before assuming a new route is needed.
- **When a user asks to "rename X to Y" in one specific place (e.g. a Reports-section card title), check whether X is used elsewhere too (e.g. a sidebar link, a page's own header) before assuming the rename applies everywhere** — session 4's "Breath Analysis Report" rename was scoped to the Reports card and a new page only; the register page kept its own "Breath Analyser Register" title since that wasn't in scope.
- **A read-only `information_schema` verification script is a fast, safe way to confirm a batch of "was this SQL run?" questions without re-running anything** — session 5's `verify-four-pending-migrations.sql` checked 8 columns/tables across 4 migrations in one paste-and-run, avoiding any risk of re-running DDL that might not be perfectly idempotent in some edge case. Worth reaching for this pattern any time multiple migrations' run-status is in question at once, rather than asking the user to check each individually or re-running them "just in case."
- **A single generic whitelisted config route (`app/api/admin/config/[table]/route.ts`) beats N near-identical bespoke route files** when several tables need the identical shape of fix (server-side role check + column whitelist) — one file to keep correct instead of N drifting copies. Add a new table by adding one entry to the `TABLES` map, not a new route file.
- **Before securing a client-side write, check whether a secured route already exists for that resource** — session 7's `AircraftSetupTab.tsx` fix reused the pre-existing `/api/aircraft` route rather than duplicating it.
- **A shared `useEscapeToClose(onClose)` hook (`lib/useEscapeToClose.ts`) exists for keyboard-dismissible modals** — call it as the first line of any new modal component's body, passing the same `onClose` prop it already receives. For a modal with inline state instead of an `onClose` prop, pass a closure that clears the relevant state.
- **When investigating a scoped security fix, grep for sibling write paths into the same tables before considering the fix complete** — session 7 found two more client-side writes into `ground_school_enrollment`/`training_requirements` beyond the one flagged in the original review; deliberately deferred rather than scope-creeping the round, but disclosed explicitly (see outstanding item 39).
- **A "needs visual verification, can't fix blind in a sandbox" finding is not always actually blocked on a browser** — check first whether the app already has a theme/design-token system (CSS custom properties + semantic utility classes) that other, correctly-themed components already use. If so, a hardcoded-dark-classes bug is often a pure grep-and-swap against that existing pattern, verifiable via `tsc`/lint alone, with the visual check reduced to a final confirming spot-check rather than a blocking prerequisite. Confirmed 2026-08-25 (third round) — the "4 modals hardcoded dark Tailwind classes" finding, sitting On Hold since session 7, was fixed this way without ever needing a screenshot or deployed URL.
- **Parallel subagents are effective for a mechanical, well-specified fix repeated across several independent files** — five files with the identical dark-Tailwind-classes bug were fixed by five parallel agents given the same token-system reference and conversion rule set, then centrally re-verified (repo-wide grep for leftover hardcoded classes + whole-repo `tsc` + targeted lint with each flagged line manually checked against the diff) rather than trusting each agent's self-reported summary alone.
- **⚠️ NEW (2026-08-25, fourth round): this sandbox's working directory can be subject to concurrent `git stash`/`stash pop` operations from another process/session sharing the same environment, which can silently revert in-progress or just-completed edits — AFTER an agent's own tsc/eslint self-verification has already passed clean.** Confirmed concretely: 2 of 7 parallel agents in the no-explicit-any/exhaustive-deps cleanup round had their fixes reverted mid-task by exactly this, and their own "verification passed" self-reports did not catch it (the revert happened after their check ran). **Practical rule going forward: never trust a single subagent's self-reported verification as proof of final repo state in this sandbox.** After ANY batch of parallel-agent file edits, run one independent, centralized full-repo `tsc --noEmit` + `npm run lint` pass AFTER all agents have completed, before considering the round done. If that pass finds a regression versus what was expected, re-apply the missing fix directly (Read + Edit + immediate per-file verification) rather than re-delegating to another agent — re-delegating risks hitting the exact same race a second time.
- **⚠️ NEW (2026-08-25): `Date.prototype.toISOString()` silently shifts a local-midnight date one calendar day earlier in any timezone AHEAD of UTC — including IST (UTC+5:30), this FTO's own timezone.** `new Date(dateStr + 'T00:00:00')` constructs a LOCAL-time Date; calling `.toISOString()` on it converts to UTC first, and for a positive UTC offset, local midnight is still "yesterday" in UTC. This bit the SPL/CPL Issue-Date-plus-10-years auto-fill (`addYears()`, duplicated in `StudentFormModal.tsx` and `InstructorFormModal.tsx`) — confirmed by the team's first real test finding, see the top section of this doc. **Any date-math helper anywhere in this codebase that builds a date string via `.toISOString().split('T')[0]` after constructing a Date from a bare `'YYYY-MM-DD'` string is suspect and should be checked** — the safe pattern is to read the target date back out via its own local-time fields (`getFullYear()`/`getMonth()`/`getDate()`), never round-tripping through `toISOString()` for a date that was never meant to carry a timezone at all.
- **NEW (2026-08-25): this app's license/certificate "validity period" business rule is "N years/months, INCLUSIVE of the issue date"** — an issue date of 30-08-2026 with a 10-year validity expires 29-08-2036, not 30-08-2036. Confirmed explicitly by the user for SPL/CPL, and applied consistently to the new Medical Issue Date feature too. Any future "issue date + duration" auto-fill in this app should subtract one day after adding the duration, same as `addYears()`/`addMonths()` in `StudentFormModal.tsx`/`InstructorFormModal.tsx` — don't assume a fresh feature request wants the naive (non-inclusive) calculation.
- **NEW (2026-08-25): don't assume a validity/expiry duration is a flat number without checking — some are age-based.** The DGCA medical certificate rule is NOT a flat duration like SPL/CPL's 10 years: it depends on the pilot's age at issue (Class 1, the rule that applies here: 12 months under 40, 6 months 40 or older). Investigated via web search before building anything (multiple aviation-school blog sources gave conflicting numbers — reported the discrepancy to the user rather than picking one silently) and confirmed the exact rule with the user directly before writing any code, since a wrong compliance-facing expiry date is a real-world safety/regulatory issue, not just a display bug. `ageAtDate()` in `StudentFormModal.tsx` computes age-at-a-given-date correctly at the exact-birthday boundary (someone turning 40 ON the issue date gets the 6-month tier, not the 12-month one) — worth reusing this pattern if another age-gated rule comes up.
- **NEW (2026-08-25): a field can exist all the way through a form's state, the save handler, the API route, and the store's row mapper — and still have NO actual `<input>` in the JSX.** `dateOfBirth` on `StudentRecord` was fully wired end-to-end but had never had a visible form field in `StudentFormModal.tsx`, meaning it was silently uncollectable via the UI this whole time (discovered only because a new feature needed it). When building on top of an existing field, don't assume "it's in the type/API/store" means "a user can actually set it" — check the form JSX directly.
