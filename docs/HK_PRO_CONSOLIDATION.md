# HK Pro Consolidation — Housekeeping Onboarding Donor Map

Status: canonical donor specification for `hk-pro`
Source audited: `aemmykun/housekeeping-onboarding-system` @ main
Target baseline: `aemmykun/arty_pro` / branch `hk-pro`

## 1. Source-state constraint

At the time of this consolidation, `arty_pro/main`, `arty-app-pro`, and `hk-pro` all point to the same secure Firebase MVP baseline commit. The real Replit HK Pro and Arty App Pro application code has not yet been imported into those branches.

Therefore this document defines what may be carried forward from `housekeeping-onboarding-system`, what must be rewritten, and what must be rejected. It is not evidence that the donor code has already been merged.

## 2. Decision matrix

| Donor capability | Decision | Reason / target treatment |
|---|---|---|
| Checkout -> dirty room -> auto-clean task | KEEP | Strong operational workflow. Reimplement atomically/idempotently in HK Pro. |
| Room status lifecycle | ADAPT | Keep operational states, align to HK Pro service/inspection semantics. |
| Task start/completion timestamps | KEEP | Required for TAT/labour metrics. Enforce assignment authority. |
| Task assignment/reassignment | ADAPT | Keep UX, add tenant/property scope and role authority. |
| Manager/front-desk/housekeeper role navigation | ADAPT | Useful UX only; backend remains authoritative. Align to HK/SV/MGR/ADMIN canonical roles. |
| Shift scheduler UI | ADAPT | Keep calendar interaction. Replace simple shift model with capacity/availability/workload rules. |
| Staff performance cards | ADAPT | Keep presentation; normalize by service type/minutes, not raw task count alone. |
| 7-day room/booking calendar | ADAPT | Keep visualization; remove unnecessary guest PII for HK users. |
| Booking/check-in/checkout prototype | ADAPT | Useful PMS simulation only. Do not make HK Pro the source-of-truth PMS. |
| Training modules/gamification | REJECT from HK core | Separate product concern; do not couple to operational runtime. |
| AR/VR claims | REJECT | Not substantiated by current implementation. |
| Socket.IO/realtime claim | REPLACE | Current code polls; HK Pro should use the target realtime mechanism intentionally. |
| Public self-registration | REJECT | Privilege-escalation risk. Use controlled invitation/provisioning. |
| Client-supplied role | REJECT | Authority must be server-derived. |
| JWT fallback secret | REJECT | Fail startup when secrets are absent. |
| localStorage bearer-token posture | REPLACE | Use the target Firebase Auth/session model. |
| MongoDB global data model | REPLACE | No tenant/property boundary. Use HK Pro tenant-scoped canonical storage. |
| Global unique roomNumber | REPLACE | Uniqueness must be tenant/property scoped. |
| Guest phone exposure to generic authenticated users | REJECT | Least-privilege projection by role. |
| Non-transactional checkout multi-write | REPLACE | Use atomic/idempotent workflow with audit evidence. |
| Non-transactional task completion room update | REPLACE | Same requirement. |
| Current tests/docs claiming completeness | REJECT as proof | Test tooling exists but automated proof is insufficient. |

## 3. Canonical HK Pro operational chain

```text
PMS event / authorised manual action
        |
        v
Resolve tenant + property + user role
        |
        v
Create/update room service state
        |
        +--> Departure -> DIRTY -> cleaning task
        +--> Stayover  -> DAILY SERVICE task
        +--> Arrival   -> readiness/priority context
        +--> DND       -> blocked/deferred handling
        +--> Maintenance -> maintenance workflow
        |
        v
Task assignment
        |
        v
Assigned staff START
        |
        v
IN_PROGRESS + started_at
        |
        v
Staff COMPLETE
        |
        v
CLEAN / inspection-required
        |
        v
Supervisor inspection (where policy requires)
        |
        +--> PASS -> READY/INSPECTED
        +--> FAIL -> REWORK task
        |
        v
Audit/event evidence + KPI update
```

## 4. Authority model

Do not inherit donor role self-selection.

Target roles:

```text
HK    housekeeper
SV    supervisor
MGR   manager
ADMIN tenant administrator
```

Minimum enforcement:

- identity from verified authentication context;
- tenant identifier from trusted auth/server context, never request body;
- property scope resolved server-side;
- HK can read/update only assigned operational work within scope;
- SV can view team/unassigned work within authorised property scope;
- MGR can manage operational configuration and reporting within scope;
- ADMIN controls tenant administration;
- no role or tenant mutation through public registration.

## 5. Minimum scoped data model

Every operational record must carry or derive an enforceable tenant/property boundary.

### User assignment

