# OWASP ASVS 5.0 Level 2

Mapped against `asvs-5.0.0.csv`, the requirement list as published, read rather than recalled. Chapters covered are the ones the written specifications bear on: V2 Validation and Business Logic, V4 API and Web Service, V6 Authentication, V7 Session Management, V8 Authorization, V10 OAuth and OIDC, V12 Secure Communication, V13 Configuration, V16 Security Logging. The rest are untouched because no specification yet reaches them.

**A row cites a requirement exactly**, as `capability :: Requirement title`, so that renaming a requirement breaks the row rather than quietly orphaning it. `tests/docs/test_openspec_consistency.py` holds that true.

## Answered

| Controls | What they ask | Answered by |
| --- | --- | --- |
| V8.2.1, V8.2.2 | Function-level and data-specific access restricted to explicit permissions | accounts-and-access :: Case data is reached through groups, at a level |
| V8.3.1 | Authorization enforced at a trusted service layer | accounts-and-access :: Managing the install and reaching case data are separate grants |
| V6.2.2, V6.2.3 | Users can change their password; a change requires the current one | accounts-and-access :: Authentication resists guessing, and says so to the auditor |
| V6.3.1 | Controls against credential stuffing and brute force | accounts-and-access :: Authentication resists guessing, and says so to the auditor |
| V6.3.2 | No default accounts present or enabled | accounts-and-access :: An account is provisioned, never self-created |
| V6.3.3 | Multi-factor, or a combination of single factors | accounts-and-access :: A second factor is available, and enforcing it is the install's policy |
| V6.4.1 | System-generated initial secrets are securely random | accounts-and-access :: An install can be recovered without another administrator |
| V6.4.2 | No password hints or knowledge-based authentication | accounts-and-access :: An install can be recovered without another administrator |
| V6.4.4 | A lost factor requires proofing at enrolment level | accounts-and-access :: A second factor is available, and enforcing it is the install's policy |
| V7.2.4 | A new session token on authentication; the old one ended | accounts-and-access :: A session belongs to its holder and ends when it should |
| V7.3.1, V7.3.2 | An inactivity timeout and an absolute maximum lifetime | accounts-and-access :: A session belongs to its holder and ends when it should |
| V7.4.1, V7.4.5 | Termination disallows further use; administrators can end one session or all | accounts-and-access :: A session belongs to its holder and ends when it should |
| V7.4.2 | All sessions ended when an account is disabled | accounts-and-access :: An install can federate its sign-in to the organisation's identity provider |
| V7.5.2 | A user can see and end their own sessions | accounts-and-access :: A session belongs to its holder and ends when it should |
| V7.6.1 | Session lifetime between relying party and provider behaves as documented | accounts-and-access :: An install can federate its sign-in to the organisation's identity provider |
| V10.4.2, V10.4.4 | An authorization code used once; a client allowed only the grants it needs | accounts-and-access :: An install can federate its sign-in to the organisation's identity provider |
| V8.4.1 | Cross-tenant controls, so one tenant's operations never affect another | cases :: Reaching a case is decided in one place, by customer |
| V8.2.2 | Data-specific access restricted to explicit permissions | customers :: A customer cannot be removed out from under its cases |
| V8.1.2, V8.2.3 | Field-level access restricted to explicit permissions, read and write | the-api :: Reach is enforced where the data is, not where the request arrives |
| V8.4.1 | Cross-tenant controls, so one tenant's operations never affect another | the-api :: A fact can be asked for across cases |
| V8.2.2 | Data-specific access restricted to explicit permissions | collections :: A reference points inside its own case, and the store alone cannot enforce it |
| V2.3.1 | Business logic flows processed only in the expected sequential order | report :: A correction is a new report, not an edit |
| V2.3.3 | Transactions used so a business logic operation completes or does not | report :: Sending stamps and preserves in one act |
| V2.2.1, V2.2.2 | Input validated to business expectations, enforced at a trusted service layer | collections :: A row is checked against its description, where the caller cannot reach |
| V2.3.3 | Transactions used so a business logic operation completes or does not | collections :: Every write is attributed, checked and announced as one act |
| V2.1.2, V2.2.3 | Logical and contextual consistency of combined data items, checked against expectations | compliance :: The answer has three values, and not knowing is one of them |
| V2.1.3 | Business logic limits and validations documented | compliance :: A threshold is quoted, never chosen |
| V4.4.2 | The Origin header checked during the connection handshake | live :: A connection is admitted by its own checks, and their absence is silent |
| V4.4.1 | Connections carried over a protected transport | live :: The connection dies with the reach that admitted it |
| V8.2.2 | Data-specific access restricted to explicit permissions | state :: The application cannot reach a row it should not, even by mistake |
| V13.3.2 | Access to secret assets follows least privilege | state :: Changing the shape of the store is a separate power |
| V12.2.1 | Protected transport for all connectivity between a client and an externally facing service | deployment :: The connection is protected, and there is no way to turn that off |
| V13.3.2 | Access to secret assets follows least privilege | deployment :: The application runs with no more than it needs |
| V2.4.1 | Anti-automation against excessive calls to application functions | the-api :: What a request costs is bounded before it runs |
| V4.3.1 | Depth, amount or cost analysis against query and data-layer expression denial of service | the-api :: What a request costs is bounded before it runs |
| V16.5.1 | A generic message on error, exposing nothing sensitive | the-api :: A refusal says which of the caller's problems it is |
| V8.2.1 | Function-level access restricted to consumers with explicit permissions | reference :: The door behind a session describes this install |
| V8.2.2 | Data-specific access restricted to explicit permissions | reference :: Configuration naming a customer is scoped to that customer |
| V16.2.1 | Each entry carries when, where, who, what | accounts-and-access :: Administrative events are logged |
| V16.3.1 | All authentication operations logged, successful and failed | accounts-and-access :: Administrative events are logged |
| V16.3.2 | Failed authorization attempts logged | accounts-and-access :: Administrative events are logged |
| V16.4.2 | Logs protected from unauthorised access and unmodifiable | accounts-and-access :: Administrative events are logged |
| V16.5.2, V16.5.3 | Operating securely when an external resource fails, and failing without falling open | accounts-and-access :: Administrative events are logged |

