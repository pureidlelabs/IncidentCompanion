"""The install makes no outbound request, so it can reach nobody's platform.

`incident-import` reads Article V against a product whose purpose is to reach
data an operator already owns:

    An install MUST NOT make an outbound request to a detection platform.
    Where an incident is brought in from one, the analyst's browser MUST be
    what talks to that platform, using a credential the analyst holds, and the
    install MUST receive only what the analyst's browser sends it.

    An install with no connection configured MUST make no request to any
    platform at all.

**The boundary is not crossed by the data arriving; it would be crossed by the
install holding a credential to fetch it unattended.** So the property is about
the server having no way to call out at all, which is a claim about the whole
of `server/src` rather than about one module -- and a test naming one module
would pass while a second grew a client.

The browser's half of the arrangement is `connectSrc` in `wire/headers.ts`,
which names the two Azure origins so the analyst's own tab may reach them, and
`ui/src/api/sentinel/armSource.ts`, which refuses to attach the bearer to
anywhere else.
"""

from __future__ import annotations

import re

from tests._repo import REPO_ROOT

#: Where the server's own code lives. Tests may call out; the product may not.
ROOT = REPO_ROOT / "server" / "src"

#: Every way this tree could start an outbound request.
#:
#: Spelled as separate patterns rather than one alternation so a failure names
#: which mechanism appeared. `request(` is deliberately absent: Nest's own
#: `@Req() request` and a dozen local helpers use the word, and a pattern that
#: matches them reports noise nobody reads.
CALLERS = {
    "fetch": re.compile(r"\bfetch\s*\("),
    "axios": re.compile(r"\baxios\b"),
    "node-fetch": re.compile(r"['\"]node-fetch['\"]"),
    "undici": re.compile(r"['\"]undici['\"]"),
    "got": re.compile(r"\bgot\s*\(\s*['\"]https?:"),
    "http.request": re.compile(r"\bhttps?\.request\s*\("),
    "superagent": re.compile(r"['\"]superagent['\"]"),
    "XMLHttpRequest": re.compile(r"\bXMLHttpRequest\b"),
}


def _sources() -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for path in sorted(ROOT.rglob("*.ts")):
        if ".test." in path.name or path.name.endswith(".d.ts"):
            continue
        found.append((str(path.relative_to(REPO_ROOT)), path.read_text(encoding="utf-8")))
    return found


#: What the install can be configured with at all.
ENV = REPO_ROOT / "server" / "src" / "config" / "env.ts"

DECLARED = re.compile(r"^\s{2}([A-Z][A-Z0-9_]*):", re.MULTILINE)

#: Words that would make a key a credential for somebody else's platform.
#:
#: `AUTH_SECRET` signs this install's own sessions and is not one of these,
#: which is why the patterns name the platform rather than the word *secret*.
A_PLATFORM_CREDENTIAL = re.compile(
    r"AZURE|SENTINEL|TENANT|\bARM_|DEFENDER|CROWDSTRIKE|SPLUNK|OKTA|CLIENT_SECRET|CLIENT_ID|API_KEY",
)


def test_the_install_is_configured_with_no_platform_credential() -> None:
    """*The install holds no credential for that platform*, and cannot be given one.

    The environment schema is the whole of what an operator may configure, so a
    credential absent from it is a credential the install has no way to hold --
    which is the half of the scenario that a sweep for outbound calls cannot
    reach. An install able to hold one could fetch unattended the day somebody
    added the call.
    """
    keys = DECLARED.findall(ENV.read_text(encoding="utf-8"))

    assert len(keys) > 5, "no environment keys were read, so this asserts nothing about them"

    holding = [key for key in keys if A_PLATFORM_CREDENTIAL.search(key)]
    assert not holding, (
        "the install can be configured with a credential for somebody else's platform, so "
        "it is able to fetch on its own account rather than receiving what an analyst's "
        f"browser sends it: {holding}"
    )


def test_there_is_a_server_tree_to_sweep() -> None:
    """The vacuity guard: every assertion below is that nothing was found."""
    assert len(_sources()) > 100, (
        "the server source tree is nearly empty, so the sweep below is reporting that "
        "it found no HTTP client in no files"
    )


def test_the_server_starts_no_outbound_request() -> None:
    """A client anywhere in the server is a way to reach a platform unattended."""
    calling: list[str] = []
    for path, text in _sources():
        for mechanism, pattern in CALLERS.items():
            for line, content in enumerate(text.splitlines(), start=1):
                # A comment naming `fetch` is prose, not a call. The rule is
                # about what the process does, and a docstring does nothing.
                stripped = content.lstrip()
                if stripped.startswith(("*", "//", "/*")):
                    continue
                if pattern.search(content):
                    calling.append(f"{path}:{line} ({mechanism})")

    assert not calling, (
        "the server can start an outbound request, so an install holds a way to reach a "
        "platform without an analyst's browser and without an analyst's credential -- "
        "which is the boundary Article V draws:\n" + "\n".join(f"  {one}" for one in calling)
    )
