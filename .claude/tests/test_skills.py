"""Every skill in `.claude/skills/` is discoverable.

A skill is found and invoked by its frontmatter. Without it the file is a
document nobody can reach through the mechanism it was written for, and
nothing says so -- `docstring-freshness` shipped that way, and it was found
by accident while validating an unrelated new skill's own frontmatter.
"""
import pathlib
import re

#: Skills written here. **The `openspec-*` family is installed by its own
#: tooling and rewritten wholesale on an update**, so holding it to this
#: repository's conventions grades somebody else's file and the fix survives
#: until the next version lands. Same exemption `.vale.ini` gives them.
VENDORED = ("openspec-",)

SKILLS = sorted(
    p for p in (pathlib.Path(__file__).resolve().parents[1] / "skills").glob("*/SKILL.md")
    if not p.parent.name.startswith(VENDORED)
)


def _frontmatter(path: pathlib.Path) -> dict[str, str]:
    match = re.match(r"^---\n(.*?)\n---\n", path.read_text(), re.S)
    if not match:
        return {}
    return dict(re.findall(r"^([a-z_]+): (.+)$", match.group(1), re.M))


def test_every_skill_declares_its_name_and_description():
    """`assert SKILLS` is the load-bearing line.

    Globbed at a path that stops matching -- the day skills move, or gain a
    second layout the way plugins did -- an empty sweep passes and reads as
    every skill being correct. That shape has cost real coverage here twice.
    """
    assert SKILLS, "no skills found; the glob has gone stale"

    for skill in SKILLS:
        front = _frontmatter(skill)
        assert front, f"{skill.parent.name}: no frontmatter, so nothing can find it"
        assert front.get("name") == skill.parent.name, (
            f"{skill.parent.name}: declares name {front.get('name')!r}"
        )
        assert front.get("description"), f"{skill.parent.name}: no description"


def test_every_skill_description_says_when_to_use_it():
    """A description is matched against a task, not read as a title.

    One that only names the subject ("The API surface") competes with every
    other skill on that subject and is chosen by nothing. The shipped ones
    all state a trigger and most state the failure mode; the shortest is
    ~270 characters, which is the floor this pins.
    """
    assert SKILLS
    for skill in SKILLS:
        description = _frontmatter(skill)["description"]
        assert len(description) >= 200, (
            f"{skill.parent.name}: description is {len(description)} chars and "
            f"probably only names the subject"
        )
        assert re.search(r"\bUse\b|\buse (it|when|this)\b", description), (
            f"{skill.parent.name}: description never says when to use it"
        )
