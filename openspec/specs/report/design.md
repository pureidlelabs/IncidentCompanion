# Scope

**The set of audiences is closed: customer, regulator, board, internal.** An install cannot add a fifth and a layout cannot introduce one. A closed set is what makes an obligation writable against it.

**The application produces a regulator document; it does not submit one.** Producing it is the whole of what the application does, and the analyst carries it into their own process. The compliance capability holds the same boundary for the assessment that prompts it.

**A layout carries no disclosure obligation and is never consulted for one.** Completeness is the layout's and disclosure is the audience's; neither substitutes for the other.

**The cross-customer refusal is the one obligation an analyst cannot decide past.** Every other judgement about what belongs in a report is theirs.

**What each audience expects is not stated here, and neither are the layouts.** Which parts satisfy an obligation comes from the schemas that validate a report. A layout is content rather than vocabulary — composed, duplicated and added to by whoever runs the install.

# Design

## An audience is a value

A report carries its audience as a value the application can test, chosen when the report is created and fixed for its life. A correction inherits the audience of the report it corrects.

| Audience | What it means for the obligations |
| --- | --- |
| **Customer** | The document leaves the operator, for the organisation the incident happened to. The one audience where a customer boundary can be crossed, and the one where crossing it is refused. |
| **Regulator** | Read by somebody applying an instrument rather than judging an investigation, so what it must carry comes from the instrument rather than from the analyst. |
| **Board** | Read for a decision rather than for findings. Expects less than a customer report and may omit most of it without being incomplete. |
| **Internal** | Nothing leaves the operator. The only audience that expects working material, which makes it the origin of material the other three do not. |

## Two obligations, checked against different things

**Completeness is a property of the shape.** A layout prescribes sections and marks which of them a report of that shape cannot do without; one missing is incomplete.

**Disclosure is a property of the content.** It asks what a part holds rather than whether a section is present, so no per-section mark reaches it.

Both are evaluated when the analyst asks what is outstanding, and again at export. Neither is evaluated while drafting: a report is incomplete for most of its life by construction, and a check that fires continuously is one nobody reads.

## The two disclosure checks

**Cross-customer content refuses.** A report for one customer that holds a part sourced from another customer's case cannot be exported.

The check is made against the case a part came from, not against its rendered text: a part carrying another customer's rows says nothing about it on its face. The refusal names the part and the customer it belongs to, so the analyst can act without opening every section. It defaults closed because the analyst cannot see across a case boundary and the application can.

**Unexpected material warns.** A part whose origin is internal, in a report that leaves the operator, is named before sending — with the audience and why it does not expect that material — and the analyst may send anyway.

What was named and not resolved is recorded with the send, beside the stamp the freeze already takes, so what a recipient was given is answerable later without reopening the case.
