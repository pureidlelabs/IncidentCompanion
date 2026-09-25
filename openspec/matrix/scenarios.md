# Scenario ledger

**The constitution requires four numbers to be answerable at any moment**: how many scenarios exist, how many are demonstrated, how many are recorded as undemonstrable, and how many describe something the product does not yet have. `.claude/scripts/ledger_totals.py` counts them from the rows below, and the run that decides a landing counts them again from what it saw pass, refusing the landing where the two disagree. `tests/docs/test_scenario_ledger.py` holds those rows against the specifications, so a scenario cannot be added, renamed or removed without this file being brought with it.

**Every scenario starts undemonstrated, and that is the honest reading rather than a regression.** A scenario is demonstrated when the tests cited for it would fail were it false, and the run that decides a landing saw each of them pass.

**A test passing is not by itself a demonstration.** The constitution is explicit: a test written against an implementation was written from what the code does, so it passes while the specification it was never shown remains unmet. Citing one here is a claim that somebody read the scenario and the test together and found the second to demonstrate the first, so the pull request that makes a row demonstrated names the change to the product that would turn its cited tests red, and a reviewer who is not its author makes that change and sees them go red.

## How a row is filled in

**`demonstrated`** names the tests that demonstrate it, each as `path :: describe > case`, several separated by ` ; `. Each reaches the product the way the scenario's actor does: a request or a socket the booted application served, a story drawn in a browser, a stack raised with Compose, or a screen rendered. A path alone, a check that reads the repository, and a test that builds the parts by hand demonstrate nothing. The run that decides a landing refuses a row whose cited test is absent, skipped, failed, or never reached the product, and `tests/certify.py` is that refusal.

**`undemonstrable`** carries the reason instead. Some scenarios are honestly beyond automation -- an operator is told, an analyst can tell at a glance, a refusal reveals nothing by its timing. Those are demonstrated by somebody looking, or they are not demonstrated at all, and the constitution requires that they are recorded rather than quietly counted.

**`unbuilt`** carries what is absent and where the decision to keep it lives. The requirement is normative and stays that way -- it describes the product this is meant to be, and a version not having it yet is not an argument about whether it belongs. A test could show it the day the subject exists, which is what separates this from `undemonstrable`.

**`undemonstrated`** carries nothing. It is the default and it is not a failure; it is the state of a scenario nobody has traced.

## accounts-and-access

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| An account is provisioned, never self-created | An install with no accounts is claimed | undemonstrated | |
| An account is provisioned, never self-created | Somebody reaches the service first | undemonstrated | |
| An account is provisioned, never self-created | Two claims arrive together | undemonstrated | |
| An account is provisioned, never self-created | The claim is attempted twice | demonstrated | server/test/a-second-claim-is-refused-and-recorded.test.ts :: a claim on an install that already has accounts > is refused, and the refusal is written down |
| An account is provisioned, never self-created | A new account reaches nothing | demonstrated | server/test/a-new-account-reaches-only-the-default-customer.test.ts :: an account just provisioned > can sign in ; server/test/a-new-account-reaches-only-the-default-customer.test.ts :: an account just provisioned > reaches a case on the default customer, which everybody holds ; server/test/a-new-account-reaches-only-the-default-customer.test.ts :: an account just provisioned > reaches no case on a customer no group of theirs holds |
| An address names one account, whatever case it is spelled in | An account is created in a second spelling of an address already held | demonstrated | server/test/an-account-is-administered-by-any-spelling-of-its-address.test.ts :: an account named by a differently cased address > refuses a second account for an address already held, in either spelling |
| An address names one account, whatever case it is spelled in | Two administrators create the same account at the same moment | demonstrated | server/test/an-account-is-administered-by-any-spelling-of-its-address.test.ts :: an account named by a differently cased address > produces one account when two administrators create it at the same moment |
| An address names one account, whatever case it is spelled in | An account is administered by a differently cased spelling | demonstrated | server/test/an-account-is-administered-by-any-spelling-of-its-address.test.ts :: an account named by a differently cased address > is reset, disabled, enabled and re-roled by the spelling the admin typed |
| An address names one account, whatever case it is spelled in | A lockout is cleared | undemonstrated | |
| Managing the install and reaching case data are separate grants | An administrator has granted themselves no data access | undemonstrated | |
| Managing the install and reaching case data are separate grants | An analyst with wide data access administers nothing | demonstrated | server/test/wide-reach-administers-nothing.test.ts :: an analyst reaching every customer administers nothing > refuses an analyst who reaches everything to create an account ; server/test/wide-reach-administers-nothing.test.ts :: an analyst reaching every customer administers nothing > refuses an analyst who reaches everything to create a group ; server/test/wide-reach-administers-nothing.test.ts :: an analyst reaching every customer administers nothing > refuses an analyst who reaches everything to create a customer |
| Managing the install and reaching case data are separate grants | An administrator grants themselves access | undemonstrated | |
| What the install is made of is management-plane | An analyst asks what the install holds | demonstrated | server/test/analyst-privilege.test.ts :: an analyst who is not an administrator > is refused exactly the routes that are privileged, and no others |
| What the install is made of is management-plane | An analyst asks what the host has left | demonstrated | server/test/analyst-privilege.test.ts :: an analyst who is not an administrator > is refused exactly the routes that are privileged, and no others |
| What the install is made of is management-plane | An administrator asks the same questions | demonstrated | server/test/analyst-privilege.test.ts :: an analyst who is not an administrator > answers an administrator at /api/health/activity ; server/test/analyst-privilege.test.ts :: an analyst who is not an administrator > answers an administrator at /api/health/resources ; server/test/analyst-privilege.test.ts :: an analyst who is not an administrator > answers an administrator at /api/settings |
| What the install is made of is management-plane | The rail offers a pane nobody behind it would answer | undemonstrated | |
| What the install is made of is management-plane | Something asks whether the install is serving | undemonstrated | |
| Case data is reached through groups, at a level | A group is built for a sector | undemonstrated | |
| Case data is reached through groups, at a level | Two memberships disagree | undemonstrated | |
| Case data is reached through groups, at a level | A level is reduced while the analyst is working | undemonstrated | |
| Case data is reached through groups, at a level | Reach is withdrawn while the analyst is working | demonstrated | server/test/reach-withdrawn-ends-what-was-open.test.ts :: an analyst whose reach is taken away > ends the connection it already had open ; server/test/reach-withdrawn-ends-what-was-open.test.ts :: an analyst whose reach is taken away > stops serving the case at all ; server/test/reach-withdrawn-ends-what-was-open.test.ts :: an analyst whose reach is taken away > ends the connection when the customer leaves the group instead |
| Case data is reached through groups, at a level | An analyst removes something inside a case | undemonstrated | |
| Case data is reached through groups, at a level | An analyst attempts to delete the case itself | demonstrated | server/test/the-level-survives-the-spelling.test.ts :: the level an act needs survives its spelling > refuses the analyst the case itself, spelled as the route declares it |
| Case data is reached through groups, at a level | The default customer cannot be withheld | undemonstrated | |
| Case data is reached through groups, at a level | An administrator disposes of a case nobody has attributed | undemonstrated | |
| Case data is reached through groups, at a level | An analyst is refused the same deletion | undemonstrated | |
| Case data is reached through groups, at a level | A group raises an account above the floor | undemonstrated | |
| Case data is reached through groups, at a level | An identity the install does not hold | demonstrated | server/test/an-identity-the-install-does-not-hold-reaches-nothing.test.ts :: an identity the install does not hold > is refused a default-customer case over a session that outlived its account |
| Case data is reached through groups, at a level | A list is asked for by an analyst in no group | undemonstrated | |
| Case data is reached through groups, at a level | Reach is withdrawn after the case was opened | undemonstrated | |
| An install always has somebody who can administer it | The last administrator is removed | demonstrated | server/test/last-admin-role.test.ts :: changing a role > through the app’s own route > refuses the demotion, and leaves the role alone |
| An install can be recovered without another administrator | The install is claimed | unbuilt | Not built: no recovery credential. Kept normative. -> #59 |
| An install can be recovered without another administrator | An install runs on a single administrator | unbuilt | Not built: no recovery credential. Kept normative. -> #59 |
| An install can be recovered without another administrator | An administrator forgets their password | unbuilt | Not built: no recovery credential. Kept normative. -> #59 |
| An install can be recovered without another administrator | The last administrator is locked out | unbuilt | Not built: no recovery credential. Kept normative. -> #59 |
| An install can be recovered without another administrator | The recovery credential is used to read a case | unbuilt | Not built: no recovery credential. Kept normative. -> #59 |
| An install can be recovered without another administrator | The credential is guessed at | unbuilt | Not built: no recovery credential. Kept normative. -> #59 |
| An install can be recovered without another administrator | A new credential is issued | unbuilt | Not built: no recovery credential. Kept normative. -> #59 |
| An install can be recovered without another administrator | The credential is lost | unbuilt | Not built: no recovery credential. Kept normative. -> #59 |
| Authentication resists guessing, and says so to the auditor | Repeated failures lock an account | demonstrated | server/test/account-lockout.test.ts :: locking an account after repeated failures > shuts the account, and then refuses the right password |
| Authentication resists guessing, and says so to the auditor | A locked account reveals nothing | demonstrated | server/test/account-lockout.test.ts :: locking an account after repeated failures > answers a locked account exactly as a wrong password ; server/test/account-lockout.test.ts :: locking an account after repeated failures > answers a malformed attempt the same whether or not the account is locked |
| Authentication resists guessing, and says so to the auditor | Another machine guesses at an analyst's account | demonstrated | server/test/a-guess-locks-out-only-the-guesser.test.ts :: guessing at an account from machines on the network > does not lock the holder out of the machine they sign in from |
| Authentication resists guessing, and says so to the auditor | Guesses arrive from many machines | demonstrated | server/test/a-guess-locks-out-only-the-guesser.test.ts :: guessing at an account from machines on the network > locks every machine the account has not signed in from when guesses are spread across several |
| Authentication resists guessing, and says so to the auditor | The holder's own machine guesses | demonstrated | server/test/a-guess-locks-out-only-the-guesser.test.ts :: guessing at an account from machines on the network > locks only the holder's machines when the guessing comes from one of them |
| Authentication resists guessing, and says so to the auditor | The same wrong password is offered again | demonstrated | server/test/a-guess-locks-out-only-the-guesser.test.ts :: guessing at an account from machines on the network > counts the same wrong password once, however often it is offered |
| Authentication resists guessing, and says so to the auditor | A lock follows a lock | demonstrated | server/test/a-guess-locks-out-only-the-guesser.test.ts :: guessing at an account from machines on the network > makes each lock that follows another longer, up to the install's maximum ; server/test/a-guess-locks-out-only-the-guesser.test.ts :: guessing at an account from machines on the network > locks a run once when the failures reaching the threshold arrive together |
| Authentication resists guessing, and says so to the auditor | An administrator releases an account | demonstrated | server/test/a-guess-locks-out-only-the-guesser.test.ts :: guessing at an account from machines on the network > clears every run when an administrator releases the account |
| Authentication resists guessing, and says so to the auditor | An account must change its password | demonstrated | server/test/a-held-account-reaches-only-its-way-out.test.ts :: an account that must change its password > is refused everything else the install publishes |
| Authentication resists guessing, and says so to the auditor | The install raises its password minimum | demonstrated | server/test/a-raised-password-minimum-is-what-every-door-asks.test.ts :: a raised password minimum > refuses a password under the install's minimum at this app's own door ; server/test/a-raised-password-minimum-is-what-every-door-asks.test.ts :: a raised password minimum > serves no door of the library's own that writes a password ; server/test/a-raised-password-minimum-is-what-every-door-asks.test.ts :: a raised password minimum > refuses one an administrator chooses for a new account ; server/test/a-raised-password-minimum-is-what-every-door-asks.test.ts :: a raised password minimum > refuses one an administrator resets an account to ; server/test/a-raised-password-minimum-is-what-every-door-asks.test.ts :: a raised password minimum > takes one that meets the raised minimum |
| Authentication resists guessing, and says so to the auditor | An account holds a password shorter than a raised minimum | demonstrated | server/test/a-raised-password-minimum-is-what-every-door-asks.test.ts :: a raised password minimum > still signs in an account whose password predates the raise |
| Authentication resists guessing, and says so to the auditor | A password is guessed at through a door other than sign-in | undemonstrated | |
| Authentication resists guessing, and says so to the auditor | A locked account's password is offered where it is changed | undemonstrated | |
| A second factor is available, and enforcing it is the install's policy | The policy is off | unbuilt | Not built: no second factor. Kept normative. -> #59 |
| A second factor is available, and enforcing it is the install's policy | An analyst enrols anyway | unbuilt | Not built: no second factor. Kept normative. -> #59 |
| A second factor is available, and enforcing it is the install's policy | The policy is turned on | unbuilt | Not built: no second factor. Kept normative. -> #59 |
| A second factor is available, and enforcing it is the install's policy | A correct password is not enough | unbuilt | Not built: no second factor. Kept normative. -> #59 |
| A second factor is available, and enforcing it is the install's policy | An analyst loses their authenticator | unbuilt | Not built: no second factor. Kept normative. -> #59 |
| A second factor is available, and enforcing it is the install's policy | An analyst has neither authenticator nor codes | unbuilt | Not built: no second factor. Kept normative. -> #59 |
| A second factor is available, and enforcing it is the install's policy | The install reports its own posture | unbuilt | Not built: no second factor. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | An analyst signs in through the provider | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | The provider is unreachable | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | Federation is broken rather than unreachable | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | An analyst leaves the organisation | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | An administrator asks how stale an answer is | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | Federation is off | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | A federated analyst has no second factor here | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | A federated account has no password here | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | The last local administrator is federated away | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | Federation is turned off with federated accounts in place | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | A mapping is configured | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | An analyst arrives with an unmapped claim | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | Somebody is added to a group at the provider | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | Somebody is removed at the provider | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | Somebody must lose access now | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | A mapping is removed | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| An install can federate its sign-in to the organisation's identity provider | An analyst is reached both ways | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| A verb the roster offers is refused on the account performing it | An administrator ends their own sessions from the roster | demonstrated | server/test/an-administrator-does-not-act-on-their-own-row.test.ts :: the roster acting on the caller’s own account > refuses ending the sessions of the account it is signed in with |
| A verb the roster offers is refused on the account performing it | An administrator changes their own role | demonstrated | server/test/an-administrator-does-not-act-on-their-own-row.test.ts :: the roster acting on the caller’s own account > refuses a role change on the account it is signed in with |
| A verb the roster offers is refused on the account performing it | An administrator sets the role their account already holds | demonstrated | server/test/an-administrator-does-not-act-on-their-own-row.test.ts :: the roster acting on the caller’s own account > still allows the same role, which changes nothing |
| A verb the roster offers is refused on the account performing it | The same verbs on somebody else | demonstrated | server/test/an-administrator-does-not-act-on-their-own-row.test.ts :: the roster acting on the caller’s own account > leaves both verbs available on somebody else |
| A session belongs to its holder and ends when it should | An administrator ends a session | demonstrated | server/test/an-administrator-ends-a-session.test.ts :: an administrator ending sessions > refuses every session the account held, and leaves the administrator its own ; server/test/an-ended-session-closes-what-it-had-open.test.ts :: an ended session and the socket it opened > closes the analyst's socket when an administrator ends that account's sessions |
| A session belongs to its holder and ends when it should | A session goes idle | undemonstrated | |
| A session belongs to its holder and ends when it should | Colleagues at one address keep their sessions in use | demonstrated | tests/docker/test_ingress.py :: test_an_address_reading_its_sessions_still_signs_in |
| A session belongs to its holder and ends when it should | Somebody at an analyst's address guesses at sign-in | demonstrated | tests/docker/test_ingress.py :: test_guessing_at_an_address_leaves_its_analysts_reporting_in |
| A session belongs to its holder and ends when it should | A session reaches its absolute lifetime | undemonstrated | |
| A session belongs to its holder and ends when it should | An analyst reviews their own sessions | demonstrated | server/test/an-analyst-sees-and-ends-their-own-sessions.test.ts :: an analyst signed in from two places > lists both of them to either one ; server/test/an-analyst-sees-and-ends-their-own-sessions.test.ts :: an analyst signed in from two places > ends the one that is named and leaves the other signed in |
| A session belongs to its holder and ends when it should | Every session is ended at once | demonstrated | server/test/an-administrator-ends-a-session.test.ts :: an administrator ending sessions > ends every session on the install, the administrator's included ; server/test/an-ended-session-closes-what-it-had-open.test.ts :: an ended session and the socket it opened > closes every socket when an administrator ends every session |
| An administrator can see who reaches what, and why | An administrator reviews access | unbuilt | Not built: whether an account is local or the provider's, and its second factor. -> #59 |
| An administrator can see who reaches what, and why | An administrator asks why | undemonstrated | |
| An administrator can see who reaches what, and why | An administrator asks from the customer's side | undemonstrated | |
| An administrator can see who reaches what, and why | Somebody who has never signed in | unbuilt | Not built: a mapped provider group admitting people the install has never met. -> #59 |
| An administrator can see who reaches what, and why | An account has never been used | unbuilt | Not built: the last sign-in is stored and no surface carries it. -> #208 |
| Administrative events are logged | Somebody is given reach | undemonstrated | |
| Administrative events are logged | Somebody signs in | demonstrated | server/test/a-sign-in-leaves-a-line.test.ts :: signing in leaves a line > records a successful sign-in against the account that made it ; server/test/a-sign-in-leaves-a-line.test.ts :: signing in leaves a line > records a refused sign-in, naming what was attempted and not what was typed |
| Administrative events are logged | Somebody is refused a customer | demonstrated | server/test/a-refused-reach-says-what-was-refused.test.ts :: a reach that was refused > records a reach it refused for weakness, and still answers 403 ; server/test/a-refused-reach-says-what-was-refused.test.ts :: a reach that was refused > records a reach it refused for absence, and still answers 404 |
| Administrative events are logged | An administrator attempts to pause the record | demonstrated | server/test/shortening-the-record-is-refused-and-recorded.test.ts :: an attempt to shorten the audit below its floor > is refused, and the attempt is written down |
| Administrative events are logged | A change cannot be recorded | unbuilt | Not built: an unrecordable act is logged and proceeds. -> #75 |
| Administrative events are logged | A refusal cannot be recorded | unbuilt | Not built: an unrecordable act is logged and proceeds. -> #75 |
| Administrative events are logged | A sign-in cannot be recorded | unbuilt | Not built: an unrecordable act is logged and proceeds. -> #75 |
| Administrative events are logged | An entry is edited | undemonstrated | |
| Administrative events are logged | The record is read | undemonstrated | |
| Administrative events are logged | Where the record goes is changed | unbuilt | Not built: there is no destination to change. -> #13 |
| Administrative events are logged | A session is refused after its account is gone | demonstrated | server/test/an-identity-the-install-does-not-hold-reaches-nothing.test.ts :: an identity the install does not hold > records the refusal, naming who the session said it was |
| Administrative events are logged | An analyst ends their own session | undemonstrated | |
| Administrative events are logged | An ending that ends nothing | undemonstrated | |
| An install serves only the account operations it offers | A caller asks for an account operation the install does not offer | undemonstrated | |
| An install serves only the account operations it offers | An operation is asked for by another spelling | undemonstrated | |
| An install serves only the account operations it offers | A held account asks for an operation the install offers | undemonstrated | |
| An install serves only the account operations it offers | An analyst takes another account's name | undemonstrated | |

