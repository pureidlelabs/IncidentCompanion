# Tasks

## 1. A save names its writers

- [x] 1.1 Remember who wrote into prose and name them on the save, the record of changes and the audit, and verify with `server/test/prose-names-whoever-wrote-it.test.ts`

## 2. A derived field has one writer

- [x] 2.1 Refuse a single or bulk write naming a derived field, and verify with `server/test/a-note-has-one-writer.test.ts`
- [x] 2.2 Store a row's first words the first time its prose is opened, and verify with the reconnect case in the same test
