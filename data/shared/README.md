# Shared team data

This folder is the only part of `data/` that is committed to Git (ADR-020, D-025).

From Phase 2, FOI rewrites these files whenever team-owned data changes: both partner profiles, skills, evidence, services, saved searches, settings, pipeline items, and scores and technical assessments where the source's terms allow storing them. A teammate who clones the repository and runs `npm start` gets a database rebuilt from these files.

Never put secrets, marketplace listing text or database files here; the pre-commit check blocks them.
