---
id: "01KZPM3ZQYBBMAWTV9T6GM92HG"
title: "Voir l'activité des proofs sur l'année dès l'accueil"
status: "proven"
createdAt: "2026-08-10T19:59:13.151Z"
surface: "home"
amends: null
amendedBy: null
acceptance:
  - "en ouvrant l'application, la page d'accueil montre l'activité des proofs rejouées sur l'année, avec leur nombre total"
  - "la page d'accueil indique combien de dépôts sont couverts"
  - "choisir un projet dans le filtre restreint l'activité affichée à ce seul projet"
provenance:
  request: "1. Phase 6 : le dogfooding — c'est la prochaine étape déclarée du projet et elle n'a pas commencé (pas de `.cairn/` à la racine). Concrètement : `cairn init` sur `apps/desktop`, passer les premières demandes de fonctionnalités par le mason, laisser le warden les prouver, et brancher le ratchet `cairn verify --all --proven-only` dans la CI du repo lui-même.

    Execute tout ça, je te laisse la planficiation et l'orchestration, tu peux passer par des sub-agents Opus 5"
lastGreen:
  at: "2026-08-11T21:25:02.041Z"
  commit: "0d51e5f1b36089a853c89e591677c795c220d3af"
  proofHash: "1478c83cbafd6a1dd420d9617397dad2e094cb64246d2c0e5404d9499f4e4224"
proof: ".cairn/proofs/01KZPM3ZQYBBMAWTV9T6GM92HG.spec.ts"
---

Le cairn promet une garantie rejouée en continu. Sans vue d'ensemble, cette garantie est invisible : on ne sait ni combien de proofs ont été rejouées ni sur combien de dépôts. L'accueil doit rendre cette activité lisible d'un coup d'œil, et filtrable par projet quand on suit plusieurs dépôts.
