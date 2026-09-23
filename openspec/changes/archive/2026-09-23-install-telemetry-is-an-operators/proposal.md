# What the install is made of is an operator's to read

## Why

*Managing the install and reaching case data are separate grants* enumerates the management plane as accounts, groups and their memberships, which customers exist, federation, retention, and the install's own settings. It does not name what the install is **made of** — how large the database is, how many rows each table holds, how many connections are open, what the host has left.

Two routes serve exactly that, and nothing gated them:

```
$ grep -rn "AdminOnly\|Roles(" server/src/health/
(no matches)
```

`GET /api/health/activity` runs `pg_stat` for every table's live row count and total relation size; `GET /api/health/resources` reports host memory, CPU, load average and free disk. Every other System pane's controller carries `@AdminOnly()`.

The row count is what settles it rather than the disk figure. `GET /api/accounts` is refused to an analyst because who may sign in is the management plane — and a per-table row count answers how many accounts exist to anybody who can reach it. A boundary that one route enforces and the table beside it reports around is not a boundary.

**The silence was load-bearing elsewhere.** The picker stopped offering an analyst the three System panes whose every route refuses them and deliberately kept Health, on the stated grounds that its routes are open. So the rail was advertising install telemetry to precisely the accounts that should not have it, and the reasoning was sound given what the code said.

## What Changes

- `accounts-and-access` states that what the install is made of is management-plane, reachable by an administrator alone: its size, its shape, and the resources of the host it runs on.
- The liveness probe stays open and is named as the exception, because a probe that needs a session cannot answer whether the application can serve one.
- No change to what the data plane is, and none to how a grant is made. This says which plane a fact belongs to, not who may hold a plane.

## Impact

An analyst opening the Health pane meets a refusal, and the rail no longer offers it — the same shape the three other System panes already have. An operator sees no change.

Nothing an analyst needs to work a case moves: this is the shape of the installation, never what an incident holds.
