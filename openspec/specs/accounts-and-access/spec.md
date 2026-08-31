# Accounts and access

## Purpose

Who can sign in, what they may reach and at what level, and how an install stays reachable by somebody legitimate. Reach over a customer is granted here, and what each level permits is settled here; what a case then does with that is the cases spec's.

## Requirements

### Requirement: An account is provisioned, never self-created

An install MUST NOT let somebody create their own account. An account exists because an administrator made it, and its holder's reach begins at nothing.

The first account is the exception, and MUST be creatable only while the install holds no accounts at all — not merely no administrator.

Claiming an install MUST require a bootstrap credential that only somebody with access to the machine can obtain. It MUST be issued to the install's own output at start, never over the network, and MUST be verifiable without revealing it to a caller who guesses. Reaching the service first MUST NOT be enough to become its administrator.

Whether an install is still claimable MUST be decided from what it holds when the claim is made, never from what was true when it started. Claiming MUST be atomic: two claims arriving together MUST produce one administrator.

#### Scenario: An install with no accounts is claimed

- GIVEN an install holding no accounts
- AND a bootstrap credential issued to its own output at start
- WHEN somebody presenting that credential claims it
- THEN they become its administrator

#### Scenario: Somebody reaches the service first

- GIVEN an unclaimed install reachable over the network
- WHEN somebody without the bootstrap credential attempts to claim it
- THEN it is refused
- AND the attempt is logged

#### Scenario: Two claims arrive together

- GIVEN an unclaimed install
- WHEN two valid claims arrive at the same moment
- THEN exactly one administrator exists afterwards

#### Scenario: The claim is attempted twice

- GIVEN an install that already has an administrator
- WHEN somebody attempts to claim it
- THEN it is refused
- AND the attempt is recorded

#### Scenario: A new account reaches nothing

- GIVEN an administrator creating an account
- WHEN it is created and put in no group
- THEN its holder can sign in
- AND reaches no customer's cases except the default customer

### Requirement: Managing the install and reaching case data are separate grants

Administering the install and reading a customer's cases are different powers and MUST be granted separately.

The **management plane** is the install itself: accounts, groups and their memberships, which customers exist and which group they sit in, federation, retention, and the install's own settings. The **data plane** is what a case holds: its entries, its evidence, its report, its compliance record.

Creating a group, deciding which customers it holds, and deciding who is in it at what level are management-plane acts and belong to an administrator alone.

Holding one MUST NOT imply holding the other. An administrator who has granted themselves no data access reaches no case's contents, and an analyst who reaches every customer's cases administers nothing.

An administrator can grant themselves data access, and that is deliberate. The power to manage groups is the power to join one, and no rule an administrator administers protects anybody from them.

**The product's answer to this is the record, not a restriction.** What is technically possible and what an organisation permits are different questions, and the second belongs to whoever runs the install: their screening, their separation of duty, their four-eyes rule, enforced by their own procedure. This application makes the act possible, makes it attributable, and makes it visible in a log the organisation can audit against its own controls. It MUST NOT build the approval workflow that organisation may or may not want.

#### Scenario: An administrator has granted themselves no data access

- GIVEN an administrator belonging to no group
- WHEN they request a case's contents
- THEN it is refused
- AND they may grant themselves the access and try again

#### Scenario: An analyst with wide data access administers nothing

- GIVEN an analyst reaching every customer through groups
- WHEN they attempt to create an account, a group, or a customer
- THEN it is refused

#### Scenario: An administrator grants themselves access

- GIVEN an administrator
- WHEN they add themselves to a group
- THEN they reach that group's customers at that membership's level
- AND the grant is logged naming them as both the grantor and the subject

### Requirement: Case data is reached through groups, at a level

A group holds customers. An analyst joins a group at a level, and that level is what they may do to the cases of every customer in it.

The levels are:

