/**
 * The reusable paragraphs this app ships with.
 *
 * Generated and committed rather than read at boot. English only - the Dutch
 * pass the language packs got is still owed here. An install's own entries are
 * ordinary rows beside these.
 *
 * @see `library/library.service.ts` for the upsert that ships them.
 */
import type { ReportSnippet } from '../kinds.js'

export interface BuiltinSnippet {
  /** Stable across a label rewording: the TOML stem it came from. */
  name: string
  label: string
  position: number
  payload: ReportSnippet
}

export const BUILTIN_REPORT_SNIPPETS: readonly BuiltinSnippet[] = [
  {
    name: 'absence-of-evidence',
    label: 'Absence of evidence is not evidence of absence',
    position: 0,
    payload: {
      slot: 'caveats',
      hint: 'evidence',
      body: 'Where this report states that an activity was not observed, that is a\nstatement about the evidence available rather than about what happened.\nAnti-forensic activity, log rotation and gaps in coverage all produce the\nsame absence.',
      translations: [],
    },
  },
  {
    name: 'alert-interactive-service-logon',
    label: 'Alert on interactive service-account logons',
    position: 1,
    payload: {
      slot: 'detection',
      hint: 'detection',
      body: 'Alert on a service account authenticating interactively. Where every action\nan operator took used a legitimate account performing operations it was\nentitled to perform, this is frequently the one signal present throughout.',
      translations: [],
    },
  },
  {
    name: 'alert-service-creation',
    label: 'Alert on service and scheduled-task creation',
    position: 2,
    payload: {
      slot: 'detection',
      hint: 'detection',
      body: 'Alert on the creation of a Windows service or a scheduled task on a server.\nBoth are ordinary administrative actions and both are common persistence,\nso the value is in the review rather than in the block.',
      translations: [],
    },
  },
  {
    name: 'application-control',
    label: 'Control which executables may run',
    position: 3,
    payload: {
      slot: 'hardening',
      hint: 'execution',
      body: 'Introduce application control on servers and high-value workstations, and\nrestrict the interpreters and signed system binaries that are commonly used\nto run downloaded code. Blocking the tool is cheaper than detecting every\nuse of it.',
      translations: [],
    },
  },
  {
    name: 'asset-inventory',
    label: 'Bring the asset inventory up to date',
    position: 4,
    payload: {
      slot: 'governance',
      hint: 'visibility',
      body: 'Reconcile the asset inventory against what the network actually holds. Every\ncontrol below is applied to an inventory, and the systems missing from it\nare the ones that stay unpatched, unmonitored and unbacked-up.',
      translations: [],
    },
  },
  {
    name: 'attachment-filtering',
    label: 'Filter executable and macro-enabled attachments',
    position: 5,
    payload: {
      slot: 'email',
      hint: 'initial access',
      body: 'Quarantine macro-enabled and executable attachments at the gateway and\nrelease them by request. It is a small amount of friction against the\ndelivery method most of these incidents begin with.',
      translations: [],
    },
  },
  {
    name: 'backup-off-domain',
    label: 'Take the backup system off the domain it protects',
    position: 6,
    payload: {
      slot: 'recovery',
      hint: 'backup',
      body: 'Move the backup infrastructure out of the domain it protects, with separate\ncredentials. A backup server that authenticates against the estate it is\nprotecting is encrypted with it.',
      translations: [],
    },
  },
  {
    name: 'block-legacy-auth',
    label: 'Block legacy authentication protocols',
    position: 7,
    payload: {
      slot: 'email',
      hint: 'access',
      body: 'Block authentication protocols that cannot present a second factor. While\nany remain enabled, multi-factor authentication is a control with a\ndocumented bypass.',
      translations: [],
    },
  },
  {
    name: 'block-macros',
    label: 'Block macros from the internet',
    position: 8,
    payload: {
      slot: 'hardening',
      hint: 'initial access',
      body: 'Block macros in documents originating from the internet, by policy, with no\nper-user exception. Where an exception is genuinely required, record it\nagainst the *application* that needs it and give it a review date, so the\nnext exception has something to expire.',
      translations: [],
    },
  },
  {
    name: 'central-logging',
    label: 'Centralise logs and extend retention',
    position: 9,
    payload: {
      slot: 'detection',
      hint: 'visibility',
      body: 'Forward security logs from endpoints, servers, the directory and network\ndevices to a central store, and extend retention to cover a realistic dwell\ntime. Logs held only on the host are the first thing an operator with\nadministrative rights removes.',
      translations: [],
    },
  },
  {
    name: 'deny-interactive-service-logon',
    label: 'Deny interactive logon to service accounts',
    position: 10,
    payload: {
      slot: 'identity',
      hint: 'hardening',
      body: 'Deny interactive and remote-interactive logon to every service account by\npolicy. A service account has no reason to sign in at a desktop, and the\nrestriction removes the step between a compromised workstation and the\nsystems that account administers.',
      translations: [],
    },
  },
  {
    name: 'disable-smbv1',
    label: 'Disable SMBv1 and restrict SMB between hosts',
    position: 11,
    payload: {
      slot: 'hardening',
      hint: 'lateral movement',
      body: 'Disable SMBv1 everywhere it still answers, and block SMB between\nworkstations. Neither has a business use in a current estate, and both are\nhow a foothold becomes a spread.',
      translations: [],
    },
  },
  {
    name: 'dns-logging',
    label: 'Log and inspect DNS',
    position: 12,
    payload: {
      slot: 'detection',
      hint: 'visibility',
      body: 'Log DNS queries and inspect them for newly registered domains, algorithmic\nnames and requests to resolvers other than the estate\'s own. Command and\ncontrol that survives a proxy block frequently does not survive DNS.',
      translations: [],
    },
  },
  {
    name: 'edr-coverage',
    label: 'Close the endpoint detection gaps',
    position: 13,
    payload: {
      slot: 'detection',
      hint: 'visibility',
      body: 'Deploy endpoint detection to every system in scope, including servers,\nhypervisors and build machines, and alert on agents that stop reporting. An\nestate with partial coverage is an estate with a documented route through\nit.',
      translations: [],
    },
  },
  {
    name: 'egress-monitoring',
    label: 'Monitor egress volume and destinations',
    position: 14,
    payload: {
      slot: 'detection',
      hint: 'exfiltration',
      body: 'Monitor outbound volume per host and alert on transfers to destinations the\nbusiness does not use. Exfiltration shaped to stay under a per-request\nthreshold is still visible as a total.',
      translations: [],
    },
  },
  {
    name: 'email-authentication',
    label: 'Enforce SPF, DKIM and DMARC',
    position: 15,
    payload: {
      slot: 'email',
      hint: 'spoofing',
      body: 'Publish and enforce SPF, DKIM and a DMARC policy of reject. Until DMARC is\nenforcing, the organisation\'s own domain remains available to anyone\nphishing its staff, its customers and its suppliers.',
      translations: [],
    },
  },
  {
    name: 'exec-bec',
    label: 'Opening: business email compromise',
    position: 16,
    payload: {
      slot: 'exec_summary',
      hint: 'opening',
      body: 'A mailbox was accessed by someone other than its owner and used to conduct\nbusiness. The loss here is not a system: it is the messages that were sent\nand read while the access lasted, and the decisions other people made on\nthe strength of them.',
      translations: [],
    },
  },
  {
    name: 'exec-confidence',
    label: 'How much of this is established',
    position: 17,
    payload: {
      slot: 'exec_summary',
      hint: 'evidence',
      body: 'Everything stated in this report is drawn from evidence that was collected\nand is retained. Where a conclusion rests on inference rather than on an\nartefact, it says so at the point it is drawn -- and the caveats section\nlists what could not be established at all.',
      translations: [],
    },
  },
  {
    name: 'exec-contained',
    label: 'Where the response stands now',
    position: 18,
    payload: {
      slot: 'exec_summary',
      hint: 'status',
      body: 'The access described here is closed and the affected systems are rebuilt or\nisolated. Monitoring for the same actor returning is in place, and remains\nin place until the credential rotation below is complete -- a closed route\nand a rotated credential are two different things.',
      translations: [],
    },
  },
  {
    name: 'exec-dwell',
    label: 'The dwell time, and why it is the number',
    position: 19,
    payload: {
      slot: 'exec_summary',
      hint: 'framing',
      body: 'The material fact of this incident is how long the access lasted before\nanything noticed. Everything that was taken, and every credential that will\nhave to be rotated, follows from that number rather than from the technique\nused to obtain the first foothold.',
      translations: [],
    },
  },
  {
    name: 'exec-edge-device',
    label: 'Opening: an internet-facing service',
    position: 20,
    payload: {
      slot: 'exec_summary',
      hint: 'opening',
      body: 'An internet-facing service was exploited directly, with no user involved.\nNothing an analyst or a member of staff did contributed to this incident:\nthe exposure was the attack surface, and it was reachable from anywhere.',
      translations: [],
    },
  },
  {
    name: 'exec-impact',
    label: 'What this cost the business',
    position: 21,
    payload: {
      slot: 'exec_summary',
      hint: 'framing',
      body: 'Stated in the business\'s terms rather than the estate\'s: which services\nstopped, for how long, whose data left, and what the organisation now owes\nits customers, its regulator and its insurer as a result.',
      translations: [],
    },
  },
  {
    name: 'exec-insider',
    label: 'Opening: a person with access',
    position: 22,
    payload: {
      slot: 'exec_summary',
      hint: 'opening',
      body: 'The activity in this report was carried out by an account belonging to\nsomeone with a legitimate reason to hold it. This report describes what was\ndone and what it reached, and takes no position on intent -- that is a\nquestion for a process this document feeds rather than one it answers.',
      translations: [],
    },
  },
  {
    name: 'exec-not-contained',
    label: 'The response is not finished',
    position: 23,
    payload: {
      slot: 'exec_summary',
      hint: 'status',
      body: 'This report describes an incident that is still open. What follows is the\nposition as at the time stated, and it will move: read the recommendations\nas the current plan rather than as a record of what was done.',
      translations: [],
    },
  },
  {
    name: 'exec-phishing',
    label: 'Opening: phishing to hands-on-keyboard',
    position: 24,
    payload: {
      slot: 'exec_summary',
      hint: 'opening',
      body: 'A member of staff opened an attachment that ran code on their workstation.\nWithin hours that foothold was being operated by a person rather than by\nthe malware, which is the point at which an automated defence stops being\nthe control that matters.',
      translations: [],
    },
  },
  {
    name: 'exec-ransomware',
    label: 'Opening: ransomware',
    position: 25,
    payload: {
      slot: 'exec_summary',
      hint: 'opening',
      body: 'An operator obtained access to the estate, moved to systems holding the\nbusiness\'s own data, and encrypted them. The encryption was the last thing\nto happen rather than the incident itself: by the time it fired, the\naccess, the credential theft and the data staging had already taken place.',
      translations: [],
    },
  },
  {
    name: 'exec-reportable',
    label: 'This is reportable',
    position: 26,
    payload: {
      slot: 'exec_summary',
      hint: 'obligation',
      body: 'This incident meets the threshold for notification, and the clock runs\nfrom the first detection rather than from the first access. The dates in\nthe timeline are what that obligation is calculated against.',
      translations: [],
    },
  },
  {
    name: 'exec-third-party',
    label: 'Opening: through a supplier',
    position: 27,
    payload: {
      slot: 'exec_summary',
      hint: 'opening',
      body: 'Access reached this estate through a third party\'s, using a route that was\ngranted deliberately and monitored as though it were internal. The supplier\nis not the subject of this report; the standing access is.',
      translations: [],
    },
  },
  {
    name: 'exec-valid-account',
    label: 'Opening: a valid account',
    position: 28,
    payload: {
      slot: 'exec_summary',
      hint: 'opening',
      body: 'Every action recorded in this report used a legitimate account performing\noperations it was entitled to perform. No malware was required, and none of\nthe individual steps would look wrong in isolation -- which is why the\ndetection question here is about *sequence* rather than about signatures.',
      translations: [],
    },
  },
  {
    name: 'exec-what-now',
    label: 'The one thing to do first',
    position: 29,
    payload: {
      slot: 'exec_summary',
      hint: 'framing',
      body: 'The recommendations below are ordered by what removes the most access for\nthe least work, not by the order in which the problems were found. If only\nthe first is done, it should be the first.',
      translations: [],
    },
  },
  {
    name: 'ir-plan',
    label: 'Document and exercise the response plan',
    position: 30,
    payload: {
      slot: 'recovery',
      hint: 'process',
      body: 'Write down who decides to disconnect, who speaks to the customer, who\ncontacts the regulator and where the out-of-band contact list lives -- and\nexercise it. Every one of those questions was answered during this\nincident, under time pressure, for the first time.',
      translations: [],
    },
  },
  {
    name: 'limits-of-this-analysis',
    label: 'What this analysis could not establish',
    position: 31,
    payload: {
      slot: 'caveats',
      hint: 'scope',
      body: 'The following could not be established from the evidence available, and are\nrecorded here so they are not read as ruled out:',
      translations: [],
    },
  },
  {
    name: 'mass-file-change-alert',
    label: 'Alert on mass file modification',
    position: 32,
    payload: {
      slot: 'detection',
      hint: 'ransomware',
      body: 'Alert on a single account modifying or renaming files in bulk on a file\nserver. It is the last signal before encryption completes, and it is one\nnobody has to interpret.',
      translations: [],
    },
  },
  {
    name: 'mfa-everywhere',
    label: 'Require multi-factor authentication for remote and privileged access',
    position: 33,
    payload: {
      slot: 'identity',
      hint: 'access',
      body: 'Require multi-factor authentication for all remote access, all privileged\naccounts and all webmail. Where MFA already exists, confirm it cannot be\nbypassed by legacy authentication protocols, which do not support it and\nare frequently still enabled.',
      translations: [],
    },
  },
  {
    name: 'no-attribution',
    label: 'Attribution was not attempted',
    position: 34,
    payload: {
      slot: 'caveats',
      hint: 'attribution',
      body: 'No attribution to a named group is offered. The tooling and tradecraft\nobserved are used by several, are widely available, and would not support a\nconclusion this report could stand behind.',
      translations: [],
    },
  },
  {
    name: 'oauth-consent',
    label: 'Restrict and review third-party application consent',
    position: 35,
    payload: {
      slot: 'email',
      hint: 'cloud',
      body: 'Restrict user consent for third-party applications to a reviewed list, and\naudit the applications already granted access. A consented application\nneeds no malware and survives a password change.',
      translations: [],
    },
  },
  {
    name: 'offline-backup',
    label: 'Keep an offline backup, and test the restore',
    position: 36,
    payload: {
      slot: 'recovery',
      hint: 'backup',
      body: 'Keep at least one immutable, offline backup copy and test restoration\nquarterly. A backup that has never been restored is an assumption, and this\nincident is where it would have been tested.',
      translations: [],
    },
  },
  {
    name: 'patch-the-vector',
    label: 'Remediate the vulnerability that was used',
    position: 37,
    payload: {
      slot: 'hardening',
      hint: 'exposure',
      body: 'Patch or replace the component the intrusion entered through, and search\nthe estate for other instances of it. The same software is rarely deployed\nonce.',
      translations: [],
    },
  },
  {
    name: 'phishing-reporting',
    label: 'Give staff one button to report a suspicious message',
    position: 38,
    payload: {
      slot: 'email',
      hint: 'process',
      body: 'Give staff a single, obvious way to report a suspicious message and answer\nevery report. Reporting rate is the control here; the training is what\nsustains it.',
      translations: [],
    },
  },
  {
    name: 'point-in-time',
    label: 'This describes a point in time',
    position: 39,
    payload: {
      slot: 'caveats',
      hint: 'scope',
      body: 'This describes the estate as it was during the response. Configuration\nchanged during containment and recovery, so a control described here as\nabsent may since have been introduced.',
      translations: [],
    },
  },
  {
    name: 'post-incident-review',
    label: 'Hold a post-incident review',
    position: 40,
    payload: {
      slot: 'governance',
      hint: 'process',
      body: 'Hold a review with the people who were in the incident, not only their\nmanagers, and record what was slow rather than what was wrong. The decisions\nthat cost time here are the ones worth pre-deciding.',
      translations: [],
    },
  },
  {
    name: 'powershell-hardening',
    label: 'Log and constrain PowerShell',
    position: 41,
    payload: {
      slot: 'hardening',
      hint: 'execution',
      body: 'Enable script block logging and module logging, and move to constrained\nlanguage mode where the estate\'s own tooling allows it. Unlogged PowerShell\nis the difference between reconstructing what ran and inferring it.',
      translations: [],
    },
  },
  {
    name: 'privileged-group-review',
    label: 'Review and monitor privileged group membership',
    position: 42,
    payload: {
      slot: 'identity',
      hint: 'governance',
      body: 'Review the membership of every privileged group, remove what no longer\nneeds to be there, and alert on additions. Privileged groups accumulate\nmembers quietly, and an attacker\'s addition looks like the others.',
      translations: [],
    },
  },
  {
    name: 'reduce-internet-exposure',
    label: 'Reduce the internet-facing surface',
    position: 43,
    payload: {
      slot: 'hardening',
      hint: 'exposure',
      body: 'Enumerate every service reachable from the internet and remove, or place\nbehind authenticated access, everything that does not need to be there.\nThe exposure that is not inventoried is the one that is not patched.',
      translations: [],
    },
  },
  {
    name: 'retention-limited',
    label: 'Retention limited the timeline',
    position: 44,
    payload: {
      slot: 'caveats',
      hint: 'evidence',
      body: 'Log retention on the affected systems is shorter than the dwell time\nestablished above, so the earliest activity in this timeline is the earliest\nthat could be *observed* rather than the earliest that occurred.',
      translations: [],
    },
  },
  {
    name: 'rmm-control',
    label: 'Inventory and restrict remote management tools',
    position: 45,
    payload: {
      slot: 'hardening',
      hint: 'persistence',
      body: 'Inventory every remote-management and remote-desktop tool installed across\nthe estate, remove what is not sanctioned, and alert on new installations.\nAn attacker\'s remote access tool is indistinguishable from an\nadministrator\'s unless the sanctioned list is known.',
      translations: [],
    },
  },
  {
    name: 'rotate-credentials',
    label: 'Rotate every credential in scope',
    position: 46,
    payload: {
      slot: 'identity',
      hint: 'recovery',
      body: 'Rotate every credential that existed on a compromised system, including\nservice accounts, local administrator passwords, API keys and certificates.\nRotate the `krbtgt` account twice, with the replication interval between\nthe two, or previously issued tickets remain valid.',
      translations: [],
    },
  },
  {
    name: 'scope-boundary',
    label: 'The scope this covers',
    position: 47,
    payload: {
      slot: 'caveats',
      hint: 'scope',
      body: 'This analysis covers the systems, accounts and period named above. Systems\noutside that boundary were not examined and no conclusion about them should\nbe drawn from this document.',
      translations: [],
    },
  },
  {
    name: 'segmentation',
    label: 'Segment the network',
    position: 48,
    payload: {
      slot: 'hardening',
      hint: 'containment',
      body: 'Segment the estate so that a workstation cannot reach a server\'s\nadministrative ports, and servers of different functions cannot reach each\nother\'s. Flat networks turn one compromised host into an estate-wide\nincident with no further effort.',
      translations: [],
    },
  },
  {
    name: 'service-accounts-least-privilege',
    label: 'Reduce service accounts to least privilege',
    position: 49,
    payload: {
      slot: 'identity',
      hint: 'privilege',
      body: 'Reduce every service account to the rights its service actually uses, and\nsplit one account per system rather than one account across many. A single\nover-privileged service account is a single cached credential that reaches\neverything it was ever installed on.',
      translations: [],
    },
  },
  {
    name: 'stale-accounts',
    label: 'Remove stale and orphaned accounts',
    position: 50,
    payload: {
      slot: 'identity',
      hint: 'governance',
      body: 'Remove accounts belonging to departed staff, decommissioned services and\nfinished projects, and set a review cadence. A stale account is one nobody\nwatches, with a password nobody has changed.',
      translations: [],
    },
  },
  {
    name: 'supplier-access-review',
    label: 'Review third-party and supplier access',
    position: 51,
    payload: {
      slot: 'governance',
      hint: 'third party',
      body: 'Review every standing access a supplier holds, remove what is unused, and\nbound the rest by time and by system. Supplier access is rarely inventoried\nwith the organisation\'s own.',
      translations: [],
    },
  },
  {
    name: 'tabletop',
    label: 'Exercise the plan against this scenario',
    position: 52,
    payload: {
      slot: 'governance',
      hint: 'process',
      body: 'Run a tabletop exercise against this incident\'s own scenario within three\nmonths. The value is in the second run, where the questions this one raised\nhave documented answers.',
      translations: [],
    },
  },
  {
    name: 'tiering',
    label: 'Tier administrative accounts',
    position: 53,
    payload: {
      slot: 'identity',
      hint: 'privilege',
      body: 'Introduce a tiering model so a workstation logon cannot reach domain\nadministration. Until this is done, every other control below can be\nbypassed with one cached credential.',
      translations: [],
    },
  },
  {
    name: 'unique-local-admin',
    label: 'Give every host a unique local administrator password',
    position: 54,
    payload: {
      slot: 'identity',
      hint: 'hardening',
      body: 'Give each host a unique, automatically rotated local administrator password\n(LAPS or equivalent). A shared local password makes one recovered hash a\ncredential for every machine built from the same image.',
      translations: [],
    },
  },
  {
    name: 'vulnerability-cadence',
    label: 'Set a patching cadence with an owner',
    position: 55,
    payload: {
      slot: 'governance',
      hint: 'exposure',
      body: 'Set a patching cadence per system class, with a named owner and a\nmeasurable target, and report against it. Unowned patching is patching that\nhappens after an incident.',
      translations: [],
    },
  },
]
