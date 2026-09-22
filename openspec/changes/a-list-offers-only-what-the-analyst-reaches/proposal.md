# A list offers only the cases the analyst reaches

## Why

The requirement says an administrator who has granted themselves no data access reaches no such customer's cases. Two routes that name cases without naming one case answer otherwise:

```
$ sed -n '150,152p' server/src/cases/cases.service.ts
  list(): Promise<CaseRow[]> { return this.db.select().from(cases).orderBy(desc(cases.updatedAt)) }
$ grep -rn customersReachedBy server/src --include='*.ts' | grep -v test
server/src/access/reach.service.ts:306:  async customersReachedBy(userId: string): Promise<string[]> {
```

The helper that answers which customers somebody reaches has no caller outside the tests, `GET /api/cases` hands every case in the install to every signed-in analyst, and `GET /api/recent-cases` joins visits to cases on the analyst's id alone -- so a case keeps being named after the membership that reached it is revoked, and a pinned one never ages out.

Every scenario under the requirement asks for one case by id, which is the shape `CaseAccessGuard` covers. A route that names no case mounts no guard, so the requirement was met everywhere it was demonstrated and unmet everywhere else.

## What Changes

- A list that names cases rather than one case offers only the cases the analyst reaches, by the same rule that decides one case.
- A case the install has attributed to nobody stays offered to everybody, which the default customer's floor already says.

## Impact

- `openspec/specs/accounts-and-access/spec.md` -- one requirement added. Every scenario the capability already carries asks for one case by name, which is the shape the guard covers, so the routes that name no case were demonstrated by nothing.
- `server/src/cases/cases.service.ts`, `server/src/recent/recent.service.ts` -- both lists filter by reach.
- `server/src/access/reached-cases.ts` -- the fold both ask, shared so the two lists cannot disagree with the guard.
- An analyst in no group sees the default customer's cases in the picker and the recent rail, and nothing else.