- **Read** — see the customer's cases and everything in them.
- **Read and write** — and change what a case holds, which includes removing entries, entities, evidence and report sections from it. Everything inside a case is the analyst's working material, and taking a wrong entry out is ordinary work rather than destruction.
- **Read, write and delete** — and destroy the case itself.

Delete is about the case as a whole and nothing smaller.

A customer MAY belong to more than one group and an analyst MAY belong to more than one. Where memberships overlap the most permissive applies. An analyst belonging to no group reaches no customer's cases beyond the default customer.

Membership and its level MUST be grantable and revocable one at a time, and a revocation MUST take effect for sessions already open rather than at their next sign-in.

**The default customer is the one exception in this specification, and it is stated here so that every other rule can be read without one.** Every analyst reaches it at read and write, regardless of groups, federation or mapping, and that MUST NOT be revocable.

It is not an inherited grant to somebody's data. The default customer holds only incidents whose origin is not yet known, which by definition are nobody's yet; the moment an incident is attributed to a real customer it leaves, and reach to it becomes that customer's business like any other. Wherever this specification says an analyst reaches no customer, the default customer is excepted.

#### Scenario: A group is built for a sector

- GIVEN a group holding a set of customers
- WHEN an administrator adds an analyst to it at read and write
- THEN that analyst reaches the cases of every customer in the group, and may change them
- AND reaches no customer outside it, save the default customer
- AND a customer added to the group later is reached without touching the analyst

#### Scenario: Two memberships disagree

- GIVEN a customer in two groups
- AND an analyst in one at read and the other at read and write
- WHEN they act on that customer's cases
- THEN they may write

#### Scenario: A level is reduced while the analyst is working

- GIVEN an analyst writing to a case
- WHEN their membership is reduced to read
- THEN further writes are refused
- AND what they have already written stands

#### Scenario: Reach is withdrawn while the analyst is working

- GIVEN an analyst with a case open
- WHEN the group that reached it is revoked, or the customer leaves it
- THEN they stop being served that case
- AND anything they had open on it stops updating

#### Scenario: An analyst removes something inside a case

- GIVEN an analyst at read and write
- WHEN they remove an entry, an entity, a piece of evidence or a report section
- THEN it is removed
- AND the removal is attributed like any other change

#### Scenario: An analyst attempts to delete the case itself

- GIVEN an analyst at read and write
- WHEN they attempt to delete the case
- THEN it is refused

#### Scenario: The default customer cannot be withheld

- GIVEN any analyst
- WHEN an administrator attempts to withhold the default customer from them
- THEN it is refused

### Requirement: An install always has somebody who can administer it

An install MUST NOT be able to reach a state where nobody can administer it. The last administrator MUST NOT be removable or demotable.

#### Scenario: The last administrator is removed

- GIVEN an install with one administrator
- WHEN somebody attempts to remove or demote them
- THEN it is refused
- AND they are told they are the last

### Requirement: An install can be recovered without another administrator

An install with one local administrator and no federation has no other way back. Nothing here sends a message, so no password is reset by email, and an administrator who forgets theirs or leaves the organisation takes the install with them. A locked account is the least likely reason this path is needed; a forgotten password is the likely one. Where an install federates, the provider answers a forgotten password for federated accounts — but never for the local administrator this specification requires it to keep.

A recovery credential MUST therefore exist, issued when the install is claimed, and it MUST be the only way back in that does not require somebody who is already an administrator.

A second administrator is the better answer and the system MUST say so: an install running on one administrator MUST be told it is one incident away from needing this credential.

The credential MUST be shown once, at the moment it is issued, and MUST NOT be retrievable afterwards. The install MUST hold only what is needed to verify it, never the credential itself.

It MUST reach one thing: restoring administrative access. It MUST NOT read a case, reach a customer's data, or serve as a session — the separation between managing the install and reaching case data holds here too, and holds most tightly here.

Every use MUST be logged, and so MUST every attempt that fails. An administrator MUST be able to issue a new credential, which MUST invalidate the one before it.

Restoring from a backup is the other way back, and belongs to the backup specification.

#### Scenario: The install is claimed