## analysis

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| Every view is derived from the case, and none of them is a second record | A row is edited | undemonstrated | |
| Every view is derived from the case, and none of them is a second record | An analyst is asked to maintain a view | undemonstrated | |
| Where an attack had got to is derived from what the analyst already recorded | An analyst records what an attacker did | undemonstrated | |
| Where an attack had got to is derived from what the analyst already recorded | A more specific reading is available | undemonstrated | |
| Where an attack had got to is derived from what the analyst already recorded | An analyst disagrees with the derivation | undemonstrated | |
| Where an attack had got to is derived from what the analyst already recorded | A stage nothing implies | undemonstrated | |
| The picture is of the intrusion, not of the case file | A case with many recorded events | undemonstrated | |
| The picture is of the intrusion, not of the case file | The analyst's own working-out | undemonstrated | |
| The picture is of the intrusion, not of the case file | An analyst removes something from the picture | undemonstrated | |
| The picture is of the intrusion, not of the case file | Something is referred to that is not there | undemonstrated | |
| A case can be narrowed to a stretch of time, and the narrowing is a view | An analyst narrows a case to a stretch of time | undemonstrated | |
| A case can be narrowed to a stretch of time, and the narrowing is a view | The narrowing is removed | undemonstrated | |
| A value can be found anywhere in the case | An analyst searches for a value | undemonstrated | |
| A value can be found anywhere in the case | The value appears in another case | undemonstrated | |

## case-archive

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| An archive is one file holding the whole case | A case is archived | undemonstrated | |
| An archive is one file holding the whole case | An analyst archives without the attachments | undemonstrated | |
| An archive is one file holding the whole case | Expected material is not found | undemonstrated | |
| An archive is one file holding the whole case | Deleted text does not travel | demonstrated | server/test/an-archive-carries-the-case-as-it-reads.test.ts :: an archive carries the case as it reads > carries each report as it reads, and none of how it came to |
| An archive is one file holding the whole case | A removed section does not travel | demonstrated | server/test/an-archive-carries-the-case-as-it-reads.test.ts :: an archive carries the case as it reads > carries each report as it reads, and none of how it came to |
| An archive is one file holding the whole case | A note's prose is archived | demonstrated | server/test/an-archive-carries-the-case-as-it-reads.test.ts :: an archive carries the case as it reads > reads a note back as it was written |
| An archive is one file holding the whole case | A case larger than an archive may carry | demonstrated | server/test/an-archive-states-more-rows-than-the-install-writes.test.ts :: how many rows an archive may describe > refuses to archive a case past the ceiling, naming the ceiling |
| An archive says what it should contain, and is checked against it | An archive is read | undemonstrated | |
| An archive says what it should contain, and is checked against it | An archive has been altered | undemonstrated | |
| An archive says what it should contain, and is checked against it | A sealed archive is altered by somebody without its secret | demonstrated | server/test/an-archive-carries-the-case-as-it-reads.test.ts :: an archive carries the case as it reads > refuses a sealed archive altered by somebody without its secret ; server/test/an-archive-carries-the-case-as-it-reads.test.ts :: an archive carries the case as it reads > refuses a plain archive offered with a secret, as not the sealed one it claims to be |
| An archive says what it should contain, and is checked against it | An analyst archives without sealing | demonstrated | ui/src/screens/case-archive.stories.tsx :: An export left unencrypted |
| An analyst can seal an archive, and the seal is theirs to hold | An analyst seals an archive | undemonstrated | |
| An analyst can seal an archive, and the seal is theirs to hold | The install is asked to open a sealed archive | undemonstrated | |
| An analyst can seal an archive, and the seal is theirs to hold | A secret too weak to be worth having | undemonstrated | |
| Reading an archive cannot be made to cost more than the install will spend | An archive declares more work than the install produces | undemonstrated | |
| Reading an archive cannot be made to cost more than the install will spend | An archive describing more content than the install accepts | undemonstrated | |
| Reading an archive cannot be made to cost more than the install will spend | An archive describing more rows than the install writes | demonstrated | server/test/an-archive-states-more-rows-than-the-install-writes.test.ts :: how many rows an archive may describe > refuses an archive stating one row past the ceiling, naming the ceiling, and writes none of it ; server/test/an-archive-states-more-rows-than-the-install-writes.test.ts :: how many rows an archive may describe > refuses by the ceiling before it tries to write a single row ; server/test/an-archive-states-more-rows-than-the-install-writes.test.ts :: how many rows an archive may describe > counts every collection an archive states toward the ceiling |
| Reading an archive creates a case; it never overwrites one | An archive is read in | undemonstrated | |
| Reading an archive creates a case; it never overwrites one | An archive names things the install already holds | undemonstrated | |
| Reading an archive creates a case; it never overwrites one | An archive names an artefact it does not carry | demonstrated | server/test/a-digest-reaches-nothing-outside-its-case.test.ts :: an artefact is reached only through the case that holds it > serves an account that reaches nothing of customer B none of it by naming its digests |
| Reading an archive creates a case; it never overwrites one | An archive is attributed | undemonstrated | |
| Reading an archive creates a case; it never overwrites one | An archive states where its rows came from | undemonstrated | |
| An archive is refused where its reference is already held | The install still holds the case the archive was made from | undemonstrated | |
| An archive is refused where its reference is already held | The reference is free | undemonstrated | |
| An archive is refused where its reference is already held | The archive carries no reference | undemonstrated | |
| Reading an archive says how complete the case it made is | An archive carries rows that name what it left behind | undemonstrated | |
| Reading an archive says how complete the case it made is | A case names a row that is not in it | undemonstrated | |
| Reading an archive says how complete the case it made is | The exporting install had lost material the case records | undemonstrated | |
| Reading an archive says how complete the case it made is | An archive written without its attachments claims no loss | undemonstrated | |
| An archive's rows are checked against what this install can hold | An archive states a term outside a fixed set | undemonstrated | |
| An archive's rows are checked against what this install can hold | An archive states a value of the wrong shape | undemonstrated | |
| An archive's rows are checked against what this install can hold | An archive states a value the store cannot hold | undemonstrated | |
| An archive's rows are checked against what this install can hold | An archive is refused after some of its rows were sound | undemonstrated | |
| An archive's rows are checked against what this install can hold | An archive carries a field this install does not know | undemonstrated | |
| An archive's rows are checked against what this install can hold | An archive leaves a column out | undemonstrated | |
| An archive's rows are checked against what this install can hold | An archive states a value in a field its other fields make inapplicable | demonstrated | server/test/every-cross-field-rule-holds-at-the-archive.test.ts :: a rule spanning fields, at the archive door > refuses 'scope' set in 'network_indicators' where its gate says it does not apply |
| An archive's rows are checked against what this install can hold | An archive's report is sent without its document, or the reverse | demonstrated | server/test/an-archived-report-is-sent-and-preserved-or-neither.test.ts :: a report an archive says was sent > refuses a report that preserves a document no painter reads, and leaves no case behind ; server/test/an-archived-report-is-sent-and-preserved-or-neither.test.ts :: a report an archive says was sent > refuses a report that preserves a document and was never sent, and leaves no case behind ; server/test/an-archived-report-is-sent-and-preserved-or-neither.test.ts :: a report an archive says was sent > refuses a report that says it was sent and preserves nothing, and leaves no case behind |
| An archive's rows are checked against what this install can hold | An archive carries a report it says was sent | demonstrated | server/test/an-archived-report-is-sent-and-preserved-or-neither.test.ts :: a report an archive says was sent > reads a genuine sent report as sent ; server/test/an-archived-report-is-sent-and-preserved-or-neither.test.ts :: a report an archive says was sent > contains a live indicator an archive preserved, on the way in |
| An archive's rows are checked against what this install can hold | An archive's record plants a note document | demonstrated | server/test/an-archive-carries-the-case-as-it-reads.test.ts :: an archive carries the case as it reads > reads no note document from an archive record, whatever it plants |

