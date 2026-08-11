---
id: "01KZPM49DM9H5FBM3JEV33XHSB"
title: "Retrouver une stone par la recherche"
status: "proven"
createdAt: "2026-08-10T19:59:23.061Z"
surface: "search"
amends: null
amendedBy: null
acceptance:
  - "la recherche peut s'ouvrir au clavier, sans passer par la souris"
  - "taper une partie du titre d'une stone affiche cette stone dans les résultats"
  - "choisir un résultat ouvre la stone correspondante"
provenance:
  request: "1. Phase 6 : le dogfooding — c'est la prochaine étape déclarée du projet et elle n'a pas commencé (pas de `.cairn/` à la racine). Concrètement : `cairn init` sur `apps/desktop`, passer les premières demandes de fonctionnalités par le mason, laisser le warden les prouver, et brancher le ratchet `cairn verify --all --proven-only` dans la CI du repo lui-même.

    Execute tout ça, je te laisse la planficiation et l'orchestration, tu peux passer par des sub-agents Opus 5"
lastGreen:
  at: "2026-08-11T21:29:08.819Z"
  commit: "1f284d8147a913717bc53385aab53877ffb16710"
  proofHash: "85c7ac1e0ee2f93e88ee7a1b908fd214097d80a71edbe7670442be487e641f22"
proof: ".cairn/proofs/01KZPM49DM9H5FBM3JEV33XHSB.spec.ts"
---

Quand le cairn grossit, parcourir des listes ne suffit plus. Celui qui connaît un bout du titre d'une stone doit pouvoir la retrouver et l'ouvrir en quelques touches, sans quitter le clavier.
