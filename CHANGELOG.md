# Notes de version

## 1.0.0 — 2026-10-23

Première version.

* Élément `<hmi-synoptic>` : charge un SVG (attribut `src`, propriété `source` ou `<template>` enfant), le nettoie et l'anime à partir de vos valeurs.
* 13 liaisons : `level`, `spin`, `angle`, `move`, `flow`, `text`, `state`, `visible`, `alarm`, `fill`, `stroke`, `blink`, `select`. Déclaration par attributs `data-hmi-*`, par convention d'identifiant ou de calque (`TAG--type`, compatible Inkscape, Figma, draw.io) ou par configuration JSON.
* Alarmes ISA-18.2 : seuils LL/L/H/HH avec hystérésis, priorités 1 à 4 (forme, couleur, numéro), acquittement, événement `hmi-alarm`.
* Qualité de donnée (bonne, incertaine, mauvaise, figée) affichée sans couleur seule.
* Une seule boucle d'animation : mises à jour regroupées par image, arrêt complet au repos, pause hors écran, respect de `prefers-reduced-motion`.
* Nettoyage des SVG importés : scripts, gestionnaires `on*`, liens et ressources externes retirés.
* Adaptateurs WebSocket (reconnexion progressive), Server-Sent Events et interrogation périodique ; marquage « figé » à la perte de liaison.
* Fonction `attachSynoptic()` pour animer un SVG déjà présent dans la page sans Web Component.
* Thème clair et sombre par variables CSS, compatibles hmi-kit.
* Édition complète : bibliothèque de symboles générés (`hmi-synoptic/symbols`), synoptiques de station d'eau et de chaufferie avec simulation, catalogue des symboles, atelier de liaison par glisser-déposer.
* 45 tests unitaires, 8 tests navigateur, banc de performance (`docs/performance.md`).
