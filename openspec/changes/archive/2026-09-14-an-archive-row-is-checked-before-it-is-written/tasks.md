# Tasks

## 1. The shape an archive row is judged by

- [x] 1.1 Declare, per collection, the shape a row from an archive must take
- [x] 1.2 Widen it by the columns an export carries and no analyst writes, without restating a bound the column already states
- [x] 1.3 Choose a timeline row's shape by its own kind, and refuse a row naming neither

## 2. The import asks it

- [x] 2.1 Parse each row before writing it, rather than filtering its keys by column name
- [x] 2.2 Report a value only the store can refuse as a refusal naming the collection
- [x] 2.3 Refuse whole, leaving no case behind

## 3. What it must not do

- [x] 3.1 Refuse a field this build does not know, rather than dropping it
- [x] 3.2 Let a collection be written with nothing able to judge its rows

## 4. Left open

- [ ] 4.1 Whether the demo seeder and any other path that writes rows from a file has the same gap — named as not checked in #625 and still not measured
