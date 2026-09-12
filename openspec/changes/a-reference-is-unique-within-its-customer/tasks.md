# Tasks

- [x] Hold the reference unique within its customer where it cannot be bypassed, and refuse a create that collides by naming the case holding it
- [x] Refuse an archive read whose reference is already held, naming the case, in the importer that writes the case row itself
- [x] Demonstrate the scenarios: a collision within one customer, one reference across two customers, any number of cases awaiting a reference, and a refusal that names the holder
- [ ] Fold this delta into `openspec/specs/case-archive/spec.md` and archive the change, before the merge
