# Scope

**Only a caller's own endings move, signing out included.** An administrator ending an account's sessions is recorded as that act, ahead of it, whether or not a session was live.

# Design

## An ending is recorded where the session is deleted

A caller's own ending is recorded at the point every session deletion passes through, which runs only for a session that existed, and writes one line per session with the account as both the actor and the subject. The operation's answer is not evidence: it is the same whether the request named one of the caller's sessions, somebody else's, or nothing.