## cases

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| A case is identified by what an analyst recognises it by | A reference is reused within a customer | undemonstrated | |
| A case is identified by what an analyst recognises it by | The same reference is used for two customers | undemonstrated | |
| A case is identified by what an analyst recognises it by | A case moves to a customer that already uses its reference | undemonstrated | |
| A case is identified by what an analyst recognises it by | The mover reaches the customer that already uses the reference | demonstrated | server/test/a-move-says-nothing-about-a-customer-the-mover-does-not-reach.test.ts :: moving a case to a customer > tells a mover who reaches the customer which case holds the reference |
| A case is identified by what an analyst recognises it by | A case carrying a reference is moved to a customer the mover does not reach | demonstrated | server/test/a-move-says-nothing-about-a-customer-the-mover-does-not-reach.test.ts :: moving a case to a customer > refuses a referenced case the same way whether or not the customer holds its reference |
| A case is identified by what an analyst recognises it by | Several cases for one customer have no reference | undemonstrated | |
| A case is identified by what an analyst recognises it by | A case gains its reference later | demonstrated | server/test/a-reference-collides-only-inside-one-customer.test.ts :: a case reference > is accepted later, and the change says who made it |
| A case says where its work sits | An analyst scans the case list | undemonstrated | |
| A case says where its work sits | The incident ends before the case does | undemonstrated | |
| A case says where its work sits | A case is closed with reporting outstanding | unbuilt | Not built: closing is gated on what a case owes, and what a case owes is recorded nowhere. -> #188 |
| A case says where its work sits | A case owes nothing | unbuilt | Not built: closing is gated on what a case owes, and what a case owes is recorded nowhere. -> #188 |
| A case says where its work sits | A handled incident resumes | undemonstrated | |
| A case's destruction is itself a record | An analyst deletes a case | demonstrated | server/test/a-deletion-outlives-its-case.test.ts :: the record of a deletion > is still readable once the case it names is gone |
| A case's destruction is itself a record | The install is asked what happened to a case | demonstrated | server/test/a-deletion-outlives-its-case.test.ts :: the record of a deletion > answers about the identifier, not only about the title ; server/test/a-deletion-outlives-its-case.test.ts :: the record of a deletion > does not carry what the case contained |
| A case's destruction is itself a record | A demonstration case is removed | demonstrated | server/test/a-deletion-outlives-its-case.test.ts :: the record of a deletion > leaves nothing behind a demonstration case |
| Reaching a case is decided in one place, by customer | An analyst reaches a case for a customer they hold | demonstrated | server/test/what-a-held-customer-opens-and-where-it-stops.test.ts :: an analyst who holds the customer a case belongs to > is served the case itself ; server/test/what-a-held-customer-opens-and-where-it-stops.test.ts :: an analyst who holds the customer a case belongs to > is served what hangs off it, on the same grant ; server/test/what-a-held-customer-opens-and-where-it-stops.test.ts :: an analyst who holds the customer a case belongs to > is refused a write, because the level is read |
| Reaching a case is decided in one place, by customer | An analyst reaches a case for a customer they do not hold | demonstrated | server/test/out-of-reach-and-not-there-look-the-same.test.ts :: a case an analyst does not reach > answers a case out of reach exactly as one that does not exist |
| Reaching a case is decided in one place, by customer | An unknown customer becomes known | undemonstrated | |
| Reaching a case is decided in one place, by customer | A case's customer changes under an analyst | undemonstrated | |
| Reaching a case is decided in one place, by customer | A case is opened before the customer is known | undemonstrated | |
| Reaching a case is decided in one place, by customer | A case is reached over a live connection | demonstrated | server/test/both-doors-answer-reach-alike.test.ts :: the route and the socket, at each level > answers alike at none over an attributed case ; server/test/both-doors-answer-reach-alike.test.ts :: the route and the socket, at each level > answers alike at read over an attributed case ; server/test/both-doors-answer-reach-alike.test.ts :: the route and the socket, at each level > answers alike at write over an attributed case ; server/test/both-doors-answer-reach-alike.test.ts :: the route and the socket, at each level > answers alike at delete over an attributed case ; server/test/a-refused-socket-frame-is-recorded.test.ts :: a refused socket frame, beside a refused request > records a refused claim and a refused prose edit as refusals naming the case |
| Demonstration content is distinguishable from real work | An install carries both | undemonstrated | |
| Demonstration content is distinguishable from real work | A count is taken across cases | undemonstrated | |
| An analyst can return to recent work | An analyst returns after closing the application | undemonstrated | |
| An analyst can return to recent work | Recent work names a case that has gone | undemonstrated | |

## collections

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| One implementation, and what differs is described rather than coded | A collection is added | undemonstrated | |
| One implementation, and what differs is described rather than coded | A collection needs behaviour the others do not have | undemonstrated | |
| A row is checked against its description, where the caller cannot reach | A caller submits a row the screen would not have | demonstrated | server/test/a-row-the-screen-would-refuse-is-refused-here-too.test.ts :: a row a caller submits directly > refuses a value outside the vocabulary, and names the field ; server/test/a-row-the-screen-would-refuse-is-refused-here-too.test.ts :: a row a caller submits directly > refuses a required field left out, and names the field ; server/test/a-row-the-screen-would-refuse-is-refused-here-too.test.ts :: a row a caller submits directly > refuses a field of the wrong type, and names the field |
| A row is checked against its description, where the caller cannot reach | A field draws from a vocabulary | undemonstrated | |
| A row is checked against its description, where the caller cannot reach | Fields disagree with each other | undemonstrated | |
| The description is retrievable, so what a case may hold is answerable from the application | An analyst asks what a field accepts | undemonstrated | |
| The description is retrievable, so what a case may hold is answerable from the application | A field is added | undemonstrated | |
| The description is retrievable, so what a case may hold is answerable from the application | An install has been extended | undemonstrated | |
| Every write is attributed, checked and announced as one act | Two analysts write to one row | undemonstrated | |
| Every write is attributed, checked and announced as one act | A write succeeds | undemonstrated | |
| Every write is attributed, checked and announced as one act | A write composed into an act that commits | undemonstrated | |
| Every write is attributed, checked and announced as one act | A write composed into an act that does not commit | undemonstrated | |
| Every write is attributed, checked and announced as one act | A write composed into nothing that declared an act | undemonstrated | |
| A reference points inside its own case, and the store alone cannot enforce it | A row references another case's row | undemonstrated | |
| A reference points inside its own case, and the store alone cannot enforce it | A reference is added to what a row is | undemonstrated | |
| A reference points inside its own case, and the store alone cannot enforce it | A referenced row is removed | undemonstrated | |
| Only some collections have an identity, and the rest are events | The same host is imported twice | undemonstrated | |
| Only some collections have an identity, and the rest are events | The same timeline entry is imported twice | undemonstrated | |
| Only some collections have an identity, and the rest are events | A second way of creating rows is added | undemonstrated | |
| Doing something to many rows obeys every rule that governs one | Some rows in a bulk write have moved | undemonstrated | |
| Doing something to many rows obeys every rule that governs one | A bulk write crosses the case boundary | undemonstrated | |
| Doing something to many rows obeys every rule that governs one | A row in a selection changes while the act is being confirmed | demonstrated | server/test/a-selection-is-acted-on-as-it-was-read.test.ts :: a selection another analyst changes before it is confirmed > deletes none of a selection holding a row that changed, and names that row ; server/test/a-selection-is-acted-on-as-it-was-read.test.ts :: a selection another analyst changes before it is confirmed > writes over none of a row that changed, and names that row ; ui/src/app/case/a-selection-carries-its-versions.test.tsx :: a selection on 'Entities' > is not deleted when a row in it changed while the confirmation was open |
| Order an analyst chose is theirs, and is not a property of the data | An analyst reorders rows | undemonstrated | |
| Order an analyst chose is theirs, and is not a property of the data | Rows arrive from an import | undemonstrated | |
| Order an analyst chose is theirs, and is not a property of the data | Two analysts reorder at once | undemonstrated | |
| Order an analyst chose is theirs, and is not a property of the data | An analyst moves a row twice in a row | undemonstrated | |
| What comes in and goes out is the same description | An analyst previews an import | undemonstrated | |
| What comes in and goes out is the same description | A row in an import is malformed | undemonstrated | |
| What comes in and goes out is the same description | An export is imported back | undemonstrated | |
| A field derived from a row's prose has one writer | A derived field is written | undemonstrated | |
| A field derived from a row's prose has one writer | A row's first words are opened again | undemonstrated | |

## compliance

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| A figure the case records is one it can read back | A figure larger than the install can carry | undemonstrated | |
| A figure the case records is one it can read back | The largest figure the install can carry | undemonstrated | |
| A figure the case records is one it can read back | A figure arriving by a route that does not validate | undemonstrated | |
| The answer has three values, and not knowing is one of them | A case records nothing yet | undemonstrated | |
| The answer has three values, and not knowing is one of them | A fact is recorded that settles it | undemonstrated | |
| The answer has three values, and not knowing is one of them | A fact is recorded that does not settle it | undemonstrated | |
| An assessment shows its working, against the instrument | An assessment is read | undemonstrated | |
| An assessment shows its working, against the instrument | A criterion is unstated | undemonstrated | |
| A threshold is quoted, never chosen | A threshold is applied | undemonstrated | |
| A threshold is quoted, never chosen | Thresholds differ by kind of organisation | undemonstrated | |
| A threshold is quoted, never chosen | A quoted figure drifts from its source | undemonstrated | |
| The application assesses; the organisation reports | An assessment finds a notification is owed | undemonstrated | |
| The application assesses; the organisation reports | A notification was made | undemonstrated | |
| A determination the analyst records is the one the assessment carries | An analyst records the determination | undemonstrated | |
| A determination the analyst records is the one the assessment carries | A recorded determination does not put an entity in scope | undemonstrated | |
| A regime that does not apply is not assessed | A customer is outside a regime | unbuilt | Not built: the regimes assessed are an install setting. -> #132 |
| A regime that does not apply is not assessed | A case moves to a customer under different regimes | unbuilt | Not built: the regimes assessed are an install setting. -> #132 |
| A regime that does not apply is not assessed | The analyst adopts the new customer's regimes | unbuilt | Not built: the regimes assessed are an install setting. -> #132 |
| A regime that does not apply is not assessed | A regime is added by a move | unbuilt | Not built: the regimes assessed are an install setting. -> #132 |
| Reporting stage is tracked against the case, not as its condition | A first submission is made and a later one is owed | unbuilt | Not built: no reporting stage is tracked against a case. -> #188 |
| Reporting stage is tracked against the case, not as its condition | A deadline approaches | undemonstrated | |
| Reporting stage is tracked against the case, not as its condition | The case is closed with a submission outstanding | unbuilt | Not built: no reporting stage is tracked against a case. -> #188 |
| An assessment is a reading of the case at a moment, and it moves | A fact changes after an assessment was read | undemonstrated | |
| An assessment is a reading of the case at a moment, and it moves | An assessment is quoted in a report | unbuilt | Not built: no report can carry an assessment. -> #187 |