- GIVEN somebody claiming an install with no accounts
- WHEN they become its administrator
- THEN a recovery credential is issued and shown once
- AND they are told it cannot be shown again

#### Scenario: An install runs on a single administrator

- GIVEN an install with exactly one administrator
- WHEN that administrator uses the install
- THEN they are told a second administrator is the way to avoid needing recovery at all

#### Scenario: An administrator forgets their password

- GIVEN an install with more than one administrator
- WHEN one of them forgets their password
- THEN another administrator sets them a new one
- AND the recovery credential is not needed

#### Scenario: The last administrator is locked out

- GIVEN an install whose only administrator cannot sign in
- WHEN somebody presents the recovery credential
- THEN administrative access can be restored
- AND the use is logged

#### Scenario: The recovery credential is used to read a case

- GIVEN somebody holding the recovery credential
- WHEN they attempt to reach any case, customer or evidence
- THEN it is refused

#### Scenario: The credential is guessed at

- GIVEN somebody without the recovery credential
- WHEN they attempt it repeatedly
- THEN the attempts are refused, rate limited, and each is logged

#### Scenario: A new credential is issued

- GIVEN an install with a recovery credential
- WHEN an administrator issues a new one
- THEN the previous one no longer works
- AND the reissue is logged

#### Scenario: The credential is lost

- GIVEN an install whose recovery credential nobody holds
- WHEN an administrator issues a new one
- THEN the install has a working credential again
- AND the loss required no administrator to have been locked out

### Requirement: Authentication resists guessing, and says so to the auditor

This requirement governs local accounts. An account whose credentials belong to an identity provider is guarded there, and this install MUST NOT duplicate it.

Sign-in MUST resist repeated guessing. A local account MUST lock after a number of failures the install sets, for a duration the install sets, and the lock MUST be releasable by an administrator.

Local passwords MUST meet a policy the install sets. Where a password must be changed, the holder MUST be unable to reach anything else until they change it.

These controls exist to answer OWASP ASVS 5.0 Level 2, which the constitution names as the grounding.

#### Scenario: Repeated failures lock an account

- GIVEN an account
- WHEN sign-in fails more times than the install permits
- THEN the account is locked
- AND further correct credentials do not sign it in until the lock lifts

#### Scenario: A locked account reveals nothing

- GIVEN a locked account
- WHEN somebody attempts to sign in
- THEN the response does not distinguish a locked account from a wrong password

#### Scenario: An account must change its password

- GIVEN an account marked as needing a new password
- WHEN its holder requests anything other than changing it
- THEN they are refused

### Requirement: A second factor is available, and enforcing it is the install's policy

An account MUST be able to carry a second factor, and an analyst MUST be able to enrol one whether or not the install requires it.

Whether it is required is an install policy, and it is **off by default**. Requiring a second factor is an operational decision belonging to whoever runs the install: their risk, their users, their joiners and leavers. The product provides the mechanism and the record; it does not decide the policy.

Where the policy requires a second factor, an account without one MUST reach nothing but its own enrolment.

The install MUST be able to say plainly that not requiring one leaves it short of OWASP ASVS 5.0 Level 2, which is the level this application is designed against. It states the consequence; it does not act on it.

The second factor is a time-based one-time code from an authenticator the analyst holds. Enrolment MUST show the secret once, in a form both an authenticator application and a person can take, and MUST issue single-use recovery codes, shown once.

Spending a recovery code MUST be logged. An administrator MUST be able to reset an analyst's second factor, and that reset MUST be logged as an administrative event. Turning the policy on or off MUST be logged as an administrative event.

**Hardware-backed authentication is deliberately not the second factor here, and the reason is the deployment rather than the preference.** A passkey's relying party cannot be an IP address, and this application is reached at one; a browser refuses hardware-backed authentication where the certificate errors, and this application generates its own certificate on first start. Both are properties of a self-hosted install on a private network, not defects to be fixed. Where an organisation wants passkeys, the path is an identity provider that already does them, and this application federating to it.

