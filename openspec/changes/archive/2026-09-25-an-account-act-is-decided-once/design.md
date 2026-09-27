# Design

**An account's role and whether it can sign in change one at a time across the install.** The check that somebody can still administer, the read of what the account holds and the write run with no other such change between them. The write decides whether anything changed, and the line is written when it did. What follows it — ending the account's sessions on a disable, bringing its open sessions to the new role — runs on every request, including one that changed nothing, so asking again finishes an act a failure cut short.