## customers

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| A customer is a record the system holds | A customer is renamed | undemonstrated | |
| A customer is a record the system holds | An install has no customers | undemonstrated | |
| A customer holds what compliance asks about the organisation | A regime does not apply to a customer | unbuilt | Not built: the regimes assessed are an install setting. -> #132 |
| A customer holds what compliance asks about the organisation | An organisation fact is asked for at case level | undemonstrated | |
| A case takes a copy, and is told when the original moves | A customer's details are corrected | undemonstrated | |
| A case takes a copy, and is told when the original moves | An analyst accepts a correction | undemonstrated | |
| A case takes a copy, and is told when the original moves | A closed case is left alone | undemonstrated | |
| A case may answer for an organisation the system does not hold | An organisation is answered for on the case | undemonstrated | |
| A case may answer for an organisation the system does not hold | The organisation is onboarded afterwards | undemonstrated | |
| A customer cannot be removed out from under its cases | A customer with cases is removed | undemonstrated | |
| A customer cannot be removed out from under its cases | Two customer records turn out to be one organisation | undemonstrated | |
| A customer cannot be removed out from under its cases | The merged records disagree | undemonstrated | |
| A customer cannot be removed out from under its cases | Reach after a merge | undemonstrated | |
| A customer cannot be removed out from under its cases | An analyst reaches both sides of a merge at different levels | undemonstrated | |
| A customer cannot be removed out from under its cases | A reference collides across the merge | undemonstrated | |
| A customer cannot be removed out from under its cases | The default customer is merged | undemonstrated | |

## data-exchange

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| What the application writes, it can read back | An export is imported unchanged | undemonstrated | |
| What the application writes, it can read back | A file names a field that does not exist | undemonstrated | |
| What the application writes, it can read back | A blank value | undemonstrated | |
| An import is all of it or none of it | One row in a file is invalid | undemonstrated | |
| An import is all of it or none of it | An import succeeds | demonstrated | ui/src/screens/an-import-says-all-four-counts.test.tsx :: an import that met rows the case already held > says how many were already there and how many it replaced |
| A reference travels as what it points at, not as where it was kept | A file is imported back into the case it came from | undemonstrated | |
| A reference travels as what it points at, not as where it was kept | A file is imported into another case holding the same thing | undemonstrated | |
| A reference travels as what it points at, not as where it was kept | A file names where a row was kept | undemonstrated | |
| A reference the destination cannot resolve is reported, never dropped in silence | The destination does not hold the referenced thing | undemonstrated | |
| A reference the destination cannot resolve is reported, never dropped in silence | An import that carried everything | demonstrated | ui/src/screens/an-import-says-all-four-counts.test.tsx :: an import that lost references > says plainly that an import carried everything |
| An import says what to do about something already there | The analyst does not say what to do | undemonstrated | |
| An import says what to do about something already there | A row was changed by somebody else | undemonstrated | |
| An import says what to do about something already there | An unrecognised instruction | undemonstrated | |
| What leaves the application cannot execute in what opens it | A value begins as a formula | undemonstrated | |
| What leaves the application cannot execute in what opens it | A file that has already been through a spreadsheet | undemonstrated | |
| Content that hides what it says is refused before it is stored | A value carries characters that cannot be seen | undemonstrated | |
| A file has a size the application will accept, and says so when it will not | A file is too large | undemonstrated | |
| An indicator feed is what a defender can act on | An indicator is recorded as harmless | undemonstrated | |
| An indicator feed is what a defender can act on | A disposition the application does not recognise | undemonstrated | |
| An indicator feed is what a defender can act on | A feed is published for sharing | undemonstrated | |
| An indicator feed is what a defender can act on | A restriction is named for a form that cannot carry one | undemonstrated | |
| An indicator feed is what a defender can act on | A level two versions of the vocabulary spell alike | undemonstrated | |
| A row says which door it came through, and the install decides that | A row read out of a file | undemonstrated | |
| A row says which door it came through, and the install decides that | A file claims an origin of its own | undemonstrated | |
| A row says which door it came through, and the install decides that | A collection that records no origin | undemonstrated | |

## dependencies

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| What is available is answerable without reading the tree | A newer version exists and nothing has adopted it | undemonstrated | |
| What is available is answerable without reading the tree | Nothing is outstanding | undemonstrated | |
| A published vulnerability is answered without waiting | A vulnerability is published against an adopted version | undemonstrated | |
| A published vulnerability is answered without waiting | The vulnerable dependency is not a direct one | undemonstrated | |
| A version is observed before it is adopted unattended | A version is newer than the minimum period | undemonstrated | |
| A version is observed before it is adopted unattended | A person adopts it deliberately | undemonstrated | |
| A dependency held below the latest version carries its reason | A dependency is held back | undemonstrated | |
| A dependency held below the latest version carries its reason | The constraint that justified a hold is lifted | unbuilt | Not built: no hold is recorded in a form a check reads, so a hold outlives its reason silently. Kept normative. |
| A dependency held below the latest version carries its reason | Two dependencies are held by the same constraint | unbuilt | Not built: no record relates two holds to the constraint they share. Kept normative. |
| A change to dependencies is demonstrated before it lands | Every tier runs and passes | undemonstrated | |
| A change to dependencies is demonstrated before it lands | A tier could not run | undemonstrated | |
| Two builds of one revision resolve the same versions | The same revision is built twice | undemonstrated | |
| Two builds of one revision resolve the same versions | A component is identified by a moving name | undemonstrated | |

## deployment

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| It comes up with one command and no preparation | A first start on a clean machine | demonstrated | tests/docker/test_container_runtime.py :: test_the_app_answers_on_the_published_port |
| It comes up with one command and no preparation | A second start | undemonstrated | |
| It comes up with one command and no preparation | A dependency is slow | undemonstrated | |
| There is one way in, and it is the only thing exposed | What an install exposes | undemonstrated | |
| There is one way in, and it is the only thing exposed | The application is addressed directly | undemonstrated | |
| There is one way in, and it is the only thing exposed | An operator wants it reachable from the network | undemonstrated | |
| There is one way in, and it is the only thing exposed | The install is reached at a name it was not given | undemonstrated | |
| The connection is protected, and there is no way to turn that off | An install has no certificate | demonstrated | tests/docker/test_container_runtime.py :: test_the_app_answers_on_the_published_port ; tests/docker/test_container_runtime.py :: test_the_edge_keeps_the_private_key_owner_only |
| The connection is protected, and there is no way to turn that off | A client offers only a weaker protection | demonstrated | tests/docker/test_ingress.py :: test_a_client_offering_only_a_weak_suite_is_refused[AES128-SHA] ; tests/docker/test_ingress.py :: test_a_client_offering_only_a_weak_suite_is_refused[AES256-SHA] ; tests/docker/test_ingress.py :: test_a_client_offering_only_a_weak_suite_is_refused[AES128-SHA256] ; tests/docker/test_ingress.py :: test_a_client_offering_only_a_weak_suite_is_refused[AES256-SHA256] ; tests/docker/test_ingress.py :: test_a_client_offering_only_a_weak_suite_is_refused[AES128-GCM-SHA256] ; tests/docker/test_ingress.py :: test_a_client_offering_only_a_weak_suite_is_refused[ECDHE-RSA-AES256-SHA] ; tests/docker/test_ingress.py :: test_a_client_offering_only_a_weak_suite_is_refused[ECDHE-RSA-AES128-SHA256] ; tests/docker/test_ingress.py :: test_a_client_offering_a_forward_secret_aead_suite_is_served[-tls1_2-ECDHE-RSA-AES128-GCM-SHA256] ; tests/docker/test_ingress.py :: test_a_client_offering_a_forward_secret_aead_suite_is_served[-tls1_2-ECDHE-RSA-CHACHA20-POLY1305] ; tests/docker/test_ingress.py :: test_a_client_offering_a_forward_secret_aead_suite_is_served[-tls1_3-None] |
| The connection is protected, and there is no way to turn that off | The operator supplies a certificate | undemonstrated | |
| The connection is protected, and there is no way to turn that off | A supplied certificate cannot be used | undemonstrated | |
| The connection is protected, and there is no way to turn that off | Somebody wants it unprotected | undemonstrated | |
| The connection is protected, and there is no way to turn that off | The install is given a new name | undemonstrated | |
| The connection is protected, and there is no way to turn that off | A supplied certificate does not cover a new name | undemonstrated | |
| Setting up is separate from running, and runs once | Preparation runs before serving | undemonstrated | |
| Setting up is separate from running, and runs once | An install is started again | undemonstrated | |
| Setting up is separate from running, and runs once | Preparation fails | undemonstrated | |
| Setting up is separate from running, and runs once | Preparation runs again beside a serving application | undemonstrated | |
| Setting up is separate from running, and runs once | A new version would discard stored data | undemonstrated | |
| Setting up is separate from running, and runs once | Preparation is run by hand | undemonstrated | |
| What must survive is named, and what must not is not | The install is rebuilt | undemonstrated | |
| What must survive is named, and what must not is not | Something not named is lost | undemonstrated | |
| An install can say whether it is well, and what is wrong | A component has started but cannot answer | undemonstrated | |
| An install can say whether it is well, and what is wrong | A dependency fails while running | undemonstrated | |
| An install can say whether it is well, and what is wrong | A component stops unexpectedly | undemonstrated | |
| The application runs with no more than it needs | The application attempts something outside its work | undemonstrated | |
| The application runs with no more than it needs | A part is examined for what it can do | undemonstrated | |
| An install with nothing configured reaches nothing outside itself | An install lives its whole life with nothing configured | undemonstrated | |

## evaluation

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The application can be judged without being installed | An analyst opens the published form | undemonstrated | |
| The application can be judged without being installed | The evaluation build is judged on the product, not on a description of it | undemonstrable | The screens are the application's own because nothing replaces them; that is a property of what is substituted rather than of any answer, and somebody opening it is what shows it |
| What it cannot honestly do, it refuses | The analyst reaches something only an install can do | undemonstrated | |
| What it cannot honestly do, it refuses | A capability is added to the application | undemonstrated | |
| A draft is judged as an install would judge it | The analyst types something an install would accept | undemonstrated | |
| A draft is judged as an install would judge it | A write reaches a row somebody else has moved | undemonstrated | |
| A draft is judged as an install would judge it | The analyst types something an install would refuse | undemonstrated | |
| A draft is judged as an install would judge it | The rules an install enforces change | undemonstrated | |
| The visitor's work is their own, and they can discard it | Two people open the same published build | undemonstrated | |
| The visitor's work is their own, and they can discard it | The visitor wants a clean case | undemonstrated | |

