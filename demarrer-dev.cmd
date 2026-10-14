@echo off
cd /d "%~dp0serveur"
if not exist node_modules call npm ci
set FIWAKTI_RACINE=%~dp0.dev
set FIWAKTI_PORT=8099
node principal.js
