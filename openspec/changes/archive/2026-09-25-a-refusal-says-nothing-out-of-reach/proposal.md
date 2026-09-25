# A refusal says nothing out of reach

## Why

The guard on a sent report's parts read the report a part named before row-level security decided whether the writer reached the part's case, so a write naming another case's sent report was refused with that report's id, label and send time, and held a lock on it (#1226). The boundary requirement said the store returns none of an unreached case's rows; it did not say a refusal is one of the ways a row can be returned.

## What Changes

- **state**: a refusal says nothing of a row its caller does not reach and holds nothing of it, and a write naming such a row is answered as one naming a row that does not exist.

## Impact

- The store's guard on a sent report's parts reads the report a part joins only after row security has admitted the part, and refuses a report outside the part's own case as the boundary refuses.