#### Scenario: The policy is off

- GIVEN an install not requiring a second factor
- WHEN an analyst signs in with a correct password and no code
- THEN they are signed in

#### Scenario: An analyst enrols anyway

- GIVEN an install not requiring a second factor
- WHEN an analyst enrols one
- THEN their own sign-in requires it
- AND other analysts are unaffected

#### Scenario: The policy is turned on

- GIVEN an install where analysts have not enrolled
- WHEN an administrator requires a second factor
- THEN each of them must enrol before reaching anything else
- AND the policy change is logged

#### Scenario: A correct password is not enough

- GIVEN an enrolled account
- WHEN somebody signs in with the correct password and no code
- THEN they are not signed in

#### Scenario: An analyst loses their authenticator

- GIVEN an enrolled analyst who cannot produce a code
- WHEN they spend a recovery code
- THEN they are signed in
- AND that code cannot be spent again
- AND the use is logged

#### Scenario: An analyst has neither authenticator nor codes

- GIVEN an analyst who cannot produce a code and has no recovery codes left
- WHEN an administrator resets their second factor
- THEN they enrol again
- AND the reset is logged as an administrative event

#### Scenario: The install reports its own posture

- GIVEN an install not requiring a second factor
- WHEN somebody asks what the install's security posture is
- THEN it says that this leaves it short of the level the application is designed against

### Requirement: An install can federate its sign-in to the organisation's identity provider

An install MUST be able to hand authentication to the organisation's own identity provider over OpenID Connect, so that an analyst signs in the way they sign in to everything else, and the organisation's own conditional access, passkeys and joiner-mover-leaver process govern that.

Microsoft Entra ID is the provider this MUST work with. Nothing in the design may be specific to it.

**The call goes to the operator's own identity provider, not to anybody else's.** It is infrastructure the organisation already owns, already trusts and already defends, so it is inside the boundary the constitution draws rather than outside it. Federation is off by default, and an install with it off makes no outbound request at all.

The install MUST keep working — signing in locally — whenever federation does not work, for any reason. That is not only an unreachable network: a deleted application registration, an expired or rotated secret, withdrawn consent, a removed tenant and a misconfigured endpoint all answer promptly and still leave nobody able to sign in. A federation that returns an error is as broken as one that returns nothing.

This is not an operator setting. There is no configuration in which broken federation ends the install.

An identity provider that is unreachable, misconfigured or has removed the organisation's tenant MUST NOT be able to lock everybody out of an install holding live investigations.

An account is local or it is the provider's, never both. An account belonging to the provider holds no password here, enrols no second factor here, and cannot be locked out here — authentication is not this install's to perform, and holding a shadow credential for it would be a second way in that nobody manages.

An install MUST always keep at least one local administrator, whatever its federation setting. That account is what answers an unreachable provider, a misconfigured one, and a tenant that no longer exists.

An administrator MUST be able to map a group at the identity provider onto a group here, so that access follows the organisation's own joiner-mover-leaver process rather than being maintained twice.

A mapping is a local decision: it is made here, by an administrator, and logged as an administrative event. Reach MUST NOT appear because a claim arrived — it appears because somebody here mapped that claim, once. An analyst arriving with claims nobody mapped reaches no customer beyond the default one.

Reach gained or lost through a mapping MUST be attributable to the mapping that granted it, so an administrator asked why somebody reaches a customer can answer without reading the identity provider.

**Reach that came from a claim is only as fresh as the claim.** This install learns a provider group has changed when the analyst next presents claims — at sign-in, or when their session is revalidated against the provider. It MUST NOT be described as immediate.

The install MUST hold a **maximum staleness** for anything the provider decides, and MUST revalidate a federated session against the provider at least that often.

It defaults to **fifteen minutes** and MUST be settable between **five minutes and one hour**. Below five minutes the install questions the provider more often than a person can act on the answer; beyond an hour it exceeds the lifetime most providers give an access token, so the bound stops being the thing that governs and becomes a claim the install cannot keep.

