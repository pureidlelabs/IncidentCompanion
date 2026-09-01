# Scope

**An analyst's settings change nothing anybody else sees.** There is no install-wide appearance an operator imposes.

**The install's own settings are a closed set.** An operator cannot introduce one, because a setting nothing reads is one somebody believes is in force.

**What is shared with colleagues is only what distinguishes them.** How somebody has set the application to appear to their own eyes is not readable by anybody else.

**An uploaded image is never served back.** What is stored is the application's own re-encoding, always in one format, whatever arrived.

**The application's own marks are the only thing readable without a session**, because a browser asks for them before anybody has one.

# Design

## An upload is checked three times, and the checks are not redundant

The declared type must be one of the accepted ones, before the body is read at all. The bytes are then sniffed for what they actually are, and the two must agree. Only then is the image decoded.

**The sniff is not the same check as the allowlist.** A decoder asked to work out a format for itself will find one, including formats nobody meant to accept. Naming the acceptable formats and then confirming the bytes match the claim is what keeps the decoder from choosing.

**A format that can carry a program is never accepted.** An image is drawn wherever the analyst is drawn; a format that executes turns each of those into somebody else's code running under this install's origin. Since such a format is text rather than binary, it has no signature to sniff for — which is exactly why acceptance is an allowlist of formats that do have one, rather than a list of formats to reject.

## Re-encoding is the containment, not the checks

Everything above can be got past by a file that is a valid image and also something else. Decoding it and writing a new image from the pixels leaves nothing of the original file behind.

It also removes what an image carries besides the picture. A photograph taken on a phone carries where it was taken, and an analyst uploading one is not choosing to publish that to their colleagues.

## Both dimensions of cost are bounded

The bytes are bounded while they are read rather than after, so an oversized upload is refused without having been held.

The work of decoding is bounded separately, because a small file can describe an enormous image. A size limit alone does not bound the cost of the thing the size limit lets through.

## A refusal does not say which check failed

An unusable upload is refused with one answer whatever made it unusable. Distinguishing the causes tells somebody probing the upload path which check they got past, which is the half of the information they cannot get any other way.

## The version of an image is computed by the store

What tells a browser its cached copy is stale is incremented by the store as part of the write rather than read and written back by the application. Two uploads arriving together would otherwise both read the same value and both write the same one, and a browser would keep showing the old image.

## Install settings are administrative, and reading them is not

Changing one is an administrative act and is recorded as an administrative event.

Reading which are in force is not restricted, because a setting that changes what the application asks an analyst for is one they can observe the effect of anyway, and restricting the read would only make it harder to explain.
