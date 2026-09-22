# Accounts and access

## ADDED Requirements

### Requirement: A list that names cases names only the ones the analyst reaches

Where the application answers with a list that names cases rather than the contents of one case, it MUST name only the cases the asking analyst reaches, decided by the same rule that decides whether they reach one case by name.

A list built from what an analyst has already opened MUST be decided when it is read rather than when it was written, so that reach withdrawn after the visit withdraws the case from the list. A case kept in such a list deliberately MUST be withdrawn on the same terms as one that was not.

A case the install has attributed to nobody MUST stay named, because it is the default customer's and every account reaches that.

#### Scenario: A list is asked for by an analyst in no group

- GIVEN an administrator belonging to no group
- WHEN they ask for a list that names cases
- THEN no case of a customer somebody has been onboarded as is named by it
- AND a case the install has attributed to nobody is named by it
- AND they may grant themselves the access and ask again

#### Scenario: Reach is withdrawn after the case was opened

- GIVEN an analyst who has opened a case, and kept it in their list
- WHEN the group that reached it is revoked
- THEN the list stops naming that case
