# Tasks

## 1. The freeze is the store's

- [x] 1.1 Refuse every write to a sent report and its parts in the store, and verify with `server/src/report/the-store-refuses-a-sent-report.test.ts`
- [x] 1.2 Apply the store's rules after every schema push, and verify with `server/src/db/every-push-applies-the-store-guards.test.ts`
- [x] 1.3 Answer the store's refusal as the one 409 every door gives, and verify with `server/test/a-sent-report-refuses-every-door.test.ts`
- [x] 1.4 Stamp an imported or demonstration report last, and verify with the archive round trip and the demo sender's tests

## 2. A send is one checked act

- [x] 2.1 Stamp under a lock after checking what the document drew from, and verify with `server/test/send-and-part-writes-are-serialised.test.ts`
- [x] 2.2 Hold prose still while a send decides and refuse it after the stamp, and verify with `server/test/a-sent-report-takes-no-prose.test.ts`
- [x] 2.3 Record a send, a correction and a restore in the act that makes them, and verify with `server/test/every-report-act-is-in-the-feed.test.ts`
- [x] 2.4 Restore under a lock, and verify with `server/test/two-restores-restore-once.test.ts`
