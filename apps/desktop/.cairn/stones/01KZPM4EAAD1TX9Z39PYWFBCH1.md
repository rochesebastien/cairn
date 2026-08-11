---
id: "01KZPM4EAAD1TX9Z39PYWFBCH1"
title: "Passer en revue les drafts en attente"
status: "proven"
createdAt: "2026-08-10T19:59:28.075Z"
surface: "review"
amends: null
amendedBy: null
acceptance:
  - "la section de revue liste les stones en attente de décision, avec leur titre"
  - "le nombre de stones à revoir est visible depuis la navigation"
provenance:
  request: "1. Phase 6 : le dogfooding — c'est la prochaine étape déclarée du projet et elle n'a pas commencé (pas de `.cairn/` à la racine). Concrètement : `cairn init` sur `apps/desktop`, passer les premières demandes de fonctionnalités par le mason, laisser le warden les prouver, et brancher le ratchet `cairn verify --all --proven-only` dans la CI du repo lui-même.

    Execute tout ça, je te laisse la planficiation et l'orchestration, tu peux passer par des sub-agents Opus 5"
lastGreen:
  at: "2026-08-11T21:53:39.532Z"
  commit: "9673e6a0456992f2e0e2366307170262e7e9c858"
  proofHash: "fa0e62e8879634e0898f2cf4947696baa9b06f09cb8412577667c5384d9ec918"
proof: ".cairn/proofs/01KZPM4EAAD1TX9Z39PYWFBCH1.spec.ts"
---

Le draft est le moment bon marché pour corriger une promesse mal formulée, avant qu'un warden ne dépense un budget à la prouver. Encore faut-il voir ce qui attend : la revue doit présenter les stones en attente de décision, et leur nombre doit être visible sans entrer dans la section.
