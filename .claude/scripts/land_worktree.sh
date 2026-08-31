#!/usr/bin/env bash
# Land a worktree branch onto the release branch, from the main checkout.
#
# **This exists because a worktree session cannot land its own work.** git
# refuses to update a branch checked out elsewhere, so the merge has to run
# where the release branch lives -- see rules/git-workflow.md section 8. A
# background job's last act is to hand over, and this is what it hands over.
#
#   ./.claude/scripts/land_worktree.sh <branch> [worktree-path]
#
# Every step gates on the one before it in the same shell, because a pipeline
# reports the last stage's status and section 8 records a worktree holding an
# unmerged commit being deleted exactly that way.
set -u

BRANCH="${1:-}"
if [ -z "$BRANCH" ]; then
    echo "usage: $0 <branch> [worktree-path]" >&2
    exit 2
fi
WORKTREE="${2:-.claude/worktrees/$(basename "$BRANCH")}"

cd "$(git rev-parse --show-toplevel)" || exit 1

RELEASE="$(git branch --show-current)"
if [ -z "$RELEASE" ]; then
    echo "The main checkout is on a detached HEAD; switch to the release branch first." >&2
    exit 1
fi

# Superseded for landings: `main` is reached by pull request only. → skills/land.
echo "Landing $BRANCH onto $RELEASE"

if [ -n "$(git status --porcelain)" ]; then
    echo "The main checkout is dirty. Landing onto a dirty tree makes the merge" >&2
    echo "and whatever was in flight indistinguishable afterwards." >&2
    exit 1
fi

git merge --ff-only "$BRANCH" > /tmp/land-merge.log 2>&1; M=$?
if [ $M -ne 0 ]; then
    echo "Merge refused (exit $M). Nothing else has run:" >&2
    cat /tmp/land-merge.log >&2
    echo "" >&2
    echo "If $RELEASE moved, merge it down in the worktree, re-run the suite on" >&2
    echo "the merged tree, get it reviewed again, then come back." >&2
    exit $M
fi
echo "Merged. $RELEASE is now $(git rev-parse --short HEAD)"

# Backup, not publication: the release branch is pushed after every merge
# without asking, and it fires no CI.
git push origin "$RELEASE" > /tmp/land-push.log 2>&1; P=$?
if [ $P -ne 0 ]; then
    echo "Push failed -- the merge stands, so re-run just the push:" >&2
    cat /tmp/land-push.log >&2
    exit $P
fi
echo "Pushed $RELEASE."

# Look before deleting: an ignored path can be the only copy of a measurement,
# and a refused `worktree remove` has already deleted every tracked file.
if [ -d "$WORKTREE" ]; then
    LEFTOVER="$(git -C "$WORKTREE" status --porcelain --ignored 2>/dev/null \
        | grep -Ev '__pycache__|\.pytest_cache|\.ruff_cache|/\.venv|node_modules|/dist/')"
    if [ -n "$LEFTOVER" ]; then
        echo ""
        echo "Not removing $WORKTREE -- it holds something that is not build output:"
        echo "$LEFTOVER"
        echo "Remove it yourself once you have looked."
        exit 0
    fi
    # **The path as an argument, not as a command string.** `--worktree` hands
    # the check the directory directly, so there is no `/tmp` file two landings
    # can race on and no shell text a metacharacter in the path can break out
    # of. Any non-zero is a refusal, which fails closed on cleanup - the merge
    # and push already stand, so a worktree left up is recoverable and a
    # worktree torn down under a running stack is not.
    GUARD="$(git rev-parse --show-toplevel)/.claude/scripts/stack_check.py"
    if [ -f "$GUARD" ]; then
        python3 "$GUARD" --worktree "$WORKTREE"; G=$?
        if [ $G -ne 0 ]; then
            echo "" >&2
            # The check prints its own reason (a running stack, a refused
            # socket) before this. A bare non-zero with nothing above it is the
            # check itself failing to run -- a missing python3 -- and cleanup
            # fails closed either way, since the merge and push already stand.
            echo "Stack check returned $G. The merge and the push are done;" >&2
            echo "only the cleanup is left, and it is safe to retry." >&2
            exit 0
        fi
    else
        # **Check-absent fails closed, like every other cleanup refusal here.**
        # A missing script means the stack cannot be checked, and removing the
        # worktree anyway is the abandonment the guard exists to prevent. The
        # merge and push already stand, so stopping here loses nothing.
        echo "" >&2
        echo "No stack guard at $GUARD, so an abandoned stack cannot be" >&2
        echo "checked. The merge and push are done; take the stack down and" >&2
        echo "remove the worktree yourself:" >&2
        echo "  (cd $WORKTREE && node server/scripts/stack.mjs --compose down -v)" >&2
        echo "  git worktree remove $WORKTREE" >&2
        exit 0
    fi

    git worktree remove "$WORKTREE" > /tmp/land-rm.log 2>&1; R=$?
    if [ $R -ne 0 ]; then
        echo "Worktree not removed:" >&2
        cat /tmp/land-rm.log >&2
        # A lock is the ordinary reason, and it means a session is (or was)
        # live in there. git refuses a locked worktree without checking whether
        # the locking pid is alive, so this is also what a crashed session
        # leaves behind. Never force it from here: `remove -f -f` would delete
        # the directory out from under a running session.
        if grep -q "locked working tree" /tmp/land-rm.log 2>/dev/null; then
            echo "" >&2
            echo "That worktree is locked, which means a session is using it." >&2
            echo "The merge and push are done -- only cleanup is left. Once the" >&2
            echo "session has exited:" >&2
            echo "  git worktree unlock $WORKTREE" >&2
            echo "  git worktree remove $WORKTREE" >&2
            echo "  git branch -d $BRANCH" >&2
        fi
        # `branch -d` can only fail while the worktree still holds the branch,
        # so stop rather than printing a second refusal that means the same
        # thing.
        exit 0
    fi
    echo "Removed $WORKTREE."
fi

# `-d`, never `-D`: refusing an unmerged branch is the only automatic check
# between tidying up and losing work.
git branch -d "$BRANCH" > /tmp/land-branch.log 2>&1; B=$?
if [ $B -ne 0 ]; then
    echo "Branch kept:" >&2
    cat /tmp/land-branch.log >&2
else
    echo "Deleted $BRANCH."
fi
