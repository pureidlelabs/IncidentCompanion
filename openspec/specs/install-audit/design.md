# Scope

Delivery is push, over the OpenTelemetry logs protocol, to one endpoint the operator names in the environment. There is no second transport and no pull surface beyond the read route the reader already uses.

What reaches the destination is the same line the read route serves. The install publishes one vocabulary, not one for a screen and another for a collector.

The install decides nothing about the far end. It does not read back, does not dedupe, and takes the exporter's answer as the only acknowledgement there is.

What happens when the install cannot write its own copy at all is not settled here. That decision is open, and this design does not pre-empt it.

# Design

The install's own table is the buffer, and delivery state is a single row holding the newest line the destination has acknowledged. A line is never marked delivered, so the record stays append-only in the database and the cursor is the only thing that moves.

A round reads every line above the cursor in order, emits it, sends the batch, and advances the cursor only when the exporter reports success. A refused batch leaves the cursor where it is, records when delivery began failing, and touches nothing about the act that produced the lines.

Delivery is at least once. Every record carries the line's sequence number, so a batch sent twice across a timeout is a duplicate the destination can see rather than a second event.

Where a destination exists, letting a line go is bounded by the cursor as well as by time. Where none exists, time and the floor alone decide, and the account of the prune is written into the record as before.

The health answer reports how far behind the destination is, and only where one is configured. A destination that is down is a held buffer, not an install that cannot serve, so it is never reported as unwell for it.

The exporter's own batching is not used for the send. It reports a failed export to an error handler and resolves regardless, and whether the export failed is the one fact the cursor depends on, so the install holds the batch itself and asks the exporter directly.
