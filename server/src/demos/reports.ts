/**
 * The reports the demo cases ship with: 18 reports, 91 sections, generated
 * rather than retyped.
 */
import type { DemoReport } from './content.js'

export const DEMO_REPORTS: Readonly<Record<string, readonly DemoReport[]>> = {
  // Guided incident
  'DEMO-2026-001': [
    {
      label: 'Customer RCA',
      template: 'standard',
      tlp: 'TLP:AMBER',
      language: 'en',
      status: 'draft',
      createdAtMinute: 0,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          headingKey: 'heading.exec_summary',
          body:
            'A phishing email delivered to two finance mailboxes led to credential theft and an attempted upload of a financial archive. The SOC detected the intrusion 20 minutes after delivery and contained it within 90. No data left the estate.\n' +
            '\n' +
            'The message impersonated a supplier Acme Corp had invoiced the week before, and carried a macro-enabled attachment named `invoice_update.exe`. Both recipients sit in the finance OU, where macro execution was **not** blocked by policy. One recipient opened the attachment; the second reported it to the service desk nine minutes later, which is what brought the campaign to the SOC\'s attention rather than an automated detection.\n' +
            '\n' +
            'From the compromised workstation the attacker enumerated cached credentials and reached the `svc-backup` service account, which held write access across three file shares it had no reason to touch. That account was used to stage a 340MB archive of the finance share and to begin an upload to a public paste site. The egress attempt failed against the proxy\'s file-size limit rather than against any rule written for this traffic, so the outcome was closer to chance than to control.\n' +
            '\n' +
            'Containment isolated the workstation, disabled the account and invalidated its sessions. Acme Corp is not treating this as a reportable incident: no personal data left the estate, and the significance thresholds are not met on any limb.',
        },
        { kind: 'ribbon' },
        { kind: 'techniques' },
        {
          kind: 'written',
          headingKey: 'heading.root_cause',
          body:
            'Macro execution was not blocked by policy on the finance OU, and the `svc-backup` service account held write access well beyond its purpose. Neither is a failure of detection; both are standing configuration that made a single opened attachment worth an estate.\n' +
            '\n' +
            '### Why the macro ran\n' +
            '\n' +
            'The finance OU was excluded from the macro-blocking policy in 2024 to keep a supplier\'s reconciliation workbook working, and the exclusion outlived the workbook. Nothing reviewed it, because the exclusion is recorded against the OU rather than against the application that needed it, so there is no artefact naming a reason anyone could later find and retire.\n' +
            '\n' +
            '### Why one workstation reached three shares\n' +
            '\n' +
            '`svc-backup` is a single account used by the nightly job for every share it protects, and it is a member of a group granting write rather than the read its job performs. Its credential was cached on the workstation from an interactive logon during a restore test.\n' +
            '\n' +
            '### What worked\n' +
            '\n' +
            'The second recipient reporting the message is what started the response. The proxy\'s file-size limit stopped the upload. Both are worth stating because neither was a control designed for this: treating them as evidence the estate is covered would be the wrong reading of a good outcome.',
        },
        { kind: 'timeline' },
        { kind: 'technique_table' },
        { kind: 'entities' },
        {
          kind: 'written',
          headingKey: 'heading.recommendations',
          body:
            'Ordered by what closes the path that was actually used, not by effort. The first two would each have stopped this incident on their own.\n' +
            '\n' +
            '1. **Enforce macro blocking for the finance OU.** Remove the 2024 exclusion and record any replacement against the *application* that needs it, with a review date, so the next exclusion has something to expire.\n' +
            '2. **Reduce `svc-backup` to least privilege and rotate its credential.** The nightly job reads; the account writes. Split it per share while it is being changed anyway, so one cached credential stops being one key to all three.\n' +
            '3. **Stop interactive logons with service accounts.** The credential was on the workstation because a restore test put it there. A deny policy costs nothing and removes the step between a workstation and the shares.\n' +
            '4. Add an egress rule for known paste sites. Worth doing, and listed fourth deliberately: it addresses this attacker\'s chosen destination rather than the access that made any destination reachable.\n' +
            '\n' +
            '> The proxy\'s file-size limit is not a control for this and should not be recorded as one.',
        },
      ],
    },
    {
      label: 'Shift handover brief',
      template: 'standard',
      tlp: 'TLP:RED',
      language: 'en',
      status: 'final',
      createdAtMinute: 100,
      sentAtMinute: 102,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Handover to the incoming shift',
          body:
            '**Open, contained, not eradicated.** WKS-FINANCE01 is isolated and j.doe is disabled. `svc-backup` is still enabled and is the account that made the lateral move -- it is not disabled because the backup job runs at 02:00 and the owner has not yet been reached.\n' +
            '\n' +
            'Two things need a decision, not analysis:\n' +
            '\n' +
            '1. Whether to disable `svc-backup` and accept the failed backup, or wait for the application owner. Escalate if not reached by 01:00.\n' +
            '2. The paste destination is unconfirmed. The proxy log query is running; if it returns a successful POST this becomes a data breach and the notification clock starts.\n' +
            '\n' +
            '> Nothing here needs re-triaging. The timeline is complete to 04:00.',
        },
        { kind: 'actions' },
      ],
    },
  ],
  // Cloud account takeover
  'DEMO-2026-014': [
    {
      label: 'Customer RCA',
      template: 'standard',
      tlp: 'TLP:AMBER',
      language: 'en',
      status: 'draft',
      createdAtMinute: 0,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          headingKey: 'heading.exec_summary',
          body:
            'A consent-phishing email led a finance controller to authorise a rogue OAuth application, giving an attacker mailbox and file access with no malware involved. The attacker attempted invoice fraud; the payment was held before it settled.\n' +
            '\n' +
            '**No endpoint was compromised and no file was executed.** That is the fact most likely to be misread from the timeline: every action in this case was performed by an application the tenant had been asked to trust, using tokens it was issued. Endpoint tooling had nothing to report because nothing happened on an endpoint.\n' +
            '\n' +
            'The message asked the controller to review a shared invoice and led to a consent screen for an application named *Invoice Sync Plus*, published by "Brightlane Apps Ltd". Consent was granted at 09:14. The application requested mailbox read, mail send and offline access, and the tenant permitted users to consent to unverified publishers.\n' +
            '\n' +
            'Within the hour the attacker created a mailbox rule filing messages from two suppliers into an unread folder, then replied to a live invoice thread with amended bank details. The reply came from the controller\'s own mailbox and sat in the correct thread, so nothing about it read as external.\n' +
            '\n' +
            'The payment was held by the supplier\'s own callback procedure, not by any control at the customer. Legacy authentication was not blocked, so the refresh token remained usable from any location until consent was revoked.',
        },
        {
          kind: 'figure',
          heading: 'Consent screen',
          body:
            'ab95e39e0dae44abb2c28f900044a18a',
        },
        { kind: 'ribbon' },
        { kind: 'techniques' },
        {
          kind: 'written',
          headingKey: 'heading.root_cause',
          body:
            'Users could grant consent to unverified third-party applications, and legacy authentication was not blocked, so a stolen refresh token was usable from any location.\n' +
            '\n' +
            '### Consent was a user decision\n' +
            '\n' +
            'The tenant left user consent enabled for unverified publishers, which is the default. That places an authorisation decision on whoever is reading the message -- and the consent screen names the *application*, not the publisher\'s verification state, so the one fact that would have mattered was the least prominent thing on it. Treating this as a training failure would be the wrong conclusion: the control was delegated to the person under time pressure by design.\n' +
            '\n' +
            '### The token outlived the session\n' +
            '\n' +
            'With legacy authentication permitted, the refresh token the application received was usable from any address, indefinitely, and independently of the controller\'s own sign-ins. Password rotation would have done nothing. Only revoking consent ended the access, which is why the containment step here is not the one an endpoint incident would suggest.\n' +
            '\n' +
            '### Why the fraud nearly worked\n' +
            '\n' +
            'The mailbox rule hid the supplier\'s replies from the controller, and the attacker\'s message went out from the genuine mailbox inside the genuine thread. There is no artefact for a recipient to inspect. The payment was held by the supplier\'s callback procedure -- a control at the other organisation, outside anything this customer operates.',
        },
        { kind: 'timeline' },
        { kind: 'technique_table' },
        { kind: 'entities' },
        {
          kind: 'written',
          headingKey: 'heading.recommendations',
          body:
            'Ordered by what removes the decision from the person being phished. The first two would each have ended this incident before consent mattered.\n' +
            '\n' +
            '1. **Require admin consent for all third-party applications.** This is the control the incident turned on. Pair it with a request workflow, or consent moves to whoever approves fastest and the review becomes a formality.\n' +
            '2. **Block legacy authentication with conditional access.** A refresh token usable from any location is why password rotation was no help and why revoking consent was the only containment available.\n' +
            '3. **Alert on new mailbox forwarding and filing rules to external domains.** The rule hiding the supplier\'s replies was created within the hour and was the earliest observable in the whole case.\n' +
            '4. Review which applications already hold consent in this tenant. This one was found because it was used; the audit answers what else is holding tokens nobody has looked at.\n' +
            '\n' +
            '> The payment was stopped by the supplier\'s callback procedure, not by any control at the customer. The report should say so plainly rather than let the outcome read as a defence that worked.',
        },
      ],
    },
    {
      label: 'Article 33 notification (AP)',
      template: 'standard',
      tlp: 'TLP:AMBER+STRICT',
      language: 'en',
      status: 'final',
      createdAtMinute: 200,
      sentAtMinute: 240,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Nature of the personal data breach',
          body:
            'A third party held read access to one finance mailbox and to a finance SharePoint library for approximately 3 hours 20 minutes, via an OAuth application the account holder was deceived into authorising.\n' +
            '\n' +
            'Categories of data: business contact details, supplier bank details and invoice correspondence. Two files were exfiltrated. The affected data subjects are supplier contacts rather than employees or consumers, which is why the assessed severity sits below the Article 34 threshold.\n' +
            '\n' +
            'Access was terminated by revoking the application\'s consent and its refresh tokens. A password reset alone did not end the access, and the notification should not imply that it did.',
        },
        { kind: 'impact' },
        { kind: 'actions' },
      ],
    },
    {
      label: 'Supplier fraud advisory',
      template: 'standard',
      tlp: 'TLP:GREEN',
      language: 'en',
      status: 'draft',
      createdAtMinute: 210,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Advisory to affected suppliers',
          body:
            'A message appearing to come from our accounts payable team asked for a change of bank details. It did not come from us.\n' +
            '\n' +
            'The message was sent from a genuine mailbox in our tenant, so ordinary sender checks would have passed it. Treat any bank-detail change received in the affected window as unverified until confirmed by telephone on a number you already hold.\n' +
            '\n' +
            '> Marked TLP:GREEN: this is meant to be shared onward inside a recipient\'s finance function, which is the whole reason it exists as a separate document rather than a paragraph in the RCA.',
        },
        { kind: 'indicators' },
      ],
    },
  ],
  // Major campaign
  'DEMO-2026-031': [
    {
      label: 'Customer RCA',
      template: 'standard',
      tlp: 'TLP:RED',
      language: 'en',
      status: 'draft',
      createdAtMinute: 0,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          headingKey: 'heading.exec_summary',
          body:
            'A macro-enabled phishing email led to a human-operated ransomware incident that spread domain-wide, exfiltrated finance, HR and directory data, and encrypted four servers and fourteen workstations.\n' +
            '\n' +
            'The operator was inside the estate for **six days** before the first encryption. That dwell time is the material fact of this case: the encryption is what was noticed, and it was the last thing to happen rather than the incident itself. Directory, finance and HR data had already left by the time any alert fired.\n' +
            '\n' +
            'Initial access was a macro-enabled attachment opened on a standard workstation. Within four hours the operator had dumped cached credentials and recovered `svc-backup`, a service account holding domain admin. From there the estate offered no further obstacle: no tiering separated the workstation from the domain controllers, and the backup server authenticated the same account.\n' +
            '\n' +
            'Approximately 12GB was staged and uploaded over the following two days in transfers small enough to stay under the egress thresholds configured for bulk transfer. Encryption began on day six, out of hours, and reached the backup server first.\n' +
            '\n' +
            'Recovery ran from an offline copy eleven days old. Everything written between that copy and the encryption is gone. This is a reportable incident on both the availability and the confidentiality limb, and the notification clock runs from the first detection rather than from the first access.',
        },
        { kind: 'ribbon' },
        { kind: 'techniques' },
        {
          kind: 'written',
          headingKey: 'heading.root_cause',
          body:
            'A domain-admin service account (`svc-backup`) was reachable from a standard workstation and had access to the backup server, so one credential dump gave the operator the whole estate.\n' +
            '\n' +
            '### The flat administrative tier\n' +
            '\n' +
            '`svc-backup` is a member of Domain Admins because the backup product was installed that way in 2019 and the requirement was never revisited. Its credential was cached on the workstation from a restore performed there. No tiering model separates workstation logons from domain administration, so recovering one cached secret was the whole of privilege escalation in this incident -- there was no second step to detect.\n' +
            '\n' +
            '### The backup server on the domain\n' +
            '\n' +
            'The backup server authenticates against the same domain it protects and accepted the same account. Encrypting it was therefore not a separate intrusion but the same access used once more. The eleven-day offline copy that recovery ran from exists because of a tape rotation nobody had reviewed either, which is the second time in this case that the outcome turned on an unreviewed arrangement rather than on a control.\n' +
            '\n' +
            '### Why six days passed unnoticed\n' +
            '\n' +
            'Every action the operator took used a legitimate account performing operations it was entitled to perform. The exfiltration was shaped to stay under thresholds set for bulk transfer. Nothing in the estate was watching for a service account behaving interactively, which is the one signal present throughout.',
        },
        { kind: 'timeline' },
        { kind: 'technique_table' },
        { kind: 'entities' },
        {
          kind: 'written',
          headingKey: 'heading.recommendations',
          body:
            'Ordered by what shortens the next incident, not by cost. Items 1 and 2 are prerequisites for the rest being worth anything.\n' +
            '\n' +
            '1. **Tier administrative accounts and remove domain admin from services.** `svc-backup` needs backup operator rights on the servers it protects and nothing else. Until this is done, every other control below can be bypassed with one cached credential.\n' +
            '2. **Keep at least one immutable, offline backup copy**, and take the backup server off the domain it protects. The eleven-day copy that carried this recovery survived by accident of a tape rotation.\n' +
            '3. **Alert on a service account authenticating interactively.** This was the one signal present on every day of the six, and nothing was watching for it.\n' +
            '4. Deploy EDR ransomware roll-back and network segmentation.\n' +
            '5. Reconsider the egress thresholds. They are set for bulk transfer, and 12GB left in pieces sized to fit under them.\n' +
            '\n' +
            '> Recovery restored service. It did not recover the eleven days between the offline copy and the encryption, and the report to the customer should say so in those terms.',
        },
      ],
    },
    {
      label: 'BSI early warning',
      template: 'nis2-early-warning',
      tlp: 'TLP:AMBER+STRICT',
      stage: 'NIS2 early warning',
      language: 'en',
      status: 'final',
      createdAtMinute: 250,
      sentAtMinute: 300,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Early warning',
          body:
            'Meridian Logistics, an essential entity under NIS2, is handling an ongoing ransomware incident affecting the logistics platform.\n' +
            '\n' +
            'The incident is **suspected to be caused by a malicious act** and has **cross-border effect**: services are consumed from NL, PL and FR alongside the home market.\n' +
            '\n' +
            'This warning is filed within 24 hours of detection and carries only what the record can prove at this point. Scope, impact figures and root cause follow in the 72-hour notification.',
        },
      ],
    },
    {
      label: 'BSI 72-hour notification',
      template: 'nis2-notification',
      tlp: 'TLP:AMBER+STRICT',
      stage: 'NIS2 notification',
      language: 'en',
      status: 'final',
      createdAtMinute: 1440,
      sentAtMinute: 2880,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Incident notification',
          body:
            'An initial assessment of severity and impact, filed at 72 hours and superseding the early warning of the same incident.\n' +
            '\n' +
            'Human-operated ransomware reached four servers and fourteen workstations. Approximately 12GB of finance, HR and directory data was exfiltrated before encryption, so this is reportable on the confidentiality limb as well as availability. A separate Article 33 notification has been filed with the data protection authority.\n' +
            '\n' +
            'The estate is contained. Recovery is running from an offline backup copy eleven days old; data written between that copy and the encryption is not recoverable.',
        },
        { kind: 'impact' },
        { kind: 'indicators' },
        { kind: 'actions' },
        { kind: 'techniques' },
      ],
    },
    {
      label: 'BSI intermediate update',
      template: 'nis2-intermediate',
      tlp: 'TLP:AMBER+STRICT',
      stage: 'NIS2 intermediate',
      language: 'en',
      status: 'draft',
      createdAtMinute: 7200,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Intermediate update',
          body:
            'Status update on request of the competent authority. The platform is serving again on rebuilt infrastructure; the domain has been rebuilt and krbtgt reset twice.\n' +
            '\n' +
            'Two questions remain open and are the reason this is an update rather than the final report: the full scope of the data staged to the exfiltration host is still being reconciled against the file shares, and the leak site has not published, so it cannot yet be said whether the exfiltrated data has been disclosed.',
        },
        { kind: 'actions' },
        { kind: 'evidence' },
      ],
    },
  ],
  // Mass data breach
  'DEMO-2026-047': [
    {
      label: 'Board incident report',
      template: 'standard',
      tlp: 'TLP:AMBER+STRICT',
      language: 'en',
      status: 'draft',
      createdAtMinute: 7200,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          headingKey: 'heading.exec_summary',
          body:
            'A caller persuaded the service desk to reset a customer-care account and re-enrol its multi-factor authentication. Using that account, they exported the customer master table through the CRM\'s own reporting interface over four days. **6,214,880 customer records left the estate.**\n' +
            '\n' +
            'No system was breached in the sense the word is usually used. There was no malware, no exploited vulnerability and no compromised device. Every request the attacker made was one the account was entitled to make, which is why none of the detective controls fired until a cumulative volume threshold crossed on the fourth day.\n' +
            '\n' +
            '### What was taken\n' +
            '\n' +
            '| Category | Records | Notified under |\n' +
            '| --- | --- | --- |\n' +
            '| Name, address, contact details | 6,214,880 | Art. 33 and 34 |\n' +
            '| Date of birth | 6,214,880 | Art. 33 and 34 |\n' +
            '| IBAN and BIC | 5,901,336 | Art. 33 and 34 |\n' +
            '| Identity-document number | 812,004 | Art. 33 and 34 |\n' +
            '| Free-text agent notes | under assessment | to be confirmed |\n' +
            '\n' +
            'The free-text notes are the open item. They were not in the first scope assessment, they are known to contain remarks about health and payment difficulty, and until they are classified the figures above are a floor rather than a total.\n' +
            '\n' +
            '### Why it took four days\n' +
            '\n' +
            '1. The account held the reporting role because every first-line agent did. The role had been granted to the team, not to the job.\n' +
            '2. The data-loss rule measured a 30-day cumulative volume. A per-session threshold would have fired during the first export run, roughly three and a half days earlier.\n' +
            '3. The exports ran inside business hours from a licensed account with a valid session and a freshly enrolled second factor. There was no anomaly for a behavioural control to find.\n' +
            '\n' +
            '> The agent who performed the reset followed the documented procedure correctly. Every identity check that procedure asks for was satisfied. Recording this as human error would put the finding on the one person in the chain who did what they were told to do.',
        },
        { kind: 'ribbon' },
        { kind: 'timeline' },
        {
          kind: 'written',
          headingKey: 'heading.root_cause',
          body:
            'Two arrangements, neither of them a defect, combined into one.\n' +
            '\n' +
            '### A telephone call could change an authentication factor\n' +
            '\n' +
            'The service desk could reset a password and re-enrol MFA on the strength of an employee number and a date of birth. Both are knowable. No callback to a number already held, and no out-of-band confirmation, was required for either action.\n' +
            '\n' +
            '### The reporting role belonged to the team\n' +
            '\n' +
            '`reporting.export` was granted to the first-line customer care group because a handful of agents needed a monthly report. 214 accounts therefore held the ability to export the entire customer master table, and the two facts only had to meet once.',
        },
        { kind: 'entities' },
        { kind: 'actions' },
        {
          kind: 'written',
          headingKey: 'heading.recommendations',
          body:
            '1. **Require out-of-band callback for any telephone request that changes an authentication factor.** This is the single control that would have stopped the incident at minute 22.\n' +
            '2. **Scope the reporting role to the job, not the team**, and put a volume ceiling on the export endpoint itself.\n' +
            '3. **Add a per-session export threshold to the DLP rule set.** The cumulative rule is not wrong; it is not a detection control.\n' +
            '4. Log and alert on MFA re-enrolment followed by a sign-in from an unseen address within the hour. That pair is the signature of this attack and of most like it.\n' +
            '\n' +
            '> Not recommended: additional training for the service desk. The agent applied the procedure as written, and a procedure that depends on someone declining to follow it is not a control.',
        },
      ],
    },
    {
      label: 'Article 33 notification (AP)',
      template: 'standard',
      tlp: 'TLP:AMBER+STRICT',
      language: 'en',
      status: 'final',
      createdAtMinute: 5960,
      sentAtMinute: 7200,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Nature of the personal data breach',
          body:
            'Unauthorised access to and copying of the customer master record set of Veldpoort Telecom B.V., obtained through social engineering of the service desk and carried out using the customer relationship platform\'s standard reporting export.\n' +
            '\n' +
            'Approximately 6,214,880 data subjects are affected. Categories: identifying and contact data, date of birth, bank account details and, for 812,004 subjects, identity-document numbers. Free-text service notes were also taken and are still being assessed for special-category content; this notification will be supplemented.\n' +
            '\n' +
            'The data was not encrypted at rest in the export format and no technical measure renders it unintelligible to the recipient, so Article 34(3)(a) does not apply.',
        },
        { kind: 'impact' },
        { kind: 'actions' },
      ],
    },
    {
      label: 'Article 34 public statement',
      template: 'standard',
      tlp: 'TLP:CLEAR',
      language: 'en',
      status: 'final',
      createdAtMinute: 7500,
      sentAtMinute: 8640,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Statement to customers',
          body:
            'Someone obtained access to a Veldpoort employee account and used it to copy customer records. We are contacting everyone affected directly. This statement is published because the number of people involved makes individual contact alone insufficient.\n' +
            '\n' +
            '**What was taken:** your name, address, phone number, email address, date of birth and, in most cases, your bank account number. For some customers, an identity-document number.\n' +
            '\n' +
            '**What was not taken:** your password, your call records, your location data and your invoices.\n' +
            '\n' +
            '**What to do:** we will never phone you to ask for a payment or a code. If someone does, hang up and call us on the number on your invoice. Watch your bank statements and report anything you do not recognise to your bank first.\n' +
            '\n' +
            '> Marked TLP:CLEAR. This one is written to be republished, which is why it names no system, no supplier and no employee.',
        },
      ],
    },
    {
      label: 'RDI early warning',
      template: 'nis2-early-warning',
      tlp: 'TLP:AMBER',
      stage: 'NIS2 early warning',
      language: 'en',
      status: 'final',
      createdAtMinute: 5880,
      sentAtMinute: 6060,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Early warning',
          body:
            'Veldpoort Telecom B.V., an essential entity, is handling a significant incident affecting the confidentiality of customer data. The incident is **suspected to be caused by a malicious act** and has **cross-border effect** (BE, DE, LU).\n' +
            '\n' +
            'No service interruption has occurred and none is expected: the impact is confidentiality only. Scope and impact figures follow in the notification.',
        },
      ],
    },
    {
      label: 'RDI notification',
      template: 'nis2-notification',
      tlp: 'TLP:AMBER',
      stage: 'NIS2 notification',
      language: 'en',
      status: 'draft',
      createdAtMinute: 8640,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Incident notification',
          body:
            'Initial assessment of severity and impact, superseding the early warning of the same incident.\n' +
            '\n' +
            '6,214,880 customer records were exported over four days through the customer relationship platform\'s reporting interface, using a customer-care account obtained by social engineering of the service desk. No network intrusion, malware or exploited vulnerability is involved and no service was interrupted.\n' +
            '\n' +
            'The account has been disabled and the export capability removed from first-line roles. A parallel notification has been filed with the Autoriteit Persoonsgegevens under Article 33 and a public statement issued under Article 34.',
        },
        { kind: 'impact' },
        { kind: 'indicators' },
        { kind: 'actions' },
      ],
    },
  ],
  // Edge appliance intrusion
  'DEMO-2026-052': [
    {
      label: 'Customer RCA',
      template: 'standard',
      tlp: 'TLP:RED',
      language: 'en',
      status: 'draft',
      createdAtMinute: 1440,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          headingKey: 'heading.exec_summary',
          body:
            'A public-facing VPN appliance running a version with a known unauthenticated remote code execution flaw was exploited. The access was held unused for over three weeks, then used by what appears to be a different operator to reach the engineering estate and exfiltrate approximately 2.1TB of design data.\n' +
            '\n' +
            '**The start date is a range, not a date.** The appliance keeps thirty days of logs. The intrusion ran for forty-one. The first eleven days exist only in perimeter netflow, and the ordering of events inside them is inferred from filesystem timestamps an attacker is able to set.\n' +
            '\n' +
            'Anything in this report describing the first three weeks is reconstruction. It is presented as such deliberately: a confident narrative over that window would be the most damaging thing this document could contain.',
        },
        { kind: 'timeline' },
        {
          kind: 'written',
          headingKey: 'heading.root_cause',
          body:
            'The appliance was four months behind on firmware. The vendor advisory was published, rated critical, and the appliance was outside the patch programme because the programme was scoped to servers and workstations.\n' +
            '\n' +
            '### Why nothing detected it for six weeks\n' +
            '\n' +
            'The appliance forwarded no logs to the SIEM. Nothing was watching it, and the only reason any part of the first three weeks is visible is that the perimeter firewall\'s netflow is kept for sixty days by a separate arrangement nobody had reviewed either.\n' +
            '\n' +
            '### The retention finding\n' +
            '\n' +
            'Thirty days of retention on an internet-facing device is shorter than the dwell time of a routine intrusion. This is not a contributing factor to the incident; it is the reason the incident cannot be fully answered.',
        },
        { kind: 'evidence' },
        { kind: 'entities' },
        {
          kind: 'written',
          headingKey: 'heading.recommendations',
          body:
            '1. **Bring edge appliances into the patch programme with a shorter clock than servers.** They are the devices with no agent on them and the shortest path from the internet.\n' +
            '2. **Forward appliance logs off the appliance**, and set retention against the longest dwell you would want to answer for, not the shortest one you can store.\n' +
            '3. Rotate every credential an appliance administrator account could have observed. The scope of that is not knowable from the logs that survive.\n' +
            '4. Alert on outbound archive uploads. The hunt that found this was looking for exactly that and could have been a rule.',
        },
      ],
    },
    {
      label: 'NCSC-NL notification',
      template: 'nis2-notification',
      tlp: 'TLP:AMBER+STRICT',
      stage: 'NIS2 notification',
      language: 'en',
      status: 'final',
      createdAtMinute: 600,
      sentAtMinute: 2880,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Incident notification',
          body:
            'Halberd Precision Manufacturing, an important entity, reports a significant incident affecting the confidentiality of engineering design data. The incident is **suspected to be caused by a malicious act**. No personal data is involved and no service was interrupted.\n' +
            '\n' +
            'Initial access was exploitation of a public-facing VPN appliance running unpatched firmware. Approximately 2.1TB of proprietary design data was exfiltrated. Trade-secret loss is asserted.\n' +
            '\n' +
            'The affected appliance has been removed from service and replaced. The reporting entity notes that appliance log retention was shorter than the intrusion, so the earliest phase is reconstructed from netflow and is stated with lower confidence than the remainder.',
        },
        { kind: 'impact' },
        { kind: 'indicators' },
        { kind: 'techniques' },
      ],
    },
  ],
  // Insider data leak
  'DEMO-2026-058': [
    {
      label: 'Internal investigation note',
      template: 'standard',
      tlp: 'TLP:RED',
      language: 'en',
      status: 'draft',
      createdAtMinute: 300,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          headingKey: 'heading.exec_summary',
          body:
            'Between the second day of a notice period and the ninth, 340 client matter attachments were emailed from a firm mailbox to a personal address belonging to the account holder.\n' +
            '\n' +
            '**No control was bypassed.** Every file was within the solicitor\'s matter access, the sends went through the ordinary mail path, and the DLP rule did not fire because it measures attachment volume per week and the daily rate stayed under it.\n' +
            '\n' +
            'This report deliberately does not characterise intent. The logs establish what was sent, when, and to where. They do not establish why, and the difference matters to what happens next.',
        },
        { kind: 'timeline' },
        { kind: 'evidence' },
        {
          kind: 'written',
          headingKey: 'heading.recommendations',
          body:
            '1. **Re-scope the DLP rule for leavers.** A weekly volume threshold is the wrong shape for a nine-day drip; cumulative volume from the date notice is given is the right one.\n' +
            '2. Trigger a mail-destination review on notice, not on exit. The review that found this ran on the last working day.\n' +
            '3. Do not respond by restricting matter access. It would not have prevented this and would obstruct the ordinary work of everyone who is not leaving.',
        },
      ],
    },
    {
      label: 'Note to instructing partner',
      template: 'standard',
      tlp: 'TLP:AMBER+STRICT',
      language: 'en',
      status: 'final',
      createdAtMinute: 1440,
      sentAtMinute: 1560,
      blocks: [
        { kind: 'case_header' },
        {
          kind: 'written',
          heading: 'Note to the instructing partner',
          body:
            'The factual position is settled and narrow: 340 attachments across 112 matters, sent to a named personal address between the dates given, by an account holder entitled to access each file at the time of sending.\n' +
            '\n' +
            'Two things are outstanding and both are yours rather than ours: whether an undertaking is sufficient or an order is wanted, and whether any affected client must be told. We have not contacted any client and will not without instruction.\n' +
            '\n' +
            '> The mailbox is on legal hold and the laptop is imaged and unaltered. Neither will change without a written instruction.',
        },
        { kind: 'actions' },
      ],
    },
  ],
}
