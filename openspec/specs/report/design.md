# Scope

**The set of audiences is closed: customer, regulator, board, internal.** An install cannot add a fifth and a layout cannot introduce one. A closed set is what makes an obligation writable against it.

**The application produces a regulator document; it does not submit one.** Producing it is the whole of what the application does, and the analyst carries it into their own process. The compliance capability holds the same boundary for the assessment that prompts it.

**A layout carries no disclosure obligation and is never consulted for one.** Completeness is the layout's and disclosure is the audience's; neither substitutes for the other.

**The cross-customer refusal is the one obligation an analyst cannot decide past.** Every other judgement about what belongs in a report is theirs.

**What each audience expects is not stated here, and neither are the layouts.** Which parts satisfy an obligation comes from the schemas that validate a report. A layout is content rather than vocabulary — composed, duplicated and added to by whoever runs the install.

**The address names which report is open and nothing else about the reading of it.** Which section is being written, where the pane is scrolled and what the outline has folded stay out: they are states of reading rather than of what is being read, and an address carrying them is one nobody can send.

**A language pack carries words, never units.** How a span is written comes from the locale's own data, so a report in a language nobody has translated still states its figures correctly, and a pack's coverage figure measures the words alone.

**Nothing outside the report section composes an address naming a report.** A producer of such links -- a search result, a cross-reference -- is work of its own. An address naming no report, or naming one the case does not hold, opens the index rather than a guess.

**A send freezes the case as its render read it.** A change elsewhere in the case landing while the document is produced is the case moving after the read, and stays out of what was sent exactly as it would a moment later. What a send checks is the report and its own parts.

**One application process serves an install.** Holding a report's prose still while it is sent is that process's to do. The store's refusal is what stands behind it, for a second process or a path that holds no prose at all, and it is refused at that path's next write rather than at the keystroke.

**Where a report's freeze is refused, it is refused whole.** There is no partial write to a sent report, and no path that may write one for a reason of its own.

**An indicator export is data for another tool, not a document to read.** It carries each value as the case holds it, because a neutralised indicator is one a blocklist cannot use.

**A UNC path naming a single-label host stays as written.** Such a host resolves only on the reader's own network, so it names nothing of the adversary's.

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

## A report is reached by address

**A report is a pane inside the case's report section, not a section of the case.** The case rail carries one row per section, so a report addressed as a section of its own would appear on that rail beside the others -- which is what the section's own rows already do better, under one row. So the report travels as a parameter of the section's address rather than as a path of its own.

**The screen follows the address rather than remembering it.** A screen that seeds its own state from the address answers what the address said when the screen was first drawn, and the application draws one screen per section and re-renders it in place: the address then moves and the screen does not. Where a caller takes responsibility for the address, that caller's answer is the screen's answer on every draw; where none does -- a part exercised alone, in a gallery or a test -- the screen keeps its own, so it stays drawable with no address at all.

**A write of the address is composed from the address, never from a framework's copy of it.** A command can travel to a section on the address and be carried out by the screen that owns the control for it, and carrying one out clears it from the address directly, where the routing layer does not see it. That layer's copy therefore holds a command that has already run, and a write composed from the copy puts it back -- where the screen finds it and runs it a second time.

**Moving between reports replaces rather than adds.** Reading is a walk, and a history entry per report turns leaving the section into a walk back out of it. What precedes the section in the history is where the analyst came from, and that is what Back owes them.

**A search parameter is not a navigation, and a fragment is.** Anything walking the interface and asking whether pressing a control left the section reads the path and the fragment, because a nested section is addressed by fragment; the search string is where a section keeps its own state, and moving it means the analyst is where they were.

## A step is declared, never read off a title

**A title is written for a reader and a step is matched against a vocabulary**, so the two answer to different things and only one of them is a value. A title is content an operator edits, an analyst's own layout carries whatever they called it, and a title that is a step today stops being one the moment somebody makes it read better.

Reading a step off a title fails in the shape that is hardest to notice: the titles that match set their step and the one that does not sets nothing, so most of the obligation appears to work. The step that goes missing is whichever one somebody retitled, and the loss is silent at every layer -- a report with no step is a valid report.

So the layout states its step as a value, beside the regime it belongs to. One place says which obligation a layout belongs to and which step of it, and neither is derived from the other.

## What a route answers with is what its schema declares

The layout list is serialized through a schema before it leaves. A field the answer carries and the schema does not is dropped on the way out, and nothing above the wire can see it happen: the route's own return type is that schema's inference, so the typecheck agrees with the schema rather than with the answer, and a test calling the function instead of the route never meets the serializer at all.

