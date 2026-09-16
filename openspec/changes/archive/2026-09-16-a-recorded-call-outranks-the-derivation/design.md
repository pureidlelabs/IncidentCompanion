# Scope

Only NIS2 lets an analyst record a determination today. DORA and GDPR derive theirs and offer no field to record one, so the requirement reaches one regime in practice and is written against any regime that grows such a field.

The recorded call answers the significance test and nothing else. Scope stays derived, and so does everything upstream of the verdict — which authority, which deadline, what the case can say towards it.

There is no way for an analyst to record a determination and have the derivation shown beside it as a disagreement. Detecting that the two differ is a separate piece of work, and the closest thing to it is the requirement that a disagreement between a case's facts and its customer's is detectable.

# Design

**The recorded call replaces the derived criteria rather than joining them.** The combinators are AND over parts, so a derived `false` sitting beside a recorded `significant` would settle the gate at false and the override would not survive its own gate. Passing the derived body as a part cannot express *this outranks that*.

Showing the derived criteria underneath as context was the alternative. It is not taken because a criterion in an assessment is one the application *weighed*, and once the analyst has made the call the application weighed none of them — a breakdown listing thresholds that did not decide anything invites the reader to check the verdict against them.

**Scope is a separate gate part and stays one.** A recorded determination joins the gate beside scope rather than replacing it, so an unclassified entity is undecidable however the call was recorded. That keeps the three outcomes distinct: the recorded call can make an assessment decided, never in scope.