It MUST be shown wherever federated access is reviewed, so an administrator reading who reaches a customer knows how old that answer can be.

The same bound governs everything the provider decides, not only group membership: a disabled account, a withdrawn group, a revoked consent. Anything that ends a federated analyst's access at the provider ends it here no later than the staleness bound, and sooner where a revalidation happens first. The bound is a ceiling on the delay, never a delay that must elapse.

An administrator MUST have a means that does not wait for the provider: ending an analyst's sessions and removing them here takes effect at once, and is what an organisation uses when somebody must lose access now.

#### Scenario: An analyst signs in through the provider

- GIVEN an install with federation configured
- WHEN an analyst signs in through the identity provider
- THEN they reach the install
- AND they reach no customer's cases beyond the default customer until they are in a group

#### Scenario: The provider is unreachable

- GIVEN an install with federation configured
- WHEN the identity provider cannot be reached
- THEN an administrator can still sign in locally
- AND the install is not lost

#### Scenario: Federation is broken rather than unreachable

- GIVEN an install with federation configured
- AND a provider answering promptly with an error — a deleted registration, an expired secret, withdrawn consent, a removed tenant
- WHEN an analyst attempts to sign in through it
- THEN a local administrator can still sign in
- AND what the provider said is shown to them, so the cause is diagnosable here

#### Scenario: An analyst leaves the organisation

- GIVEN an analyst who signs in through the provider
- WHEN their account there is disabled
- THEN they cannot sign in here
- AND their existing sessions end within the staleness bound, not at their own expiry

#### Scenario: An administrator asks how stale an answer is

- GIVEN an administrator reviewing who reaches a customer
- WHEN reach came from a provider claim
- THEN they are shown the staleness bound that applies to it

#### Scenario: Federation is off

- GIVEN an install with no federation configured
- WHEN it is used
- THEN it makes no outbound request
- AND every requirement of this specification is met locally

#### Scenario: A federated analyst has no second factor here

- GIVEN an install federating to a provider that enforces its own second factor
- WHEN a federated analyst signs in
- THEN this install does not ask for one of its own

#### Scenario: A federated account has no password here

- GIVEN an account belonging to the identity provider
- WHEN somebody attempts to set or reset its password here
- THEN it is refused
- AND they are told the provider holds it

#### Scenario: The last local administrator is federated away

- GIVEN an install with one local administrator
- WHEN somebody attempts to convert that account to the provider's
- THEN it is refused

#### Scenario: Federation is turned off with federated accounts in place

- GIVEN an install with federated analysts
- WHEN an administrator turns federation off
- THEN those analysts can no longer sign in
- AND the administrator is told how many, before it is turned off

#### Scenario: A mapping is configured

- GIVEN an administrator and a group at the identity provider
- WHEN they map it onto a group here
- THEN analysts arriving with that claim reach that group's customers
- AND the mapping is logged

#### Scenario: An analyst arrives with an unmapped claim

- GIVEN an analyst whose provider groups are not mapped here
- WHEN they sign in
- THEN they reach no customer's cases beyond the default customer

#### Scenario: Somebody is added to a group at the provider

- GIVEN a mapped provider group
- WHEN somebody is added to it there
- THEN they reach this install's corresponding group at their next sign-in
- AND why they reach it is answerable here, naming the mapping

#### Scenario: Somebody is removed at the provider

- GIVEN an analyst reaching customers only through a mapped group
- WHEN they are removed from it at the provider
- THEN they stop reaching those customers no later than the staleness bound
- AND sooner where a revalidation happens first, since a revalidation that succeeds has already learnt the change

#### Scenario: Somebody must lose access now

- GIVEN an analyst whose provider group has been withdrawn
- AND an organisation that cannot wait for the session to be renewed
- WHEN an administrator ends their sessions and removes them here
- THEN they stop reaching those customers at once
- AND anything they had open on them stops being served

#### Scenario: A mapping is removed

