#!/bin/sh
cd "$(dirname "$0")/serveur" || exit 1
[ -d node_modules ] || npm ci
FIWAKTI_RACINE=../.dev FIWAKTI_PORT=8099 exec node principal.js