## Gaps this mapping found

A control at Level 2 that no written requirement answers. Not deviations — unfinished specification.

| Controls | What they ask | Where it belongs |
| --- | --- | --- |
| V7.4.3 | The option to end other sessions after changing an authentication factor | accounts-and-access |
| V6.2.4, V6.2.12 | Passwords checked against breached and context-specific word lists | accounts-and-access, and it needs a local list, since the core makes no outbound request |
| V6.2.10 | A password stays valid until compromised or rotated; no periodic expiry | accounts-and-access, where an install setting could contradict it |
| V6.5.5 | A defined lifetime for time-based codes | accounts-and-access |
| V6.5.2, V6.5.3 | Recovery-code entropy, and generation from a cryptographic source | accounts-and-access |
| V16.2.2 | Synchronised time sources; UTC or an explicit offset | nowhere yet |
| V16.4.3 | Logs transmitted to a logically separate system | nowhere yet. Interacts with Article V: the operator's own destination is theirs to choose |
| V16.1.1 | An inventory of what is logged at each layer | nowhere yet |
| V12.3.3, V12.3.4 | Protected transport between internal components, on trusted certificates | deployment. Traffic between the parts of an install crosses a boundary the operator owns and nothing else shares, and the specification does not say whether that is enough |
| V6.1.1, V6.1.3, V7.1.1, V7.1.2, V8.1.1 | The documentation these controls require | these specifications are that documentation, and this matrix is how it is found |
| V10.4.1, V10.4.3, V10.4.6, V10.4.8, V10.4.10 | Redirect allowlist, short-lived codes, proof key for code exchange, refresh expiry, client authentication | accounts-and-access, where federation is written as behaviour and not yet as protocol |

## Deviations

Held in the constitution's deviation register rather than here: cross-case reach, administrator self-grant, the second-factor policy defaulting off (V6.3.3), data classification (V14.1.1, V14.1.2), and the self-signed certificate (V12.2.2).

## Grounded elsewhere

**ASVS Level 1 and Level 2 carry no backup or recovery control.** `state :: What is stored can be recovered, and the recovery is proven` answers ISO/IEC 27002 rather than this standard, and searching for it here returns nothing — recorded so the absence reads as checked rather than missed.

## Not applicable

V4.4.3 and V4.4.4, dedicated connection tokens. Both are conditional on the application's standard session management not being usable over a connection. It is usable here — the same session admits a connection as admits a request — so a second credential would be a second thing to revoke, and its absence is the correct answer rather than a gap.

V17 WebRTC. V1 Encoding and V5 File Handling bear on specifications not yet written; they are absent rather than excluded.