## incident-import

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The install reaches nobody's platform on its own account | An install with no connection configured | undemonstrated | |
| The install reaches nobody's platform on its own account | The analyst's credential is used, not the install's | undemonstrated | |
| The install reaches nobody's platform on its own account | A credential is not kept | undemonstrated | |
| The install reaches nobody's platform on its own account | A credential goes only where it was issued for | undemonstrated | |
| Nothing is written until an analyst has approved it | An import is previewed | demonstrated | server/test/incident-import.test.ts :: importing an incident > the door inside a case > previews without writing anything ; server/test/incident-import.test.ts :: importing an incident > the door that starts a case > previews an incident with no case to compare against |
| Nothing is written until an analyst has approved it | An analyst declines part of an import | undemonstrated | |
| Nothing is written until an analyst has approved it | An analyst corrects a value before it is written | undemonstrated | |
| Nothing is written until an analyst has approved it | A correction the description would refuse | undemonstrated | |
| Nothing is written until an analyst has approved it | An approval the import cannot account for | undemonstrated | |
| Nothing is written until an analyst has approved it | A correction the import cannot account for | undemonstrated | |
| An import is matched against what the case already holds | An imported thing is already in the case | undemonstrated | |
| An import is matched against what the case already holds | The case changed while the import was reviewed | undemonstrated | |
| An import is matched against what the case already holds | An event is imported twice | undemonstrated | |
| One import proposes each thing once, however many incidents name it | Two incidents name the same host | undemonstrated | |
| One import proposes each thing once, however many incidents name it | One incident states a qualifier the other omits | undemonstrated | |
| One import proposes each thing once, however many incidents name it | An event from the second incident names the shared thing | undemonstrated | |
| An imported row says that it was imported, and that nobody has read it | An imported row is read back | demonstrated | server/test/incident-import.test.ts :: importing an incident > the door inside a case > writes what was approved, and links the timeline to it |
| An imported row says that it was imported, and that nobody has read it | A platform's data claims to be something else | undemonstrated | |
| An imported row says that it was imported, and that nobody has read it | An analyst reviews an imported row | unbuilt | Not built: `unreviewed` is owned by the server and no route clears it. -> #168 |
| What could not be brought in is counted rather than dropped | The platform sends something unrecognised | undemonstrated | |
| What could not be brought in is counted rather than dropped | An analyst asks what was left behind | undemonstrated | |
| A failed import never leaves a case behind | An import asked to create a case fails | demonstrated | server/test/an-import-that-opens-a-case-fills-the-one-it-opened.test.ts :: an import asked to open a case and fill it > leaves no case behind when the import fails after the case was created |
| A failed import never leaves a case behind | An import asked to create a case succeeds | demonstrated | server/test/an-import-that-opens-a-case-fills-the-one-it-opened.test.ts :: an import asked to open a case and fill it > holds what was approved, and only that |
| An import that failed partway can be run again without doing it twice | An import fails partway and is run again | undemonstrated | |
| An import that failed partway can be run again without doing it twice | A partly written import is reported | undemonstrated | |
| An analyst can start a case from an incident | An analyst starts a case from an incident | undemonstrated | |
| An analyst can start a case from an incident | The analyst names the case at the review | undemonstrated | |
| An analyst can start a case from an incident | An analyst leaves the wizard | demonstrated | ui/src/screens/import-sentinel-starts-a-case.test.tsx :: a wizard that starts the case it fills > writes nothing when the analyst leaves before the ending |
| An analyst can start a case from an incident | A case is named by what an analyst had to give it | demonstrated | ui/src/app/case/CaseFrameContainer.test.tsx :: the case the frame is drawn for > heads the rail with the title when the case carries no reference |
| A case opened from an incident keeps what the provider reported | An incident the provider judged | demonstrated | server/test/an-import-that-opens-a-case-fills-the-one-it-opened.test.ts :: an import asked to open a case and fill it > carries the severity the provider reported, in this vocabulary |
| A case opened from an incident keeps what the provider reported | One case from several incidents | demonstrated | server/test/incident-import.test.ts :: importing an incident > the door that starts a case > marks a case opened from several incidents with the worst of them |
| A case opened from an incident keeps what the provider reported | A level this vocabulary cannot express | demonstrated | server/test/incident-import.test.ts :: importing an incident > the door that starts a case > opens and fills the case where the reported level is a word it cannot say |
| A case opened from an incident keeps what the provider reported | A caller naming the severity itself | demonstrated | server/test/incident-import.test.ts :: importing an incident > the door that starts a case > refuses a caller that names the severity itself |
| An incident is not used up by the case it starts | A second case from the same incident | undemonstrated | |
| An incident is not used up by the case it starts | A composed field would have to be unique | demonstrated | ui/src/app/case/ImportSentinelContainer.test.tsx :: the Sentinel import container > the ending that makes the case it fills > seeds no reference, so one incident can start a second case |

## install-audit

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The record's home is a destination the operator keeps, not this install | An install with a destination configured | undemonstrated | |
| The record's home is a destination the operator keeps, not this install | The destination cannot be reached | undemonstrated | |
| The record's home is a destination the operator keeps, not this install | An install with no destination configured | demonstrated | server/test/with-no-destination-the-install-is-the-record.test.ts :: an install pointed at no destination > keeps the line itself when something recorded happens ; server/test/with-no-destination-the-install-is-the-record.test.ts :: an install pointed at no destination > serves that line back, so its own copy is reachable as the record ; server/test/with-no-destination-the-install-is-the-record.test.ts :: an install pointed at no destination > reports nothing incomplete for having none |
| A line, once written, cannot be changed | An attempt to change a line | undemonstrated | |
| A line, once written, cannot be changed | A line claiming another time | undemonstrated | |
| What the install holds is a buffer, and letting it go is not deleting the record | A delivered line ages out of the install | undemonstrated | |
| What the install holds is a buffer, and letting it go is not deleting the record | The destination has been unreachable | undemonstrated | |
| What the install holds is a buffer, and letting it go is not deleting the record | An install that is the record lets a line go | undemonstrated | |
| What the install holds is a buffer, and letting it go is not deleting the record | An administrator wants a line gone | undemonstrated | |
| What the install holds is a buffer, and letting it go is not deleting the record | A window below the floor, on an install that is the record | undemonstrated | |
| What the install holds is a buffer, and letting it go is not deleting the record | No window declared, on an install that is the record | undemonstrated | |
| What is kept for a long time and what is kept briefly are separated | A line is written | undemonstrated | |
| What is kept for a long time and what is kept briefly are separated | The two windows differ | undemonstrated | |
| A line says who, what, and to what, and never says what was written | An account is removed after acting | undemonstrated | |
| A line says who, what, and to what, and never says what was written | A request carrying a password | undemonstrated | |
| A line says who, what, and to what, and never says what was written | A caller asserts their own address | undemonstrated | |
| A line says who, what, and to what, and never says what was written | A caller invents a route | undemonstrated | |
| A line says who, what, and to what, and never says what was written | A caller reaches the application without passing the one way in | undemonstrated | |
| A line says who, what, and to what, and never says what was written | An install whose one way in started last | undemonstrated | |
| A line says who, what, and to what, and never says what was written | An administrator reads a line about a case they do not reach | demonstrated | server/test/a-list-offers-only-what-the-caller-reaches.test.ts :: a list offers only what the caller reaches > names a case in the audit by its title, and nothing written in it, to an administrator who does not reach it |
| Refusals are recorded, and a run of them is louder than one | A sign-in fails | undemonstrated | |
| Refusals are recorded, and a run of them is louder than one | One failure and a run of them | undemonstrated | |
| Refusals are recorded, and a run of them is louder than one | One caller, a different account each time | undemonstrated | |
| Refusals are recorded, and a run of them is louder than one | What the caller supplied is still recorded | demonstrated | server/test/a-sign-in-leaves-a-line.test.ts :: signing in leaves a line > records a refused sign-in, naming what was attempted and not what was typed |
| Refusals are recorded, and a run of them is louder than one | A stored seriousness is not lowered | undemonstrated | |
| Refusals are recorded, and a run of them is louder than one | A run whose lines recorded different things | undemonstrated | |
| Refusals are recorded, and a run of them is louder than one | A run whose lines recorded the same thing | undemonstrated | |
| Changing what the audit keeps is itself audited, and loudly | The retention window is shortened | undemonstrated | |
| Reading the audit is an act the audit records | An administrator reads the audit | undemonstrated | |
| Reading the audit is an act the audit records | An analyst who is not an administrator | demonstrated | server/test/analyst-privilege.test.ts :: an analyst who is not an administrator > is refused exactly the routes that are privileged, and no others |
| Reading the audit is an act the audit records | An administrator pages through the audit | undemonstrated | |
| The record is readable by the monitoring the organisation already runs | The audit is read by an external system | undemonstrated | |
| The record is readable by the monitoring the organisation already runs | An install is upgraded | undemonstrated | |

## interface

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The interface is layers, and each knows only what is beneath it | A control needs something from this application | undemonstrated | |
| The interface is layers, and each knows only what is beneath it | A screen needs data | undemonstrated | |
| The interface is layers, and each knows only what is beneath it | A layer reaches upward | undemonstrated | |
| Controls come from one place, and nothing above it builds its own | A screen needs a control that does not exist | undemonstrated | |
| Controls come from one place, and nothing above it builds its own | Somebody reaches for a primitive directly | undemonstrated | |
| Controls come from one place, and nothing above it builds its own | A second version of an existing control appears | undemonstrated | |
| Accessibility is why the controls layer exists | The interface is used without a pointer | undemonstrated | |
| Accessibility is why the controls layer exists | Something looks like a button and navigates | undemonstrated | |
| Accessibility is why the controls layer exists | Focus moves into a layer over the screen | undemonstrated | |
| A screen draws; it does not fetch, and it does not place itself | A screen is shown in an unusual state | undemonstrated | |
| A screen draws; it does not fetch, and it does not place itself | A screen is placed somewhere else | undemonstrated | |
| Every part can be seen on its own, in the states that matter | A part that presents data is shown in isolation | undemonstrated | |
| Every part can be seen on its own, in the states that matter | A part that presents no data is shown in isolation | undemonstrated | |
| Every part can be seen on its own, in the states that matter | A part is given nothing | undemonstrated | |
| The interface has one vocabulary, and it is not invented per screen | A screen needs a value the set does not have | undemonstrated | |
| The interface has one vocabulary, and it is not invented per screen | A name does not resolve | undemonstrated | |
| The interface has one vocabulary, and it is not invented per screen | An analyst has asked for less motion | undemonstrated | |
| What two screens both need is derived once | Two screens show the same derived answer | undemonstrated | |
| What two screens both need is derived once | A derivation needs to know its caller | undemonstrated | |
| A part's own documentation states what its caller owns | A part needs something the caller must supply | undemonstrated | |
| A part's own documentation states what its caller owns | A part is documented beside itself rather than within itself | undemonstrated | |
| A part's own documentation states what its caller owns | A part's documented behaviour is not its actual behaviour | undemonstrated | |
| A composition is exercised as a composition | A composition refuses an action | undemonstrated | |
| A composition is exercised as a composition | A composition is mid-write | undemonstrated | |
| A screen is exercised at the extremes of what it may hold | A screen is given almost nothing | undemonstrated | |
| A screen is exercised at the extremes of what it may hold | A screen is given far more than expected | undemonstrated | |
| A screen is exercised at the extremes of what it may hold | A screen supplies its own content | undemonstrated | |

## library

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| An install starts with useful content, and it is recognisable as the application's | A newly installed system | undemonstrated | |
| An install starts with useful content, and it is recognisable as the application's | An analyst chooses between entries | undemonstrated | |
| What ships is not edited, and disagreeing with it is done by copying it | An operator edits a shipped entry | undemonstrated | |
| What ships is not edited, and disagreeing with it is done by copying it | An operator wants a shipped entry to differ | undemonstrated | |
| What ships is not edited, and disagreeing with it is done by copying it | A local entry takes a shipped entry's name | undemonstrated | |
| Every kind of library content can be authored, not only chosen | An operator writes a new entry of any kind | unbuilt | Not built: a report layout cannot be authored. -> #53 |
| Every kind of library content can be authored, not only chosen | An operator arranges a report their own way | unbuilt | Not built: a report layout cannot be authored. -> #53 |
| An operator can withdraw what ships without deleting it | An operator withdraws a shipped entry | undemonstrated | |
| An operator can withdraw what ships without deleting it | A withdrawal is reversed | undemonstrated | |
| An install can be given its library as a document, and can read it back | An operator exports a library | demonstrated | server/test/library-as-code.test.ts :: a library as code > round-trips: what it serves is what it takes back |
| An install can be given its library as a document, and can read it back | A document with one bad entry is written back | undemonstrated | |
| Content only makes sense where the install has the thing it is for | A layout for a regime the install does not assess | undemonstrated | |

