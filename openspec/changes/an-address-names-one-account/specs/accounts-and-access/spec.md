# Accounts and access

## ADDED Requirements

### Requirement: An address names one account, whatever case it is spelled in

An install MUST NOT hold two accounts whose addresses differ only in case. An address is how a person is named to the application, and two accounts answering to one name is an ambiguity every later decision inherits: which of them a password was reset for, which one a lockout was cleared on, which one signed in.

The refusal MUST be made where a simultaneous second attempt cannot pass it. Two administrators creating the same account at the same moment both find no such account, so a check made before the write is not a refusal.

Every act naming an account by its address MUST reach the account that address names, whatever case either spelling uses. An act that silently reaches none is worse than one that is refused: an administrator who resets a password and is told it worked has no way to learn that nothing changed.

An act naming an account by its address MUST affect that account and no other. Where a control exists to slow an attacker — a lockout, a hold on a password somebody else chose — an act reaching a second account silently removes that control from an account nobody named.

#### Scenario: An account is created in a second spelling of an address already held

- GIVEN an install holding an account for an address
- WHEN an administrator creates an account for the same address spelled in another case
- THEN it is refused
- AND the install still holds one account for that address

#### Scenario: Two administrators create the same account at the same moment

- GIVEN an install holding no account for an address
- WHEN two administrators create an account for it at the same moment
- THEN exactly one account exists afterwards
- AND the other is told the account already exists

#### Scenario: An account is administered by a differently cased spelling

- GIVEN an account held under one spelling of its address
- WHEN an administrator names it by the same address in another case
- THEN the act reaches that account

#### Scenario: A lockout is cleared

- GIVEN an account whose sign-ins are locked out
- WHEN an administrator clears it
- THEN no other account's lockout is cleared
