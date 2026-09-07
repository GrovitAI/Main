# Parallel sessions and worktrees

Several AI sessions work on this repository at once. When they all share a
single checkout they stage each other's files, so one session's commit
captures another session's half-finished work. Git refuses to check out the
same branch in two worktrees, and that refusal is what keeps the sessions
apart. Give every session its own worktree.

## The worktrees

| Directory | Branch | Scope |
| :--- | :--- | :--- |
| `Grovit` | `main` | Integration only. Merge here; do not develop here. |
| `Grovit-mobile` | `feature/mobile-ui` | Phone and tablet UI, navigation, responsive layout |
| `Grovit-platform` | `feature/platform` | Security, migrations, RPCs, service layer, typing |
| `Grovit-finance` | `feature/finance` | Finance module and its screens |

All four share one `.git`, so a branch created in any worktree is visible in
every other immediately. Nothing is pushed or fetched between them.

## Adding a worktree

```bash
git worktree add ../Grovit-<name> -b feature/<name>
```

Then copy `.env` into it and run `npm install`. Neither is tracked by git, so
a new worktree starts without them.

## Merging back

From the `Grovit` checkout, merge each finished branch:

```bash
git merge feature/mobile-ui
```

Merge the smaller branch first. Whichever branch goes second resolves its
conflicts against everything already landed, which means fewer and
better-informed resolutions.

Merge often. Worktrees stop sessions from committing each other's files, but
they do not stop two sessions editing the same lines. Branches that sit for
days conflict badly, because the heavy files here — the inventory screen, the
analytics screen, the POS service layer — are touched by more than one stream.

## Running the app

Every worktree defaults to Metro on port 8081, so only one can run at a time
unless you say otherwise:

```bash
npx expo start --port 8082
```

Set the port on the command line rather than editing `.claude/launch.json`.
That file is tracked, so a per-worktree edit becomes a merge conflict.

## Cleaning up

Once a branch is merged:

```bash
git worktree remove ../Grovit-mobile
```

Then delete the branch with `git branch -d feature/mobile-ui`.

## Task numbering

Commits use a `task N:` prefix. Sessions currently pick `N` independently, so
the history has duplicates and gaps. Read the number as a label, not an
ordering. `git log --oneline` is the real sequence.
