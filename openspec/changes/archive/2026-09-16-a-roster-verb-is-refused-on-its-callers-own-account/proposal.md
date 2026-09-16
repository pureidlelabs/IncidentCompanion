# A roster verb is refused on its caller's own account

## Why

*An administrator MUST be able to end a session* carries no exception for their own, and the route that ends one account's sessions was reachable with the caller's own address. It signs them out of the act they are performing: the sweep revokes every session the account holds, including the one the request arrived on, so the answer is returned to a caller who no longer exists. Nothing in the specification said what that should do, and the implementation did it.

The same shape one route over. An administrator could set their own role to `analyst`, which succeeds, takes the Accounts pane away with it, and leaves no way back -- the door that grants a role is the one they have just left. The last-administrator rule does not catch it: with a second administrator on the install nobody is stranded, so the install is fine and the person is not.

**`disable` already refuses this and the other two did not**, which is the tell that the rule was a property of one route rather than of the roster. Three verbs, one of them guarded.

**This narrows two requirements, and the narrowing is the point of writing it down.** *Managing the install and reaching case data are separate grants* says in as many words that an administrator can grant themselves data access, that no rule an administrator administers protects anybody from them, and that the product's answer is the record rather than a restriction. That principle is about power over *other people's* data, and it is not disturbed here: nothing below stops an administrator doing anything to anybody else, or to their own account through a door that says what it costs first.

The alternative was live and was rejected: leave the routes open and guard only the screen. It fails because the screen is a courtesy to whoever is reading it, never a permission -- an API caller reaches the route directly, and both acts are irreversible from where they leave the caller.

## What Changes

- The session requirement states that the route ending **one account's** sessions refuses the caller's own, and names the route that does end them: ending *every* session, which is confirmed and says that the administrator goes with everybody else.
- The administrator-role requirement states that an administrator does not change their own role, for the reason the last-administrator rule exists but at the level of the person rather than the install. Setting the role an account already holds is not a change and stays permitted.
- No change to what an administrator may do to anybody else, and none to the separation of the two planes.

## Impact

An administrator ending their own sessions or stepping down now meets a refusal naming the account they are signed in with. Ending their own sessions is done by ending every session, which the pane confirms first. Stepping down is done by another administrator, which is the same shape as the last-administrator rule and the same answer: the act that removes your ability to undo it is not one you perform on yourself.

An install with exactly one administrator is unaffected, because that case was already refused.
