# Tasks

## 1. Accepted words are kept

- [x] 1.1 Every save runs as one identity that stores only the accepted record's words, in its own case, with the feed rows and audit lines it owes
- [x] 1.2 The identity is provisioned wherever the other roles are, and the serving process refuses to start without it
- [x] 1.5 A word's first acceptance since the last store is recorded under its writer's reach, and the identity stores and names only what was accepted
- [x] 1.6 The seeder exits, non-zero where it fails, rather than holding its connections open
- [x] 1.3 A save's audit lines are written in the act that stores it
- [x] 1.4 Stopping the application ends its connections first and waits for saves under way

## 2. Announcements

- [x] 2.1 An announcement carries what moved and nothing about who moved it