**So a field is added to the answer and to the schema together, and what holds them together is a test over the parsed result rather than over the built one.** The equality is whole-object, so a field added later is covered without anybody remembering this.

## The store holds the freeze

A sent report refuses every change from every path, because the store refuses it: an update or removal of a report stamped as sent, and an insertion, change or removal of a part whose report, before or after the change, is stamped. A path added later is refused without being written to be.

The rules the store keeps are statements the schema's own tooling does not manage, so every preparation of a database applies them after the schema, and applying them again changes nothing.

A part's write waits for a send already deciding on its report and then reads the stamp that send left. That is what closes the window between checking a report and writing to it: the check and the write are one statement.

A write issued by the store itself on behalf of another write passes: a case deleted with its reports, and an account deleted and nulled out of what it wrote. A piece of evidence removed from under a sent figure passes too, clearing the part's pointer to it: the figure was frozen with the document, and is drawn by its content. None of the three is a change to what was sent. No other such write passes, so removing the report a sent report corrects is refused with the sent report's refusal.

The refusal names the report and when it was sent, and every door answers it with the one refusal a client can read.

A path that brings a sent report in whole, from an archive or a demonstration, writes it as a draft and stamps it last.

## A send is one checked act

A send holds the report's prose still, produces the document from it, and then, in one act under a lock on the report, checks that nothing it drew from has moved and stamps the report with the document, the prose and a record of the change. The document is produced outside the lock, because producing it is unbounded.

What the document drew from is the report's version and each part's; a part added, removed or changed since, or a change to the report, refuses the send and names what moved. The report stays a draft holding the change.

Prose arriving while a send decides waits. A send that stamps refuses it with the stamp; one that does not applies it in order. Prose for a sent report is refused wherever it arrives, from the report's own stored stamp, so a writer who never heard of the send is still refused.

## Correcting and restoring are one act each

A correction writes the further report, its parts, their records and its prose together. For a sent report, the prose it inherits is what was sent.

A restore locks the report, works out what its shape expects that it does not hold, and writes those sections with their records in the same act, so a second restore waiting behind the first finds nothing missing.

## An address leaves unlinkable

The criterion is what a reader's software links: a word processor, a PDF reader, a mail client and a GitHub-flavoured Markdown renderer. Every such address in generated text is rewritten in the notation threat-intelligence tooling reads back, and the case keeps the real value.

| Written in the case | Leaves as |
| --- | --- |
| `http://`, `https://`, `ftp://`, `ftps://` | `hxxp://`, `hxxps://`, `fxp://`, `fxps://`, with every dot of the host as `[.]` |
| `http:`, `https:`, `ftp:`, `ftps:` with no `//` | the same rewritten scheme, with the host's dots bracketed |
| Any other scheme followed by `//` | the scheme, then `[:]//`, with the host's dots bracketed |
| A protocol-relative `//host` | the host's dots bracketed |
| A name beginning `www.` | every dot of the host bracketed, whatever the name ends in |
| A UNC path, long-path `\\?\UNC\` form included | the host's dots bracketed |
| An email address | `[@]`, and the domain's dots bracketed |
| An IPv4 address | every dot bracketed |
| Any other dotted name | every dot bracketed, when it ends in a top-level domain of the root zone |

A path, a query and an email's local part are left as written, since none of them is what a reader's software opens.

**A bare name counts as a host only under a real top-level domain**, which is what keeps a version number, an abbreviation and most filenames whole: none of `1.2.3`, `e.g.` or `report.pdf` ends in one. A label may carry an underscore. A dotted name inside a path, a Windows path or an address already defanged is never judged on its own.

**A filename whose extension is also a top-level domain is bracketed like a host**: `payload[.]zip`, `setup[.]py`. Readers link those names, and a bracketed filename still reads as the file it names.

**A zero-width character beside a dot is removed** before the rules run, since it hides a name from a reader and not from the software that links it.

**The list of top-level domains is IANA's root zone, pinned to a stated version** and refreshed by regenerating it from IANA's published list.

**A bare IPv6 address is left as written.** No reader's software links one; the form that links carries a scheme, and the scheme is what is rewritten.

**Applying the rules twice changes nothing.** A preserved document is rewritten again when it is read in, so a bracketed dot, a bracketed `@` and a rewritten scheme are each left alone.

**A preserved document read in is held to the rules whole.** Its sections marked as the analyst's own writing, its code blocks marked verbatim and the address carried beside a run's text are all rewritten, since each mark came from whoever wrote the archive and nothing on the way in can tell a genuine one from a forged one. In a report the install renders itself, the analyst's written prose and a method's verbatim query leave as written.
