# Tasks

## 1. The boundary

- [x] 1.1 Substitute at the point where a request leaves the client, so refusal mapping and wire conversion stay shared
- [x] 1.2 Refuse by default, and refuse anything not deliberately included
- [x] 1.3 Keep the evaluation build out of an install's bundle

## 2. Judging a draft

- [x] 2.1 Parse a write with the rules the install enforces, rather than a copy of them
- [x] 2.2 Refuse in the shape the client already draws, naming fields

## 3. The visitor's state

- [x] 3.1 Keep the case per-visitor and surviving a reload
- [x] 3.2 Give the visitor a way back to the case as published
- [ ] 3.3 Show which build is being looked at, so a stale one is legible

## 4. What the build must answer

- [x] 4.1 Serve the case, its collections and the reads a case screen makes
- [ ] 4.2 Derive what an install would compute from the application, at build time
- [ ] 4.3 Give a real absent state to what cannot go through the request boundary

## 5. Keeping it honest

- [x] 5.1 Check what the build serves against what the client asks for
- [ ] 5.2 Publish only from a tree that has passed every tier
