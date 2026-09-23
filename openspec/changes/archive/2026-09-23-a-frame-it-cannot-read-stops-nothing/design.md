# Scope

**A frame the install cannot read is not answered.** It is ignored, as one that is not JSON is, and the client is told nothing.

# Design

## A connection hears from its first moment, one frame at a time

The sequence holds up when a frame fails. A frame that parses but is not an object is set aside without a word, the same as one that does not parse, because it is the client's mistake and not the install's. A frame whose action fails is reported to the operator and set aside. Either way the frames behind it and the connection's end still run in their turn.
