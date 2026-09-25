# An account act is decided once

## Why

Two administrators demoting or disabling each other at the same moment could leave an install with nobody to administer it, because each checked for the last administrator against a state the other was changing (#1269). A disable, enable or role change whose stored change landed but whose remaining work failed was answered as nothing to do when asked again, so the account kept its open sessions and the act was never logged.

## What Changes

- **accounts-and-access**: of two administrators acting on each other at once, one succeeds and the other is refused, and somebody who can administer the install remains. An act whose change was made but whose answer failed is finished when asked again, and logged once.

## Impact

- Role, disable and enable changes run one at a time across the install. Each is decided by its own write, logged when that write changed something, and its remaining work runs on every request.
