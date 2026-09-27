# Tasks

## 1. The store and the server survive a restart

- [x] 1.1 Start the store as its own user with no capability, in the shipped and the development stack
- [x] 1.2 Keep the process alive when a store ends an idle connection
- [x] 1.3 Start again any long-lived component that stops unasked
- [x] 1.4 Take the health answer out of every limit counted in the ephemeral store
- [x] 1.5 Let the edge find a server that came back at another address

## 2. Preparation runs once, in one act

- [x] 2.1 One schema step in one transaction that changes nothing on an unchanged store and refuses loss, with no prompt
- [x] 2.2 Route every caller through it and delete the second doors
- [x] 2.3 Run no package manager in any service, and no package repository check in the edge's start
- [x] 2.4 Write demonstration content once, on an unclaimed install
- [x] 2.5 Write a built-in only when it changed

## 3. A copy is taken, checked and returned to

- [x] 3.1 A backup command against the shipped stack: take, check, restore
- [x] 3.2 Say in the README how

## 4. The lifecycle is demonstrated on the shipped stack

- [x] 4.1 A tier driving the shipped `compose.yaml` through every phase, with an egress capture
- [x] 4.2 Run it in the merge queue, required by the gate
- [x] 4.3 Correct the ledger rows the static tests claimed

## 5. Left open

- [ ] 5.1 How a release crosses a change that would lose stored data (#1086): refused here; generated migrations come later.
- [ ] 5.2 A true daemon restart is approximated by an unordered start; it cannot be done in CI without taking the runner with it.
