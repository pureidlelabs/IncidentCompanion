/**
 * The case templates this install ships with.
 *
 * **This file is the only copy**, since the TOML it was lifted from went with
 * the Python tier on 2026-08-29. Edit it directly; the checklists are domain
 * content rather than code, so a dropped question is a task that goes missing
 * rather than a test that fails.
 *
 * Seeded on boot, so a fresh install has them without a backup. What an
 * analyst authors lives only in the table.
 */
import type { CaseTemplate } from "../kinds.js";

export interface BuiltinTemplate {
  name: string;
  label: string;
  description: string;
  position: number;
  payload: CaseTemplate;
}

export const BUILTIN_CASE_TEMPLATES: readonly BuiltinTemplate[] = [
  {
    name: "bec",
    label: "Business email compromise",
    description:
      "A mailbox is under someone else's control: audit logs, inbox rules, and anything financial that moved.",
    position: 20,
    payload: {
      initialAccessVector: "Phishing email",
      actions: [
        {
          task: "Preserve and export the mailbox audit log before it ages out",
          taskType: "information request",
        },
        {
          task: "Review inbox rules and forwarding on the affected mailbox",
          taskType: "analysis",
        },
        {
          task: "Pull sign-in logs for the account and identify unfamiliar sessions",
          taskType: "information request",
        },
        {
          task: "Review OAuth application consents granted by the account",
          taskType: "analysis",
        },
        {
          task: "Check MFA method registrations for attacker-added factors",
          taskType: "analysis",
        },
        {
          task: "Identify any payment or banking instructions sent or altered",
          taskType: "analysis",
        },
        {
          task: "Reset credentials and revoke all active sessions",
          taskType: "deliverable",
        },
        {
          task: "Confirm with the customer whether funds actually moved",
          taskType: "information request",
        },
        {
          task: "Draft customer notification",
          taskType: "deliverable",
        },
      ],
      evidence: [
        {
          name: "Mailbox audit log export",
          type: "external source",
        },
        {
          name: "Sign-in log export for the affected account",
          type: "external source",
        },
        {
          name: "Inbox rule and forwarding configuration listing",
          type: "external source",
        },
        {
          name: "Message headers for the fraudulent correspondence",
          type: "file",
        },
      ],
      notes: [
        {
          note: "Scope: which mailboxes, which time window, which tenant.\n\nThe financial question is usually the urgent one -- establish early whether an invoice or payment instruction was altered, and whether the customer's finance team can still recall a transfer. That often runs in parallel with, and ahead of, the technical scoping below.",
        },
      ],
    },
  },
  {
    name: "insider",
    label: "Insider / data theft",
    description:
      "An authorized user is the subject: evidence handling and HR/Legal sequencing matter as much as the technical work.",
    position: 40,
    payload: {
      initialAccessVector: "Authorized access (insider)",
      actions: [
        {
          task: "Confirm HR and Legal are engaged before any interview or notification",
          taskType: "notification",
        },
        {
          task: "Establish what access the account is legitimately authorized to hold",
          taskType: "information request",
        },
        {
          task: "Establish the employment timeline: notice, resignation, access changes",
          taskType: "information request",
        },
        {
          task: "Preserve the endpoint before the subject is aware of the investigation",
          taskType: "deliverable",
        },
        {
          task: "Review file access and download volume against the user's own baseline",
          taskType: "analysis",
        },
        {
          task: "Check removable media use",
          taskType: "analysis",
        },
        {
          task: "Check uploads to personal cloud storage and webmail",
          taskType: "analysis",
        },
        {
          task: "Review email and chat for data sent outside the organisation",
          taskType: "analysis",
        },
        {
          task: "Agree with Legal what is in scope before reviewing personal content",
          taskType: "notification",
        },
      ],
      evidence: [
        {
          name: "Endpoint forensic image",
          type: "disk image",
        },
        {
          name: "DLP alert export",
          type: "external source",
        },
        {
          name: "File server and SharePoint access logs",
          type: "system logs",
        },
        {
          name: "Proxy logs for cloud storage and webmail uploads",
          type: "network logs",
        },
      ],
      notes: [
        {
          note: "Handling: this case has a named individual as its subject, so it carries constraints the other templates do not.\n\nDo not notify the subject, and do not alter their access, until HR and Legal have agreed the sequence -- both can destroy evidence or create employment-law exposure. Keep the reasoning for each investigative step recorded here; an insider case is far more likely than the others to be read later by people outside the SOC.",
        },
      ],
    },
  },
  {
    name: "phishing",
    label: "Phishing campaign",
    description:
      "A malicious message reached users: scope the campaign, find who clicked, contain the payload.",
    position: 10,
    payload: {
      initialAccessVector: "Phishing email",
      actions: [
        {
          task: "Obtain the original message with full headers",
          taskType: "information request",
        },
        {
          task: "Extract and detonate the URLs and attachments",
          taskType: "analysis",
        },
        {
          task: "Identify every recipient of the campaign, not just the reporter",
          taskType: "analysis",
        },
        {
          task: "Determine who clicked, and who submitted credentials",
          taskType: "analysis",
        },
        {
          task: "Block the sender, URLs and payload hashes",
          taskType: "deliverable",
        },
        {
          task: "Purge the message from all affected mailboxes",
          taskType: "deliverable",
        },
        {
          task: "Reset credentials for anyone who submitted them, and revoke sessions",
          taskType: "deliverable",
        },
        {
          task: "Check affected accounts for follow-on activity",
          taskType: "analysis",
        },
      ],
      evidence: [
        {
          name: "Original phishing message (.eml, headers intact)",
          type: "file",
        },
        {
          name: "Email gateway delivery log export",
          type: "external source",
        },
        {
          name: "Sandbox detonation report",
          type: "external source",
        },
        {
          name: "Proxy logs covering the click window",
          type: "network logs",
        },
      ],
      notes: [
        {
          note: "Scope: which tenant, which delivery window, and how the campaign was first reported.\n\nRecord the sender address, subject and payload here as they are confirmed -- the recipient list usually grows once the gateway logs come back.",
        },
      ],
    },
  },
  {
    name: "ransomware",
    label: "Ransomware",
    description:
      "Encryption has fired: scope the blast radius, find the entry point, and check what left before it did.",
    position: 30,
    payload: {
      reportTemplate: "nis2-final",
      actions: [
        {
          task: "Establish the encryption start time and the first host affected",
          taskType: "analysis",
        },
        {
          task: "Identify the family from the ransom note and file extension",
          taskType: "analysis",
        },
        {
          task: "Scope which hosts, shares and backups are encrypted",
          taskType: "analysis",
        },
        {
          task: "Verify backup integrity and whether backups were domain-joined",
          taskType: "information request",
        },
        {
          task: "Identify the initial access vector",
          taskType: "analysis",
        },
        {
          task: "Check for data staging or exfiltration before encryption",
          taskType: "analysis",
        },
        {
          task: "Check whether the note names a leak site, and whether the customer is listed",
          taskType: "analysis",
        },
        {
          task: "Preserve a ransom note and a sample of encrypted files",
          taskType: "deliverable",
        },
        {
          task: "Agree containment scope and isolation plan with the customer",
          taskType: "containment",
        },
        {
          task: "Draft customer incident report",
          taskType: "deliverable",
        },
      ],
      evidence: [
        {
          name: "Ransom note",
          type: "file",
        },
        {
          name: "Sample of encrypted files",
          type: "file",
        },
        {
          name: "EDR telemetry export for the first affected host",
          type: "system logs",
        },
        {
          name: "Domain controller security event logs",
          type: "system logs",
        },
        {
          name: "Firewall and proxy logs for the pre-encryption window",
          type: "network logs",
        },
      ],
      notes: [
        {
          note: 'Scope: which sites, which domains, and whether the customer has already engaged anyone else (insurer, negotiator, legal).\n\nExfiltration is the question that usually decides notification obligations, and it is easy to lose behind the recovery work. Treat "did data leave" as a distinct line of enquiry from "what is encrypted", and keep the answer here as it firms up.',
        },
      ],
    },
  },
];
