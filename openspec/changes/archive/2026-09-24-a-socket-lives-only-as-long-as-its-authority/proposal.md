# A socket lives only as long as its authority

## Why

The case socket checked the session and the hold once, at the upgrade (#1162). An open connection then kept writing after the session's window closed, after an administrator reset and held the account, and after the account was deleted; ending one session ended the analyst's connections everywhere; and a frame refused for its level wrote nothing to the audit.

## What Changes

- **live**: the requirement that a connection dies with the reach that admitted it states each way authority ends, including while the connection is silent, scopes an ending to the session that ended, and requires a refusal over a connection to be recorded as a request's is.

## Impact

- Every frame, and a sweep of silent connections, asks the questions the upgrade asked of the same session.
- A closed connection says which way its authority ended.