- GIVEN a mapping that several analysts reach customers through
- WHEN an administrator removes it
- THEN each of them stops reaching those customers
- AND the administrator is told how many analysts it affects before it is removed

#### Scenario: An analyst is reached both ways

- GIVEN an analyst placed in a group here directly
- AND also arriving with a claim mapped to it
- WHEN the mapping is removed
- THEN they still reach it, because they were placed in it here

### Requirement: A session belongs to its holder and ends when it should

A request MUST be served through the session of the caller who made it, never through another's.

A session MUST end after an idle period the install sets, and MUST also end at an absolute lifetime the install sets, whether or not it has been idle. An unattended session that stays busy is still a session nobody is watching.

An analyst MUST be able to see their own active sessions and end any of them. An administrator MUST be able to end a session, and MUST be able to end every session at once.

Ending a session MUST take effect immediately, not at its next expiry.

#### Scenario: An administrator ends a session

- GIVEN an analyst with an open session
- WHEN an administrator ends it
- THEN the next request that session makes is refused
- AND anything it had open stops being served

#### Scenario: A session goes idle

- GIVEN a session that has been idle longer than the install permits
- WHEN it makes a request
- THEN it is refused

#### Scenario: A session reaches its absolute lifetime

- GIVEN a session in continuous use, never idle
- WHEN it reaches the absolute lifetime the install sets
- THEN it ends
- AND its holder signs in again

#### Scenario: An analyst reviews their own sessions

- GIVEN an analyst signed in from more than one place
- WHEN they look at their own sessions
- THEN each is listed
- AND they can end any of them

#### Scenario: Every session is ended at once

- GIVEN an install with analysts signed in
- WHEN an administrator ends every session
- THEN none of them is served further

### Requirement: An administrator can see who reaches what, and why

An administrator MUST be able to answer, without leaving this application: who can sign in, what each of them reaches, why they reach it, and when they were last here.

For every account the install knows, that means: whether it is local or the provider's, whether it is an administrator, when it last signed in, whether it has a second factor, and every customer it reaches with the level it reaches them at.

**Why** is the part that matters and the part usually missing. Each customer an analyst reaches MUST name what granted it — a group they were placed in here, a group a provider claim was mapped onto, or the default customer. An administrator asked why somebody can read a customer's investigation MUST be able to answer from this screen.

The same MUST be answerable from the other end: for a customer, who reaches it and how.

**The install cannot enumerate everybody who could sign in, and MUST NOT pretend otherwise.** It knows the accounts it has seen. Anybody in a mapped provider group can sign in whether or not they ever have, so the install MUST show its mappings as what admits people, alongside the accounts it has actually met, and MUST NOT present the second as the whole answer.

#### Scenario: An administrator reviews access

- GIVEN accounts both local and federated
- WHEN an administrator lists them
- THEN each shows its kind, its last sign-in, whether it carries a second factor, and every customer it reaches at what level

#### Scenario: An administrator asks why

- GIVEN an analyst reaching a customer
- WHEN an administrator asks why
- THEN they are told what granted it — a local group, a mapped provider group, or the default customer

#### Scenario: An administrator asks from the customer's side

- GIVEN a customer
- WHEN an administrator asks who reaches it
- THEN every analyst is listed, with the level and what granted it

#### Scenario: Somebody who has never signed in

- GIVEN a mapped provider group containing people this install has never seen
- WHEN an administrator reviews who can sign in
- THEN the mapping is shown as admitting them
- AND the install does not claim the accounts it has met are the whole list

#### Scenario: An account has never been used

- GIVEN an account created but never signed in to
- WHEN an administrator reviews it
- THEN it says so, rather than showing nothing

### Requirement: Administrative events are logged

An administrative event is anything that changes who can reach what, or changes how the install decides that. Each MUST be logged with who did it, what it affected, and when.

