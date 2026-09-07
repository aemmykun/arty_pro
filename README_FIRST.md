# ArtyApp Pro — Secure Firebase MVP

This package is the corrected Firebase MVP baseline for ArtyApp Pro.

## What was fixed

- Firestore rules are no longer open to every logged-in user.
- `tenant_id` is resolved from Firebase Auth custom claims, not trusted from the frontend.
- Manager routes require role checks.
- Task status updates verify tenant scope before writing.
- PMS adapter no longer logs API keys.
- Request validation added with `zod`.
- RMSCloud adapter placeholder added beside Opera and Mews.
- Emulator config added.

## Required Firebase custom claims

Each user must have custom claims like this:

```json
{
  "tenant_id": "hotel_A",
  "role": "HK"
}
```

Supported roles:

```text
HK     = housekeeper
SV     = supervisor
MGR    = manager
ADMIN  = tenant admin
```

## Setup

```bash
cd functions
npm install
npm run build
```

From the project root:

```bash
firebase emulators:start
```

Deploy:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes,hosting
```

## Example Firestore data

Collection: `tasks`

```json
{
  "tenant_id": "hotel_A",
  "roomNumber": "1201",
  "status": "DIRTY",
  "assigned_to": "firebase_user_uid",
  "created_at": "server timestamp",
  "updated_at": "server timestamp"
}
```

Collection: `hotel_settings`

Document ID: `hotel_A`

```json
{
  "pms_adapter": "rmscloud",
  "pms_key": "STORE_THIS_IN_SECRET_MANAGER_FOR_PRODUCTION"
}
```

## Production note

For real production, do not store PMS API keys directly in Firestore. Use Google Secret Manager or Firebase Functions environment secrets.
