# Tasks

## 1. The pack is what resolves a heading

- [x] 1.1 Take the resolved pack as a parameter wherever a heading is drawn, rather than reading a map in the bundle
- [x] 1.2 Make it a parameter the caller must pass, so a caller that forgets is a compile error and not an English word
- [x] 1.3 Draw a key the pack has not answered for as itself, and keep it marked unresolved

## 2. The right pack is fetched

- [x] 2.1 Key the query on the open report's own language
- [x] 2.2 Ask for the install's default where no report is open, or where the report names none

## 3. What it must not do

- [x] 3.1 Let a component read the bundled map again, under this name
- [x] 3.2 Invent a word for a key the pack does not answer

## 4. Left open

- [ ] 4.1 The report index lists reports that may each be in a different language, and draws one pack — the open report's, or the install's. A pack per row is a query per language, and the list shows running orders rather than the document
- [ ] 4.2 Whether the layout picker's own chips should follow a language before a report exists to have one