## live

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| A connection is admitted by its own checks, and their absence is silent | A connection is opened from another site | demonstrated | server/test/live-socket.test.ts :: the case socket > refuses a handshake from another origin |
| A connection is admitted by its own checks, and their absence is silent | A connection names a case the session does not reach | undemonstrated | |
| A connection is admitted by its own checks, and their absence is silent | A held account connects | undemonstrated | |
| A connection is admitted by its own checks, and their absence is silent | A check is removed | undemonstrated | |
| Presence says who is here now, and stops saying it by itself | An analyst joins | undemonstrated | |
| Presence says who is here now, and stops saying it by itself | A connection is lost without warning | undemonstrated | |
| Presence says who is here now, and stops saying it by itself | An analyst is in two places | undemonstrated | |
| A claim warns; it does not lock | An analyst claims an entry | undemonstrated | |
| A claim warns; it does not lock | Two analysts claim the same entry | undemonstrated | |
| A claim warns; it does not lock | A holder disappears | undemonstrated | |
| A claim warns; it does not lock | Somebody writes to a claimed entry | demonstrated | server/test/a-claimed-row-is-written-through-every-door.test.ts :: a row another analyst holds > takes every write another analyst makes, judged on its version alone |
| A claim warns; it does not lock | An analyst opens an entry another holds | demonstrated | ui/src/app/case/a-dialog-refusal-keeps-the-draft.test.tsx :: an entry another analyst holds, as the case socket reports it > names the holder in the edit dialog, and still saves the edit ; server/test/a-claimed-row-is-written-through-every-door.test.ts :: a row another analyst holds > takes every write another analyst makes, judged on its version alone |
| A change reaches every open screen, and says only what changed | Another analyst writes | undemonstrated | |
| A change reaches every open screen, and says only what changed | What travels over the connection | undemonstrated | |
| A change reaches every open screen, and says only what changed | A screen re-reads after an announcement | undemonstrated | |
| Written prose is edited together, not saved over | Two analysts write in one section | undemonstrated | |
| Written prose is edited together, not saved over | An analyst writes while disconnected | demonstrated | server/test/a-reconnected-editor-loses-nothing.test.ts :: an editor that drops and returns > receives what another analyst wrote while it was away, and merges what it wrote ; server/test/a-reconnected-editor-loses-nothing.test.ts :: an editor that drops and returns > loses nothing typed while down across network delays |
| Written prose is edited together, not saved over | One of the writers loses write before the words are stored | demonstrated | server/test/words-typed-together-outlive-one-writer-losing-reach.test.ts :: two analysts writing one note, one losing write > stores both sets of words, whoever still writes |
| Written prose is edited together, not saved over | The only writer loses write before the words are stored | demonstrated | server/test/accepted-words-are-kept-past-their-writers-reach.test.ts :: words accepted before their writer loses write > stores what the only writer typed before losing write, on the quiet moment, named for them ; server/test/accepted-words-are-kept-past-their-writers-reach.test.ts :: words accepted before their writer loses write > stores what the only writer typed before losing write when the last reader leaves, named for them ; server/test/accepted-words-are-kept-past-their-writers-reach.test.ts :: words accepted before their writer loses write > stores what the only writer typed before losing write as the application shuts down, named for them |
| Written prose is edited together, not saved over | A writer is disabled while writing | demonstrated | server/test/accepted-words-are-kept-past-their-writers-reach.test.ts :: words accepted before their writer loses write > ends a disabled writer's connection, refuses what they send after, and keeps what came before, named for them |
| Written prose is edited together, not saved over | A word arrives after write is withdrawn | demonstrated | server/test/accepted-words-are-kept-past-their-writers-reach.test.ts :: words accepted before their writer loses write > refuses a word sent after write is withdrawn, and never stores it |
| Written prose is edited together, not saved over | Words are addressed to a record in another case | demonstrated | server/test/accepted-words-are-kept-past-their-writers-reach.test.ts :: words accepted before their writer loses write > stores nothing into a record of another case the words were addressed to |
| A reconnection catches up rather than starts over | A connection drops briefly | undemonstrated | |
| A reconnection catches up rather than starts over | The gap is too large to fill | undemonstrated | |
| A reconnection catches up rather than starts over | A connection is lost | undemonstrated | |
| The connection dies with the reach that admitted it | Reach is withdrawn mid-session | demonstrated | server/test/reach-withdrawn-ends-what-was-open.test.ts :: an analyst whose reach is taken away > ends the connection it already had open ; server/test/reach-withdrawn-ends-what-was-open.test.ts :: an analyst whose reach is taken away > ends the connection when the customer leaves the group instead |
| The connection dies with the reach that admitted it | The case is deleted underneath a connection | demonstrated | server/test/live-socket.test.ts :: the case socket > the connection dies with the reach that admitted it > closes when the case underneath it is deleted |
| The connection dies with the reach that admitted it | A session ends while its connection is silent | demonstrated | server/test/a-socket-lives-only-as-long-as-its-authority.test.ts :: a socket and the authority that admitted it > closes a silent socket whose session window closed, within the sweep |
| The connection dies with the reach that admitted it | An account is held while connected | demonstrated | server/test/a-socket-lives-only-as-long-as-its-authority.test.ts :: a socket and the authority that admitted it > stops writing and closes once an administrator resets the password and holds the account |
| The connection dies with the reach that admitted it | An analyst signs out in one of two places | demonstrated | server/test/a-socket-lives-only-as-long-as-its-authority.test.ts :: a socket and the authority that admitted it > ends only the connections of the session that ended |
| The connection dies with the reach that admitted it | A connection is refused an edit | demonstrated | server/test/a-refused-socket-frame-is-recorded.test.ts :: a refused socket frame, beside a refused request > records a refused claim and a refused prose edit as refusals naming the case |
| Written prose is attributed like any other write | One of two analysts present writes | undemonstrated | |
| Written prose is attributed like any other write | Two analysts write before one save | undemonstrated | |
| Written prose is attributed like any other write | Words typed just before the report is sent | undemonstrated | |
| Deleted prose is not kept | A reader arrives after text was deleted | demonstrated | server/test/deleted-prose-is-not-kept.test.ts :: what the stored record keeps of prose > gives the next reader none of the text an analyst deleted over the live connection |
| Deleted prose is not kept | A section is removed | demonstrated | server/test/deleted-prose-is-not-kept.test.ts :: what the stored record keeps of prose > keeps nothing of a section once it is removed |
| An open connection is listening | A screen writes before the connection is ready | demonstrated | server/test/a-reconnected-editor-loses-nothing.test.ts :: an editor that drops and returns > makes a field opened before its connection is up ready |
| An open connection is listening | Preparing the connection does not complete | demonstrated | server/test/a-connection-acts-on-every-frame-in-order.test.ts :: a connection acts on every frame, in order > acts on nothing sent over a connection whose preparation fails |
| An open connection is listening | Frames are acted on in the order sent | demonstrated | server/test/a-connection-acts-on-every-frame-in-order.test.ts :: a connection acts on every frame, in order > leaves nothing held when a release is sent right behind its claim |
| An open connection is listening | A frame the install cannot read | demonstrated | server/test/a-connection-acts-on-every-frame-in-order.test.ts :: a connection acts on every frame, in order > acts on what follows a frame that is JSON and not an object, and still leaves |

## preferences

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| An analyst's own settings are theirs and reach nobody else | An analyst has chosen nothing | undemonstrated | |
| An analyst's own settings are theirs and reach nobody else | An analyst changes a setting | undemonstrated | |
| An analyst's own settings are theirs and reach nobody else | A setting the application does not offer | demonstrated | server/test/an-unoffered-setting-stores-nothing.test.ts :: a setting the application does not offer > refuses the request ; server/test/an-unoffered-setting-stores-nothing.test.ts :: a setting the application does not offer > stores neither the unknown key nor the valid one beside it |
| How an analyst is represented is theirs, and only that is shared | A colleague is drawn on a case | undemonstrated | |
| An image an analyst supplies is never the image the application serves | An analyst supplies an image | undemonstrated | |
| An image an analyst supplies is never the image the application serves | The bytes are not what the sender says | undemonstrated | |
| An image an analyst supplies is never the image the application serves | A format that can carry a program | undemonstrated | |
| An image an analyst supplies is never the image the application serves | Material carried alongside the picture | undemonstrated | |
| An upload is bounded before it is read, and a refusal says nothing useful to a sender | An upload larger than the install accepts | undemonstrated | |
| An upload is bounded before it is read, and a refusal says nothing useful to a sender | A small file describing an enormous image | undemonstrated | |
| An upload is bounded before it is read, and a refusal says nothing useful to a sender | Two uploads fail for different reasons | undemonstrated | |
| The application's own marks are readable before anybody has signed in | A browser opens the application | demonstrated | server/test/the-marks-are-served-before-a-session.test.ts :: the marks that identify the application > serves /favicon.ico to a browser with no session ; server/test/the-marks-are-served-before-a-session.test.ts :: the marks that identify the application > serves /favicon.svg to a browser with no session |
| The application's own marks are readable before anybody has signed in | The marks are read for what they disclose | demonstrated | server/test/the-marks-are-served-before-a-session.test.ts :: the marks that identify the application > serves /favicon.ico as the file that shipped it ; server/test/the-marks-are-served-before-a-session.test.ts :: the marks that identify the application > keeps the appearance an install chose behind a session |
| What an install decides is a closed set, and changing one is an administrative act | An operator sets something the install does not recognise | undemonstrated | |
| What an install decides is a closed set, and changing one is an administrative act | An analyst who is not an administrator changes an install setting | demonstrated | server/test/an-install-setting-is-an-administrative-act.test.ts :: changing what the install decides > refuses an analyst who is not an administrator |
| What an install decides is a closed set, and changing one is an administrative act | An install setting is changed | demonstrated | server/test/an-install-setting-is-an-administrative-act.test.ts :: changing what the install decides > takes the same change from an administrator, and files a line for it |

## reference

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| It is generated, and cannot disagree with what it describes | A field is added | undemonstrated | |
| It is generated, and cannot disagree with what it describes | A vocabulary changes | undemonstrated | |
| It is generated, and cannot disagree with what it describes | Something is not derivable | undemonstrated | |
| It answers the question an analyst has while working | An analyst does not know what a field wants | undemonstrated | |
| It answers the question an analyst has while working | The application is used in another language | unbuilt | Not built: the reference is served in one language. -> #224 |
| It says what it does not cover | Somebody asks whether the application does something | unbuilt | Not built: the reference states no boundaries. -> #225 |
| The open door describes the product and nothing else | Somebody with no account asks what the product holds | undemonstrated | |
| The open door describes the product and nothing else | Two installs of one version are asked | demonstrated | server/test/the-open-door-does-not-notice-the-install.test.ts :: an install somebody has extended > says exactly what it said before the install was extended |
| The open door describes the product and nothing else | An install has been extended | demonstrated | server/test/the-open-door-does-not-notice-the-install.test.ts :: an install somebody has extended > says exactly what it said before the install was extended |
| The door behind a session describes this install | An analyst reads what their install holds | undemonstrated | |
| The door behind a session describes this install | The permission is withdrawn | unbuilt | Not built: reading the reference is a session, not a permission. -> #222 |
| The door behind a session describes this install | An account is created | unbuilt | Not built: no permission is granted, so none is recorded. -> #222 |
| Configuration naming a customer is scoped to that customer | Configuration is added for one customer | unbuilt | Not built: library configuration carries no customer. -> #223 |
| Configuration naming a customer is scoped to that customer | An analyst reads the reference | unbuilt | Not built: library configuration carries no customer. -> #223 |
| Configuration naming a customer is scoped to that customer | A customer is named in shared configuration | unbuilt | Not built: nothing refuses a customer name in shared configuration. -> #223 |
| Configuration naming a customer is scoped to that customer | The reference is read by two analysts | unbuilt | Not built: library configuration carries no customer. -> #223 |

