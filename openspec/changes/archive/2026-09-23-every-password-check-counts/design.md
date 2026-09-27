# Scope

**The lock lives where a password is verified**, not at a door. Every door the install has, and any added later, checks a password through the one verification the authentication options name, so the lock and the count hold at a door nobody listed.

# Design

## One check, whatever the door

The verification runs the password hash check first, whatever the account's state, so a locked account costs what a wrong password does. It then finds the account the stored hash belongs to. A right password on an open account clears the count. A wrong one, or any answer while the account is locked, increments the count in one statement and locks the account when that count reaches the install's threshold; a lock already in force is not extended. The verification answers only yes or no, so a door refuses a locked account exactly as it refuses a wrong password.

## What is recorded, and where

The failure is recorded after the door answers, from the refusal the library returns: every refused sign-in, and a wrong-password refusal at any other door, each naming the door. The lock is recorded once, when it falls, with the address of the call being answered.

## An address with no account

For an address with no account the library hashes the offered password rather than verifying it, so the verification never runs. The record of that failure spends the same two statements against a hash nobody holds, so the answer for an address with no account costs what the answer for an account does.
