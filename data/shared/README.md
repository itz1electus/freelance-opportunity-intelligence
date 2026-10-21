# Shared team data

This folder is the only part of `data/` that is committed to Git (ADR-020, D-025). It holds the team's profile data as readable JSON (D-029):

| Path | Contents |
| --- | --- |
| `foi-shared.json` | Format marker and version |
| `partners/a.json`, `partners/b.json` | Each partner's name, hours, skills, services, qualifications, exclusions and notes |
| `evidence/<id>.json` | One file per portfolio item, with the partners it credits |
| `taxonomy/skills.json` | Skills your team added to the vocabulary |
| `studio/current.json` | Identity of the current combined studio profile |

FOI rewrites these files after every change you make in the app. Later phases add saved searches, settings, pipeline items, and scores and assessments where a source's terms allow it.

**Working with Git:** commit and push these files like code. After `git pull`, FOI notices the changed files and asks you to load them; until you do, profile edits are paused so a teammate's work is never overwritten. If a pull leaves merge-conflict markers (`<<<<<<<`), FOI names the file; fix it, then choose **Try again**.

Never put secrets, marketplace listing text or database files here; the pre-commit check blocks them.