## report

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| A report is assembled from the case, not transcribed from it | The case changes under a draft report | undemonstrated | |
| A report is assembled from the case, not transcribed from it | An analyst writes an assessment | undemonstrated | |
| A sent report is frozen, and the freeze is one rule | A sent report is edited | undemonstrated | |
| A sent report is frozen, and the freeze is one rule | A part is moved into a sent report | undemonstrated | |
| A sent report is frozen, and the freeze is one rule | A new way to write a part is added | undemonstrated | |
| A sent report is frozen, and the freeze is one rule | Prose reaches a sent report | undemonstrated | |
| A sent report is frozen, and the freeze is one rule | The report a sent report corrects is removed | undemonstrated | |
| A report is sent and preserved, or neither | Any writer states half a sent report | demonstrated | server/test/an-archived-report-is-sent-and-preserved-or-neither.test.ts :: a report an archive says was sent > refuses a report that preserves a document and was never sent, and leaves no case behind ; server/test/an-archived-report-is-sent-and-preserved-or-neither.test.ts :: a report an archive says was sent > refuses a report that says it was sent and preserves nothing, and leaves no case behind |
| What the install generates in a document leaving it carries no live indicator | A report leaves the install | demonstrated | server/test/case-rows-reach-every-output.test.ts :: what a case holds reaches what it publishes > prints every indicator the case holds in the rendered report ; server/test/case-rows-reach-every-output.test.ts :: what a case holds reaches what it publishes > prints a web address written in a record as no live link |
| What the install generates in a document leaving it carries no live indicator | A preserved document is read in with a live address | demonstrated | server/test/an-archived-report-is-sent-and-preserved-or-neither.test.ts :: a report an archive says was sent > contains a live indicator an archive preserved, on the way in |
| Sending stamps and preserves in one act | A report is sent | undemonstrated | |
| Sending stamps and preserves in one act | The document cannot be produced | undemonstrated | |
| Sending stamps and preserves in one act | The case changes after sending | undemonstrated | |
| Sending stamps and preserves in one act | A part changes while the report is being sent | undemonstrated | |
| Sending stamps and preserves in one act | Prose is typed while the report is being sent | undemonstrated | |
| Sending stamps and preserves in one act | A send that fails while prose is typed | undemonstrated |  |
| Sending stamps and preserves in one act | A send is recorded | undemonstrated | |
| A correction is a new report, not an edit | A sent report is wrong | undemonstrated | |
| A correction is a new report, not an edit | Two corrections race | undemonstrated | |
| A correction is a new report, not an edit | A correction is recorded | undemonstrated | |
| The destination decides what a part may be | A report is exported | undemonstrated | |
| The destination decides what a part may be | A part cannot be drawn by a format | undemonstrated | |
| A report says what is missing before it is sent | A report is checked before sending | undemonstrated | |
| A report says what is missing before it is sent | A section was removed and is wanted back | undemonstrated | |
| A report says what is missing before it is sent | Two analysts restore the missing sections at once | undemonstrated | |
| The application's own words are in the report's language; the analyst's are the analyst's | A report is produced in a second language | undemonstrated | |
| The application's own words are in the report's language; the analyst's are the analyst's | A report is composed in a second language | undemonstrated | |
| The application's own words are in the report's language; the analyst's are the analyst's | The language a report is produced in is changed | demonstrated | ui/src/app/case/the-heading-pack-is-fetched-for-the-open-report.test.tsx :: the language the heading pack is fetched in > follows the report when the analyst changes it |
| The application's own words are in the report's language; the analyst's are the analyst's | Written prose is in another language | unbuilt | Not built: nothing reads the language of written prose. -> #229 |
| The application's own words are in the report's language; the analyst's are the analyst's | The analyst meant it | unbuilt | Not built: nothing records what was named and sent anyway. -> #229 |
| Which languages an install can write reports in is the administrator's to change | A language is added | undemonstrated |  |
| Which languages an install can write reports in is the administrator's to change | A language that ships with the application | undemonstrated | |
| Which languages an install can write reports in is the administrator's to change | A language is removed | undemonstrated | |
| Which languages an install can write reports in is the administrator's to change | A document exported before the language was removed | undemonstrated |  |
| Which languages an install can write reports in is the administrator's to change | A report produced after its language was removed | undemonstrated | |
| Which languages an install can write reports in is the administrator's to change | A file that is not a language | undemonstrated | |
| Which languages an install can write reports in is the administrator's to change | A language carrying words the application has no place for | undemonstrated | |
| Which languages an install can write reports in is the administrator's to change | An incomplete language is managed | demonstrated | ui/src/components/blocks/languages-pane.stories.tsx :: A pack four strings short |
| A report is for an audience, and the audience decides what it owes | A report is created | unbuilt | Not built: a report records no audience. -> #228 |
| A report is for an audience, and the audience decides what it owes | A layout omits something the audience requires | unbuilt | Not built: what a report owes is read from its layout, not its audience. -> #228 |
| A report never carries another customer's data | A report carries a row from another customer | unbuilt | Not built: the boundary is held at the write and at the evidence store, and no export refuses. -> #227 |
| A report never carries another customer's data | The offending part is removed | unbuilt | Not built: no export refusal to lift. -> #227 |
| Material an audience does not expect is named, and the analyst decides | An internal note is in a customer report | unbuilt | Not built: no audience, so nothing to measure material against. -> #229 |
| Material an audience does not expect is named, and the analyst decides | The analyst sends it anyway | unbuilt | Not built: nothing records what was named and sent anyway. -> #229 |
| The report an analyst is reading is in the address | A link names a report | demonstrated | ui/src/app/case/ReportContainer.address.test.tsx :: a report has an address > opens the report the address names |
| The report an analyst is reading is in the address | A reload keeps the analyst's place | demonstrated | ui/src/app/case/ReportContainer.address.test.tsx :: a report has an address > opens the report the address names |
| The report an analyst is reading is in the address | The address moves to a second report | demonstrated | ui/src/app/case/ReportContainer.address.test.tsx :: a report has an address > follows the address to a second report without remounting |
| The report an analyst is reading is in the address | The address moves back to the index | demonstrated | ui/src/app/case/ReportContainer.address.test.tsx :: a report has an address > follows the address back to the index |
| The report an analyst is reading is in the address | Opening a report does not stack a history entry | demonstrated | ui/src/app/case/ReportContainer.address.test.tsx :: a report has an address > replaces the address rather than stacking an entry per report |
| The report an analyst is reading is in the address | The address carries something else as well | demonstrated | ui/src/app/case/ReportContainer.address.test.tsx :: a report has an address > leaves the rest of the address alone |
| The report an analyst is reading is in the address | A command travelled on the address and has been run | demonstrated | ui/src/app/case/ReportContainer.address.test.tsx :: a report has an address > leaves the New report dialog shut after the command that opened it |
| A case's reports are navigation, and are reachable from every section | An analyst is reading another part of the case | undemonstrated | |
| A case's reports are navigation, and are reachable from every section | A report is opened from elsewhere in the case | undemonstrated | |
| A case's reports are navigation, and are reachable from every section | A case holds no reports | demonstrated | ui/src/screens/report-section.stories.tsx :: A case with no reports |
| A case's reports are navigation, and are reachable from every section | The address names a report the case no longer holds | undemonstrated | |
| A case's reports are navigation, and are reachable from every section | The analyst leaves the section that draws a report | undemonstrated | |
| A report filed under a regime records which step of it the report is | A filing is created from the layout that files it | undemonstrated | |
| A report filed under a regime records which step of it the report is | A layout whose title is not the name of a step | undemonstrated | |
| A report filed under a regime records which step of it the report is | An ordinary layout | undemonstrated | |

## state

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| What may be lost and what may not are separated by design | The ephemeral store is emptied | demonstrated | server/test/losing-the-ephemeral-store-loses-no-investigation.test.ts :: losing everything ephemeral > leaves the investigation byte-for-byte where it was ; server/test/losing-the-ephemeral-store-loses-no-investigation.test.ts :: losing everything ephemeral > leaves the analyst able to keep working |
| What may be lost and what may not are separated by design | The ephemeral store is unavailable at start | undemonstrated | |
| What may be lost and what may not are separated by design | A durable write is attempted while the ephemeral store is down | undemonstrated | |
| The application cannot reach a row it should not, even by mistake | A query forgets its boundary | undemonstrated | |
| The application cannot reach a row it should not, even by mistake | The application attempts to widen its own reach | undemonstrated | |
| The application cannot reach a row it should not, even by mistake | A new table holding case data is added | undemonstrated | |
| The application cannot reach a row it should not, even by mistake | An operation names a case its caller does not reach | demonstrated | server/test/a-route-that-forgets-its-guard-serves-nothing.test.ts :: a case route with its guard forgotten > serves none of a case out of reach through any route ; server/test/a-route-that-forgets-its-guard-serves-nothing.test.ts :: a case route with its guard forgotten > writes nothing into a case out of reach through a route |
| The application cannot reach a row it should not, even by mistake | Nobody is named as asking | undemonstrated | |
| The application cannot reach a row it should not, even by mistake | A write names a row of a case its caller does not reach | demonstrated | server/test/a-sent-report-says-nothing-to-a-writer-out-of-its-reach.test.ts :: a part naming a sent report out of the writer's reach > refuses it through the routes, naming nothing of it ; server/test/a-sent-report-says-nothing-to-a-writer-out-of-its-reach.test.ts :: a part naming a sent report out of the writer's reach > refuses it at the store as it refuses a report that does not exist, naming nothing and waiting on nothing |
| Changing the shape of the store is a separate power | The application attempts to change the schema | undemonstrated | |
| Changing the shape of the store is a separate power | A schema change is applied | undemonstrated | |
| A version is what a write is checked against, and it lives with the row | A write and its record are one act | undemonstrated | |
| A version is what a write is checked against, and it lives with the row | A write arrives against a version that has moved | undemonstrated | |
| A version is what a write is checked against, and it lives with the row | A record is served again while an analyst is changing a field | demonstrated | ui/src/app/case/overview-writes-against-what-was-read.test.tsx :: a case field another analyst saves while this analyst is changing it > is not written over theirs when the analyst leaves it, and shows both values |
| A version is what a write is checked against, and it lives with the row | A record is served again with a change to another field | demonstrated | ui/src/app/case/overview-writes-against-what-was-read.test.tsx :: a case field another analyst did not touch > is stored against the newer version when theirs was announced first ; ui/src/app/case/overview-writes-against-what-was-read.test.tsx :: a case field another analyst did not touch > is stored when theirs landed but was not yet announced ; ui/src/app/case/overview-writes-against-what-was-read.test.tsx :: a case field another analyst did not touch > is stored when theirs is announced while the refused write is still out |
| A version is what a write is checked against, and it lives with the row | A field the analyst only visited follows the server | demonstrated | ui/src/app/case/overview-writes-against-what-was-read.test.tsx :: a case field another analyst saves while this analyst is changing it > sends nothing for a field the analyst only put the cursor in |
| A version is what a write is checked against, and it lives with the row | Leaving a field in collision stores nothing | demonstrated | ui/src/app/case/overview-writes-against-what-was-read.test.tsx :: a case field another analyst saves while this analyst is changing it > is not written over theirs when the analyst leaves it, and shows both values |
| A version is what a write is checked against, and it lives with the row | An analyst keeps their own value | demonstrated | ui/src/app/case/overview-writes-against-what-was-read.test.tsx :: a case field another analyst saves while this analyst is changing it > stores the analyst value over theirs when the analyst keeps it |
| A version is what a write is checked against, and it lives with the row | An analyst takes the other value | demonstrated | ui/src/app/case/overview-writes-against-what-was-read.test.tsx :: a case field another analyst saves while this analyst is changing it > stores nothing when the analyst takes theirs |
| A version is what a write is checked against, and it lives with the row | One analyst changes a record faster than it is answered | demonstrated | ui/src/app/case/overview-writes-against-what-was-read.test.tsx :: one analyst alone on the Overview > stores two fields left inside one round trip, and blames nobody |
| A version is what a write is checked against, and it lives with the row | A refused change is not shown as made | demonstrated | ui/src/app/case/overview-writes-against-what-was-read.test.tsx :: a case field another analyst saves while this analyst is changing it > says the change is not saved while the refusal is checked, then shows what the server holds ; ui/src/app/case/overview-writes-against-what-was-read.test.tsx :: a case field another analyst saves while this analyst is changing it > keeps what the analyst typed when the refusal arrives before the announcement |
| A version is what a write is checked against, and it lives with the row | A change made in a dialog is refused | demonstrated | ui/src/app/case/a-dialog-refusal-keeps-the-draft.test.tsx :: an edit dialog on 'Entities' > stays open holding the draft, and names the field and the value that stands ; ui/src/app/case/a-dialog-refusal-keeps-the-draft.test.tsx :: an edit dialog on 'Entities' > stores the draft once the analyst keeps it after a refused save |
| The store is not migrated while the shape is still moving | Data from an older shape is presented | undemonstrated | |
| What is kept forever is decided, not defaulted | A record reaches the end of its life | undemonstrated | |
| What is kept forever is decided, not defaulted | A retention period is shortened below an obligation | unbuilt | Not built: no retention period names an obligation. -> #240 |
| Evidence is wrapped, and the wrapping is containment rather than confidentiality | Evidence is stored | undemonstrated | |
| Evidence is wrapped, and the wrapping is containment rather than confidentiality | The same artefact arrives twice | undemonstrated | |
| Evidence is wrapped, and the wrapping is containment rather than confidentiality | Evidence is downloaded | undemonstrated | |
| Evidence is wrapped, and the wrapping is containment rather than confidentiality | Somebody treats the wrapping as protection | undemonstrated | |
| Evidence is wrapped, and the wrapping is containment rather than confidentiality | An operator asks what protects the state at rest | undemonstrated | |
| What is stored can be recovered, and the recovery is proven | An install is restored from a copy | undemonstrated | |
| What is stored can be recovered, and the recovery is proven | A copy is taken | demonstrated | tests/docker/test_ingress.py :: test_a_copy_is_readable_only_by_whoever_took_it |
| What is stored can be recovered, and the recovery is proven | Only the database was restored | undemonstrated | |
| What is stored can be recovered, and the recovery is proven | A case is opened with its evidence missing | undemonstrated | |
| What is stored can be recovered, and the recovery is proven | The artefacts are restored afterwards | undemonstrated | |
| What is stored can be recovered, and the recovery is proven | A damaged copy is checked | undemonstrated | |
| What is stored can be recovered, and the recovery is proven | A copy from another shape is restored | undemonstrated | |
| An artefact is reached only through the case that holds it | A digest is named in another case | demonstrated | server/test/a-digest-reaches-nothing-outside-its-case.test.ts :: an artefact is reached only through the case that holds it > shows the holder their own artefacts in every output the others are checked in ; server/test/a-digest-reaches-nothing-outside-its-case.test.ts :: an artefact is reached only through the case that holds it > serves an account that reaches nothing of customer B none of it by naming its digests |
| An artefact is reached only through the case that holds it | Reach is withdrawn from an analyst who read a digest | demonstrated | server/test/a-digest-reaches-nothing-outside-its-case.test.ts :: an artefact is reached only through the case that holds it > serves an analyst whose reach to it was withdrawn none of it by naming its digests |
| An artefact is reached only through the case that holds it | A handover is read in by somebody who does not reach the case | demonstrated | server/test/a-digest-reaches-nothing-outside-its-case.test.ts :: an artefact is reached only through the case that holds it > gives a stranger re-reading a handover none of what it withheld |
| An artefact is reached only through the case that holds it | The same artefact is attached in two cases | demonstrated | server/test/a-digest-reaches-nothing-outside-its-case.test.ts :: an artefact is reached only through the case that holds it > writes an upload of the same bytes into the uploader’s own case, under their own name ; server/test/a-digest-reaches-nothing-outside-its-case.test.ts :: an artefact is reached only through the case that holds it > leaves nothing of a deleted case to name |
| An artefact is reached only through the case that holds it | An artefact nothing names any more | demonstrated | server/test/a-deleted-case-leaves-no-artefact.test.ts :: what a case stored goes when nothing names it > when a row stops naming its bytes > removes them when the row is deleted ; server/test/a-deleted-case-leaves-no-artefact.test.ts :: what a case stored goes when nothing names it > when a row stops naming its bytes > removes them when a selection takes the row ; server/test/a-deleted-case-leaves-no-artefact.test.ts :: what a case stored goes when nothing names it > when a row stops naming its bytes > removes what a row held before its file was replaced ; server/test/a-deleted-case-leaves-no-artefact.test.ts :: what a case stored goes when nothing names it > when a row stops naming its bytes > keeps them while another row of the case still names them ; server/test/a-deleted-case-leaves-no-artefact.test.ts :: what a case stored goes when nothing names it > when a row stops naming its bytes > removes one case’s copy and keeps the other case’s ; server/test/a-deleted-case-leaves-no-artefact.test.ts :: what a case stored goes when nothing names it > when a row stops naming its bytes > a figure a sent report froze > is kept when its row names other bytes, and the report still draws it |
| An artefact is reached only through the case that holds it | Bytes are attached while a record naming them goes | demonstrated | server/test/a-deleted-case-leaves-no-artefact.test.ts :: what a case stored goes when nothing names it > when a row stops naming its bytes > keeps bytes being attached to one row while another row naming them is deleted |
| An artefact is reached only through the case that holds it | Bytes arrive that no record comes to name | demonstrated | server/test/a-deleted-case-leaves-no-artefact.test.ts :: what a case stored goes when nothing names it > when a row stops naming its bytes > leaves nothing behind when the row moved while its bytes arrived ; server/test/a-deleted-case-leaves-no-artefact.test.ts :: what a case stored goes when nothing names it > when a row stops naming its bytes > keeps none of what an archive carried that nothing in its case names |
| An artefact is reached only through the case that holds it | The install starts beside a database that does not hold a case | undemonstrated | |
| An artefact is reached only through the case that holds it | The install starts beside a database older than a record | undemonstrated | |

