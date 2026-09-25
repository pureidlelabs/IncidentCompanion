# Design

**A guard reading past the caller answers only inside the caller's reach.** A guard that reads another row as the tables' owner to decide about a write reads it only once the boundary has admitted the row being written, and refuses a named row outside that row's own case as the boundary refuses, with the answer a row that does not exist gets. It neither reports nor locks a row the caller does not reach.