Reaching the install and being refused reach are events too. Every sign-in MUST be logged, successful or not, with how it was attempted — locally or through the provider — and a refused reach to a customer or a case MUST be logged with who was refused and what they were refused. A failed sign-in and a refused reach are the two things an investigation into this application's own misuse starts from.

**The record is append-only, and nobody may edit it.** An entry once written MUST NOT be changed or removed by anybody, through any path, at any level of privilege. An administrator MUST NOT be able to edit the record of what administrators did, because a record its subject can rewrite is not a record.

Entries MUST leave only by the retention this specification requires, and that leaving MUST itself be recorded: what was pruned, how much, and under which period.

**Reading the record is itself controlled.** The log names who reached which customer's cases, so it is not less sensitive than what it describes. Reaching it MUST require reach, and reaching it MUST be logged.

**Logging cannot be turned off.** What an install configures is where the record goes and how long it is kept, never whether it is made. An administrator who could pause it could grant themselves reach, read an investigation, withdraw the reach and resume it, leaving a trail of two settings changes and nothing between them.

**Where the record cannot be written, what happens depends on what was being attempted, and every case MUST have an answer.**

Anything that *changes* state MUST be refused: an administrative act, a change to a case, a grant, a reset. An unrecordable change is indistinguishable from a suppressed one, so it does not happen.

Anything that *refuses* MUST still refuse. Refusing to refuse is incoherent — it would turn a log outage into an open door — so the refusal stands and the failure to record it becomes the install's problem rather than the caller's.

**Signing in MUST be refused** while authentication cannot be recorded. An install that admits people it cannot account for is worse than one nobody can sign in to, and the way back in is the recovery credential, whose use is recorded by the same mechanism and fails the same way.

In every case where the record could not be written, the install MUST report itself unwell and MUST say that its record has a hole and where. An install that carries on quietly has lost the property the log exists for.

That is: creating, changing or removing an account; making somebody an administrator or ceasing to; creating, changing or removing a group, or what customers it holds; adding somebody to a group, removing them, or changing their level; locking or unlocking an account; ending a session; resetting somebody's second factor; turning the second-factor policy on or off; configuring, changing or removing federation; adding, changing or removing a provider group mapping; issuing a new recovery credential, using one, or failing to.

Changing what the logging itself does is an administrative event.

#### Scenario: Somebody is given reach

- GIVEN an administrator adding an analyst to a group
- WHEN the membership is made
- THEN it is logged with the administrator, the analyst, the group, the level and the moment

#### Scenario: Somebody signs in

- GIVEN an analyst signing in, locally or through the provider
- WHEN the attempt succeeds or fails
- THEN it is logged with who, when, and how it was attempted

#### Scenario: Somebody is refused a customer

- GIVEN an analyst requesting a case for a customer they do not reach
- WHEN the request is refused
- THEN the refusal is logged with who was refused and what they asked for

#### Scenario: An administrator attempts to pause the record

- GIVEN an administrator
- WHEN they attempt to stop administrative events being logged
- THEN it is refused
- AND the attempt is logged

#### Scenario: A change cannot be recorded

- GIVEN an install whose log destination is unavailable
- WHEN anybody attempts an administrative act, or a change to a case
- THEN it is refused
- AND they are told the record could not be made

#### Scenario: A refusal cannot be recorded

- GIVEN an install whose log destination is unavailable
- WHEN somebody is refused reach to a customer
- THEN they are still refused
- AND the install reports that its record has a hole

#### Scenario: A sign-in cannot be recorded

- GIVEN an install whose log destination is unavailable
- WHEN somebody attempts to sign in
- THEN it is refused

#### Scenario: An entry is edited

- GIVEN a written log entry
- WHEN anybody, at any privilege, attempts to change or remove it
- THEN it is refused

#### Scenario: The record is read

- GIVEN somebody reading the log
- WHEN they do
- THEN reaching it required reach
- AND the reading is itself recorded

#### Scenario: Where the record goes is changed

- GIVEN an administrator
- WHEN they change the log's destination or how long it is kept
- THEN the change is itself logged, at both the old destination and the new
