#!/usr/bin/env bash
# Exports the public tree of the study and pushes it as one fresh commit.
#
# The public repository (bairdrt/scheduling-adherence-study) carries everything except harness/ (Winnie's vendored
# scheduler agent, held privately in bairdrt/scheduling-adherence-study-harness and cloned into harness/ by reviewers
# who are given access) and var/ (the anonymization and redaction maps, never published). The full history stays in
# the private working repository; each publish is a single commit of the exported tree as of the date in its message.
#
# Usage: tools/publish-public.sh [export-dir]   (default: a sibling folder, scheduling-adherence-study-public)
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="${1:-$(dirname "$SRC")/scheduling-adherence-study-public}"
REMOTE="https://github.com/bairdrt/scheduling-adherence-study.git"
DAY="$(date +%Y-%m-%d)"

mkdir -p "$DST"
# tracked files only, minus harness/ (var/ is never tracked)
( cd "$SRC" && git ls-files -z | grep -zv '^harness/' | tar --null -T - -cf - ) | tar -C "$DST" -xf -
# the public tree ignores a privately cloned harness so it never gets committed from there
grep -q '^harness/$' "$DST/.gitignore" || printf '# Winnie'"'"'s vendored scheduler agent: private snapshot, cloned here by reviewers on request. Never committed.\nharness/\n' >> "$DST/.gitignore"

# GitHub refuses workflow files from a token without the workflow scope (gh auth refresh -h github.com -s workflow)
if ! (gh auth status 2>&1 || true) | grep -q "'workflow'"; then rm -rf "$DST/.github"; echo "note: the gh token lacks the workflow scope; .github/ left out of this publish"; fi

cd "$DST"
[ -d .git ] || { git init -q -b main; git remote add origin "$REMOTE"; }
git add -A
if git diff --cached --quiet; then echo "nothing changed since the last publish; pushing whatever is not yet on the remote"; git push -u origin main; exit 0; fi
git -c "user.email=$(git -C "$SRC" config user.email)" -c "user.name=$(git -C "$SRC" config user.name)" commit -q -m "Study as of $DAY

Exported from the private working repository by tools/publish-public.sh. The harness under test (harness/) is held
privately and is available to reviewers on request; without it the bench and graders do not run.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A4CNQAFSp4kupFpBXmuFVK"
git push -u origin main
echo "published $(git rev-parse --short HEAD) to $REMOTE"