## the-api

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The interface is the product, and the screens are a consumer | A screen does something no caller can | undemonstrated | |
| The interface is the product, and the screens are a consumer | A rule is enforced only in the client | demonstrated | server/test/the-interface-refuses-it-too.test.ts :: the interface refuses what the screen would > refuses a body carrying a field systems does not have |
| A caller asks for what it needs and receives no more | A screen needs a handful of fields | unbuilt | Not built: no route takes a field selection. -> #59 |
| A caller asks for what it needs and receives no more | A record grows a field | unbuilt | Not built: no route takes a field selection. -> #59 |
| A caller asks for what it needs and receives no more | A caller wants everything | undemonstrated | |
| Reach is enforced where the data is, not where the request arrives | A caller composes a request nobody anticipated | undemonstrated | |
| Reach is enforced where the data is, not where the request arrives | A new way to read a record is added | undemonstrated | |
| Reach is enforced where the data is, not where the request arrives | A route forgets to ask | demonstrated | server/test/a-route-that-forgets-its-guard-serves-nothing.test.ts :: a case route with its guard forgotten > serves none of a case out of reach through any route ; server/test/a-route-that-forgets-its-guard-serves-nothing.test.ts :: a case route with its guard forgotten > writes nothing into a case out of reach through a route |
| Reach is enforced where the data is, not where the request arrives | A route forgets to ask before it writes | undemonstrated |  |
| A read tells a caller what it is looking at | A caller reads and later writes | undemonstrated | |
| A read tells a caller what it is looking at | Somebody wrote first | undemonstrated | |
| The interface describes itself, and the description is generated | A route is added | undemonstrated | |
| The interface describes itself, and the description is generated | A route changes shape | undemonstrated | |
| The interface describes itself, and the description is generated | A route served by a library the application mounts | undemonstrated | |
| A refusal says which of the caller's problems it is | A caller asks for something out of reach | demonstrated | server/test/not-there-and-not-yours-look-alike.test.ts :: not there and not yours look alike > answers a case out of reach exactly as it answers one that is not there ; server/test/not-there-and-not-yours-look-alike.test.ts :: not there and not yours look alike > refuses with not-found rather than forbidden |
| A refusal says which of the caller's problems it is | A caller sends a body the interface cannot accept | demonstrated | server/test/every-write-door-refuses-a-version-past-its-column.test.ts :: every door that takes a version refuses one no reader produced > refuses a version no reader could have read at 422, naming it, at each of them |
| A refusal says which of the caller's problems it is | A caller times the refusal | undemonstrable | A duration is measured, and a refusal's reveals nothing only as a distribution. What makes the two take the same time is shown by server/test/a-refusal-does-the-same-work-whether-or-not-the-case-exists.test.ts, which asserts the same statements before either answer; that is evidence of the mechanism, not a demonstration of the clock. |
| A refusal says which of the caller's problems it is | A write depends on another customer's data | demonstrated | server/test/a-move-says-nothing-about-a-customer-the-mover-does-not-reach.test.ts :: moving a case to a customer > refuses a referenced case the same way whether or not the customer holds its reference ; server/test/a-reference-says-nothing-about-another-customer.test.ts :: a write naming a row of another customer > answers a reference to a row of another customer as it answers one to no row |
| What a request costs is bounded before it runs | A caller asks for too much at once | undemonstrated | |
| What a request costs is bounded before it runs | A caller asks too often | demonstrated | server/test/a-caller-that-asks-too-often-is-told-when-to-return.test.ts :: a caller asking faster than the install permits > lets the permitted number through and refuses the rest ; server/test/a-caller-that-asks-too-often-is-told-when-to-return.test.ts :: a caller asking faster than the install permits > names how long the caller must wait |
| What a request costs is bounded before it runs | Another caller asks too often | undemonstrated | |
| What a request costs is bounded before it runs | A page on another site asks on the analyst's behalf | undemonstrated | |
| What a request costs is bounded before it runs | A page on another site calls the install on the analyst's behalf | undemonstrated | |
| A fact can be asked for across cases | An indicator is asked about across cases | unbuilt | Not built: nothing answers a question spanning cases. -> #236 |
| A fact can be asked for across cases | A question spans a boundary | unbuilt | Not built: nothing answers a question spanning cases. -> #236 |
| The description is valid against the version it declares | A schema uses a keyword the declared version has no spelling for | undemonstrated | |
| The description is valid against the version it declares | The generator's dialect moves | undemonstrated | |
| The description is valid against the version it declares | A caller generates a client | undemonstrated | |

## transport

| Requirement | Scenario | Status | Evidence or reason |
| --- | --- | --- | --- |
| The browser is told what the application may do, on every response | A response is read by a browser | demonstrated | tests/docker/test_ingress.py :: test_a_page_and_an_answer_from_the_interface_carry_one_policy_through_the_edge |
| The browser is told what the application may do, on every response | The install answers without the application | demonstrated | tests/docker/test_ingress.py :: test_an_answer_the_edge_writes_itself_is_read_under_a_policy ; tests/docker/test_ingress.py :: test_an_answer_the_edge_writes_while_the_application_is_down_is_read_under_a_policy |
| The browser is told what the application may do, on every response | The policy is read for what it permits | demonstrated | server/test/security-headers.test.ts :: every response > carries one content policy, on the application and on the API alike ; server/test/security-headers.test.ts :: every response > does not permit eval, whose only reason has been deleted |
| The browser is told what the application may do, on every response | The browser must reach the analyst's identity provider | unbuilt | Not built: no identity provider integration. Kept normative. -> #59 |
| The browser is told what the application may do, on every response | An install pointed at nothing outside itself | undemonstrated | |
| The browser is told what the application may do, on every response | The analyst's browser must reach an import platform | undemonstrated | |
| The application refuses to be framed | A page tries to embed the application | demonstrated | tests/docker/test_ingress.py :: test_a_page_and_an_answer_from_the_interface_carry_one_policy_through_the_edge ; tests/docker/test_ingress.py :: test_an_answer_the_edge_writes_itself_is_read_under_a_policy |
| Case data is not left on the analyst's disk | An analyst reads a case and signs out | demonstrated | server/test/security-headers.test.ts :: what a browser may keep > refuses the browser a copy of /api/cases |
| Case data is not left on the analyst's disk | An unchanging asset is served | demonstrated | server/test/security-headers.test.ts :: what a browser may keep > leaves a route that asked to be cached alone |
| An install reached at its own name tells the browser to keep it protected | An install reached at its own name | undemonstrated | |
| An install reached at its own name tells the browser to keep it protected | An analyst follows an unprotected link afterwards | undemonstrable | What a browser does after being told is the browser's; no suite here drives one through a certificate an analyst has chosen to trust |
| An install reached at its own name tells the browser to keep it protected | An install reached at a loopback address | demonstrated | tests/docker/test_container_runtime.py :: test_an_install_at_loopback_is_never_told_to_stay_protected[127.0.0.1] ; tests/docker/test_container_runtime.py :: test_an_install_at_loopback_is_never_told_to_stay_protected[localhost] |
| The application answers only to itself | The install is reached at a loopback address | undemonstrated | |
| The application answers only to itself | The unprotected spelling of the install | undemonstrated | |
| The application answers only to itself | Another port on the same host | undemonstrated | |
| The application answers only to itself | The install cannot tell where it is | undemonstrated | |
| The application answers only to itself | A socket is opened from the unprotected spelling of the install | undemonstrated | |
| A development convenience cannot exist in a running install | A running install | undemonstrated | |
| A development convenience cannot exist in a running install | A development install with no port named | undemonstrated | |
| A request for data is never answered with a page | A caller asks for a route the interface does not have | demonstrated | server/test/a-data-request-is-never-a-page.test.ts :: a request for data is never answered with a page > /api/nonsense says it does not exist, in JSON ; server/test/a-data-request-is-never-a-page.test.ts :: a request for data is never answered with a page > /api/cases/abc/timeline/deeper/still says it does not exist, in JSON |
| A request for data is never answered with a page | An analyst reloads on a case | undemonstrated | |