```text
user_id
tenant_id
property_id
role
active
effective_from
effective_to
```

### Room

```text
room_id
tenant_id
property_id
room_number
floor
room_type
room_status
service_state
assigned_staff_id?
current_stay_ref?
last_cleaned_at?
out_of_order
updated_at
```

Required uniqueness:

```text
unique(tenant_id, property_id, room_number)
```

### Task

```text
task_id
tenant_id
property_id
room_id
service_type
task_type
status
priority
assigned_to?
created_by
started_at?
completed_at?
due_at?
inspection_required
source_event_id?
created_at
updated_at
```

### Inspection

```text
inspection_id
tenant_id
property_id
room_id
task_id
inspector_id
result        PASS | FAIL
score?
findings[]
evidence_refs[]
inspected_at
rework_task_id?
```

### Shift / availability

The donor Shift model is insufficient. Canonical planning must support:

```text
staff_id
tenant_id
property_id
date
availability
shift_start
shift_end
role
skills
capacity_minutes
assigned_minutes
support_role?
```

## 6. Donor workflows to preserve

### A. Checkout automation

Preserve the business idea:

```text
checkout
 -> room dirty
 -> current stay cleared
 -> departure clean task created
```

But execute as one governed/idempotent operation. A partial state such as “checked out but no cleaning task” must not be silently accepted.

### B. Start task

Preserve:

```text
task pending -> in progress
started_at = now
room -> cleaning (for cleaning work)
```

Mandatory authority:

```text
assigned_to == authenticated user
OR role in authorised supervisor/manager set
```

The donor fails this invariant and must not be copied unchanged.

### C. Complete task

Preserve timestamps and room transition, but completion must be conditioned on the task type and inspection policy.

Cleaning completion should not automatically mean “guest-ready” where inspection is required.

### D. Staff performance

Preserve:
- completed task count;
- average turnaround;
- daily snapshot.

Add:
- service type;
- estimated minutes;
- actual minutes;
- rework rate;
- inspection pass rate;
- workload/capacity ratio.

Raw task count must not be the primary cross-staff performance metric.

### E. Calendar

Preserve the 7-day room visual concept.

HK-facing projection should use operational information, not broad reservation PII. Prefer:
- room;
- arrival/departure/stayover status;
- service due;
- readiness;
- timing constraints.

Do not expose guest phone by default.

## 7. Explicit rejects from donor

The following must never enter HK Pro unchanged:

1. public API accepting `role`;
2. self-created manager/admin accounts;
3. `JWT_SECRET || 'default-secret-key'`;
4. unscoped `Room.find()`, `Booking.find()`, `User.find()`, or global aggregates;
5. globally unique room numbers;
6. any-authenticated-user access to broad room/guest details;
7. arbitrary authenticated task start;
8. multi-record workflow changes without atomicity/idempotency;
9. committed credentials or secret-bearing documentation;
10. documentation claims used as release proof;
11. AR/VR and realtime marketing claims without implemented evidence.

## 8. P0/P1 acceptance gates before donor logic can be considered merged

### P0
- [ ] public registration cannot select operational role;
- [ ] no known/default signing secret;
- [ ] tenant + property boundary enforced for User/Room/Task/Shift/Inspection;
- [ ] no cross-property/global list queries on operational data;
- [ ] leaked historical credential removed from current tree and Git history, credential rotated;
- [ ] task start enforces assignment/privileged authority.

### P1
- [ ] guest PII projections are role-minimized;
- [ ] checkout workflow is atomic or idempotently recoverable;
- [ ] task completion and room state cannot diverge silently;
- [ ] automated tests cover tenant isolation, role denial, task authority, checkout creation, inspection/rework;
- [ ] CI runs build + tests + secret scan;
- [ ] health/readiness differentiates app liveness from database readiness;
- [ ] production errors do not return stack traces.

## 9. Reuse priority

When the real HK Pro app is imported into this branch, compare in this order:

1. existing HK Pro checkout/task lifecycle vs donor;
2. existing room state model vs donor;
3. existing task assignment UX vs donor;
4. roster/scheduler UX vs donor;
5. performance dashboard vs donor;
6. booking calendar vs donor;
7. training/gamification only if explicitly retained as a separate module.

Do not import donor authentication, MongoDB models, or role registration code as a shortcut.

## 10. Final disposition

`housekeeping-onboarding-system` is classified as:

**WORKFLOW DONOR — NOT SECURITY OR DATA-ISOLATION BASELINE**

Canonical source responsibilities:

- `arty_pro` / HK Pro target: identity, tenant isolation, RBAC, privacy, production controls;
- `housekeeping-onboarding-system`: operational workflow and UI patterns only;
- future real HK Pro branch content: product implementation to compare against this donor map.
