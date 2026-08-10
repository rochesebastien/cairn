---
id: "01KZPM4W94NAQQ78HJRBEVBM45"
title: "Voir les escalations qui attendent un humain"
status: "proven"
createdAt: "2026-08-10T19:59:42.373Z"
surface: "escalations"
amends: null
amendedBy: null
acceptance:
  - "la section des escalations liste les stones qui attendent une décision humaine, avec leur titre"
  - "le nombre d'escalations en attente est visible depuis la navigation"
provenance:
  request: "1. Phase 6 : le dogfooding — c'est la prochaine étape déclarée du projet et elle n'a pas commencé (pas de `.cairn/` à la racine). Concrètement : `cairn init` sur `apps/desktop`, passer les premières demandes de fonctionnalités par le mason, laisser le warden les prouver, et brancher le ratchet `cairn verify --all --proven-only` dans la CI du repo lui-même.

    Execute tout ça, je te laisse la planficiation et l'orchestration, tu peux passer par des sub-agents Opus 5"
lastGreen:
  at: "2026-08-10T20:07:44.614Z"
  commit: "64975f84d2b45fa95f35485983ce863b76845c1f"
  proofHash: "93aedab7fef20ec0194b7b853000d6abca5f2722c6213ec2b9d8458c711ca5cb"
proof: ".cairn/proofs/01KZPM4W94NAQQ78HJRBEVBM45.spec.ts"
---

Une escalation est le seul statut dont aucun agent ne sort : seul un humain tranche, par un amendement ou un retrait. Ces stones ne doivent donc jamais dormir dans un coin — leur file d'attente doit être visible, et son ampleur lisible depuis la navigation.
