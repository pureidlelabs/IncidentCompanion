# Scope

**Order is kept per connection, and nowhere wider.** Two connections, including two tabs of one analyst, are two writers whose frames interleave however they arrive; prose merges them and a version check judges everything else.

# Design

## A connection hears from its first moment, one frame at a time

A connection listens from the moment it is accepted, before anything about it is prepared. Every frame it receives joins one sequence, and each is acted on to completion before the next one starts, so what a frame does can never overtake what the frame before it did.

Preparing the connection heads that sequence. What arrives while it is still being prepared waits behind it, and a preparation that fails ends the connection with nothing in the sequence acted on.

The connection's own end is the last thing in the sequence. A frame sent just before a tab closes is acted on before the connection lets go of what it had open, which is what keeps prose typed during a drop from being lost when the tab closes straight after the return.

The number of frames waiting is bounded, and a connection past the bound is ended rather than allowed to hold an unbounded backlog.
