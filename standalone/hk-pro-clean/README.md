# HK Pro Clean Domain Prototype

This is a **fresh standalone implementation** created from operational concepts only.

It does **not** import, integrate, or depend on code from `housekeeping-onboarding-system` or the existing ArtyApp Pro Firebase functions.

## Purpose

Prove a cleaner housekeeping core before choosing an application stack.

Implemented concepts:

- tenant + property scope on every operational record;
- fixed server-side role model: HK / SV / MGR / ADMIN;
- checkout -> dirty room -> departure clean task;
- idempotent checkout event detection;
- assigned-worker enforcement for task start/complete;
- supervisor/manager override;
- clean completion -> inspection required;
- inspection PASS -> inspected;
- inspection FAIL -> dirty + urgent rework task;
- pure domain logic suitable for unit testing.

## Deliberately not implemented

- Firebase;
- MongoDB;
- HTTP API;
- authentication provider;
- PMS integration;
- frontend;
- billing;
- realtime transport.

Those are integration concerns and are intentionally excluded from this package.

## Run

```bash
cd standalone/hk-pro-clean
npm install
npm run typecheck
npm test
```

## Design rule

The old application is treated only as a workflow reference. No donor authentication, MongoDB models, role registration, or unsafe authorization code is reused.
