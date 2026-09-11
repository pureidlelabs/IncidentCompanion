# Scope

Where a case's reports are listed, and what each listing is. Not what a report holds, not what freezes one, and not what the address names -- all three are already settled.

The list is derived from the read the rail already makes, so nothing here adds a fetch and nothing caches a second copy of what reports a case holds.

The listing is navigation only. Which report the pane draws, and what the pane does with it, stay where they were.

# Design

**What a case holds is part of knowing the case, so the reports are listed wherever the case is navigated from.** A list drawn by the screen that reads a report exists only while that screen does, which makes it a property of one section rather than of the case.

**Each entry is a destination carrying its own address.** An entry that acts rather than addressing is reachable only where it was drawn and cannot be opened alongside what is already open; an entry that addresses survives the section it was drawn on, which is the whole of what makes the list navigation.

**Moving between reports replaces the history entry; arriving from elsewhere adds one.** Both halves follow from the same rule -- the history should say where the analyst came from. Four reports read in a row are one stop, so replacing is right inside the section; the section an analyst arrived from is a stop of its own, so replacing on the way in would make Back skip it.

**A row carries forward only the parameters of the section it is drawn on.** The address is shared with whatever the current section keeps there, and from another section those parameters belong to the section being left: carrying them writes state no report reads into the report's address, where every later write preserves it and any shared link repeats it. The fragment is dropped for the same reason, so the two halves of the address agree.

**A spent command never travels.** A command that reached a section on the address is cleared outside the routing layer, so that layer's copy still names one that has run; any address composed from it has to drop the command or the screen carries it out a second time.

**The entry marked is the one that resolved.** An address naming a report the case no longer holds draws the index, so marking by the identifier asked for would leave that screen with nothing marked at all.

**How many reports a case holds does not depend on the section being read.** A count that is drawn by one screen disappears with it, which reads as the case having lost them.
