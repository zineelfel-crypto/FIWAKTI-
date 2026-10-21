# FIWAKTI - mise à jour d'une installation 56.33.10, 56.33.11 ou 56.33.12 vers la version livrée dans ce dossier
# (installation lancée par une tâche planifiée Windows, comme pour les correctifs).
# Usage (PowerShell en administrateur, dans ce dossier) :
#   powershell -ExecutionPolicy Bypass -File .\METTRE-A-JOUR.ps1 -Verifier     (contrôles seulement, rien n'est modifié)
#   powershell -ExecutionPolicy Bypass -File .\METTRE-A-JOUR.ps1               (mise à jour)
#   powershell -ExecutionPolicy Bypass -File .\METTRE-A-JOUR.ps1 -Retour       (revenir à la version d'avant)
# Options : -Racine C:\FIWAKTI  -Tache FIWAKTI  -Port 8080  -Url http://localhost:8080  -SansControleSauvegarde
# Les données (C:\FIWAKTI\donnees) ne sont ni copiées ni modifiées par ce script : la base est mise à niveau par
# FIWAKTI lui-même au démarrage. L'ancienne version reste dans C:\FIWAKTI\versions, pour le retour arrière.
param(
  [string]$Racine = "C:\FIWAKTI",
  [string]$Tache  = "FIWAKTI",
  [int]$Port      = 8080,
  [string]$Url    = "",
  [switch]$Verifier,
  [switch]$Retour,
  [switch]$SansControleSauvegarde
)
$ErrorActionPreference = "Stop"
$Ici = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Url) { $Url = "http://localhost:" + $Port }
$Url = $Url.TrimEnd("/")
try { [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true } } catch { }
try { [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 } catch { }

function Ecrire($m, $c) { if ($c) { Write-Host $m -ForegroundColor $c } else { Write-Host $m } }
function Arret($m) { Ecrire ("ÉCHEC : " + $m) "Red"; try { Stop-Transcript | Out-Null } catch { }; exit 1 }
function NumVersion($v) { $p = ([string]$v).Split("."); $n = 0; for ($i = 0; $i -lt 3; $i++) { $x = 0; if ($i -lt $p.Count) { [void][int]::TryParse($p[$i], [ref]$x) }; $n = $n * 1000 + $x }; return $n }
function Sante() {
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 ($Url + "/api/sante"); return ($r.Content | ConvertFrom-Json) } catch { return $null }
}
function AttendreVersion($v, $secondes) {
  for ($i = 0; $i -lt [int]($secondes / 3); $i++) { Start-Sleep -Seconds 3; $s = Sante; if ($s -and $s.version -eq $v) { return $s } }
  return $null
}
function ArreterFiwakti() {
  Stop-ScheduledTask -TaskName $Tache -ErrorAction SilentlyContinue
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    $ecoute = $null
    try { $ecoute = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue } catch { }
    if (-not $ecoute) { return $true }
  }
  return $false
}
function DemarrerFiwakti() { Start-ScheduledTask -TaskName $Tache }
function LireTexte($f) { if (Test-Path $f) { return ([string](Get-Content -Raw -Path $f)).Trim() } else { return "" } }
function EcrireTexte($f, $t) { [System.IO.File]::WriteAllText($f, $t + "`n") }
# remplace « versions\<x> » par « versions\<y> » dans un texte (séparateur \ ou /)
function RemplacerVersion($texte, $de, $vers) {
  if (-not $texte) { return $texte }
  return [regex]::Replace($texte, "(versions[\\/])" + [regex]::Escape($de) + "(?=[\\/""\s]|$)", ('${1}' + $vers))
}

function ActionsVers($actions, $de, $vers) {
  $nouv = @()
  foreach ($a in $actions) {
    $arg = RemplacerVersion ([string]$a.Arguments) $de $vers; $wd = RemplacerVersion ([string]$a.WorkingDirectory) $de $vers; $ex = RemplacerVersion ([string]$a.Execute) $de $vers
    if ($arg -and $wd) { $nouv += New-ScheduledTaskAction -Execute $ex -Argument $arg -WorkingDirectory $wd }
    elseif ($arg) { $nouv += New-ScheduledTaskAction -Execute $ex -Argument $arg }
    elseif ($wd) { $nouv += New-ScheduledTaskAction -Execute $ex -WorkingDirectory $wd }
    else { $nouv += New-ScheduledTaskAction -Execute $ex }
  }
  return ,$nouv
}

$VD = Join-Path $Racine "versions"; $DON = Join-Path $Racine "donnees"
if (-not (Test-Path $VD) -or -not (Test-Path $DON)) { Arret "« $Racine » n'est pas une racine FIWAKTI (dossiers versions et donnees attendus). Indiquez-la avec -Racine." }
$Journaux = Join-Path $DON "journaux"; New-Item -ItemType Directory -Force -Path $Journaux | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
try { Start-Transcript -Path (Join-Path $Journaux ("mise-a-jour-" + $Stamp + ".log")) | Out-Null } catch { }

# compte administrateur (Windows)
if ([Environment]::OSVersion.Platform -eq "Win32NT") {
  $id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Arret "lancez PowerShell en tant qu'administrateur." }
}

# tâche planifiée qui lance FIWAKTI
$T = $null
try { $T = Get-ScheduledTask -TaskName $Tache -ErrorAction Stop } catch { Arret "tâche planifiée « $Tache » introuvable. Indiquez son nom avec -Tache (Planificateur de tâches Windows)." }

# ======================= retour à la version d'avant =======================
if ($Retour) {
  $dern = Get-ChildItem -Path (Join-Path $Racine "correctifs") -Directory -Filter "avant-mise-a-jour-*" -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $dern) { Arret "aucune sauvegarde de mise à jour (correctifs\avant-mise-a-jour-*) : rien à restaurer." }
  $etat = Get-Content -Raw -Path (Join-Path $dern.FullName "etat.json") | ConvertFrom-Json
  Ecrire ("Retour à la version " + $etat.ancienne + " (sauvegarde " + $dern.Name + ")") "Cyan"
  if (-not (ArreterFiwakti)) { Arret "le port $Port est toujours occupé : arrêtez FIWAKTI puis relancez." }
  if ($etat.mode -eq "tache") { Set-ScheduledTask -TaskName $Tache -Action (ActionsVers @($T.Actions) $etat.cible $etat.ancienne) | Out-Null }
  if ($etat.fichierCmd) { Copy-Item (Join-Path $dern.FullName "lancement.cmd") $etat.fichierCmd -Force }
  if ($etat.actuelle) { EcrireTexte (Join-Path $VD "actuelle.txt") $etat.actuelle } else { Remove-Item (Join-Path $VD "actuelle.txt") -ErrorAction SilentlyContinue }
  Remove-Item (Join-Path $VD "essai.txt") -ErrorAction SilentlyContinue
  DemarrerFiwakti
  $s = AttendreVersion $etat.ancienne 180
  if ($s) { Ecrire ("OK : FIWAKTI " + $etat.ancienne + " est de nouveau en service : " + $Url) "Green" } else { Ecrire ("FIWAKTI " + $etat.ancienne + " ne répond pas encore : voir " + $Journaux) "Yellow" }
  try { Stop-Transcript | Out-Null } catch { }; exit 0
}

# ======================= 1. contrôles (rien n'est modifié) =======================
$Paquet = Get-ChildItem -Path (Join-Path $Ici "versions") -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path (Join-Path $_.FullName "serveur") "principal.js") } | Select-Object -First 1
if (-not $Paquet) { Arret "version à installer introuvable à côté de ce script (dossier versions\<version>\serveur). Décompressez l'archive complète." }
$Cible = (Get-Content -Raw -Path (Join-Path (Join-Path $Paquet.FullName "serveur") "version.json") | ConvertFrom-Json).version
Ecrire ("FIWAKTI - mise à jour vers la version " + $Cible) "Cyan"

# mode de lancement, lu dans la tâche planifiée
$Actions = @($T.Actions)
$Txt = ($Actions | ForEach-Object { [string]$_.Execute + " " + [string]$_.Arguments + " " + [string]$_.WorkingDirectory }) -join " | "
Ecrire ("Tâche « " + $Tache + " » : " + $Txt)
$Mode = ""; $VerLancee = ""; $FichierCmd = ""
$ActTxt = Join-Path $VD "actuelle.txt"
# lanceur : celui de référence (lanceur.js) ou celui de l'éditeur (ex. demarrer.js à la racine), qui démarre la version
# écrite dans versions\actuelle.txt (même mécanisme que la mise à jour depuis l'application)
if ($Txt -match "lanceur" -or ((Test-Path $ActTxt) -and $Txt -match "\.js" -and $Txt -notmatch "principal\.js")) { $Mode = "lanceur" }
elseif ($Txt -match "versions[\\/](\d+\.\d+\.\d+)") { $Mode = "tache"; $VerLancee = $Matches[1] }
else {
  foreach ($a in $Actions) {
    $e = ([string]$a.Execute).Trim('"')
    if ($e -match "\.(cmd|bat)$") {
      if (-not [System.IO.Path]::IsPathRooted($e) -and $a.WorkingDirectory) { $e = Join-Path $a.WorkingDirectory $e }
      if (Test-Path $e) { $c = Get-Content -Raw -Path $e
        if ($c -match "lanceur") { $Mode = "lanceur" } elseif ($c -match "versions[\\/](\d+\.\d+\.\d+)") { $Mode = "cmd"; $VerLancee = $Matches[1]; $FichierCmd = $e } }
    }
  }
}
if (-not $Mode) { Arret ("lancement de FIWAKTI non reconnu dans la tâche « $Tache » (ni lanceur, ni dossier versions\<version>). Envoyez cette ligne au support : " + $Txt) }
$Actuelle = LireTexte (Join-Path $VD "actuelle.txt")
if ($Mode -eq "lanceur" -and -not $Actuelle) { Arret "la tâche utilise un lanceur mais versions\actuelle.txt est absent." }
if ($Mode -eq "lanceur") { Ecrire ("versions\actuelle.txt : " + $Actuelle) }
if ($Mode -ne "lanceur") { $Ancienne = $VerLancee } else { $Ancienne = $Actuelle }
Ecrire ("Mode de lancement : " + $(if ($Mode -eq "lanceur") { "lanceur (versions\actuelle.txt)" } elseif ($Mode -eq "tache") { "tâche planifiée vers versions\" + $VerLancee } else { "fichier " + $FichierCmd + " vers versions\" + $VerLancee }))

$S0 = Sante
if (-not $S0) { Arret "FIWAKTI ne répond pas sur $Url. Démarrez-le (tâche « $Tache »), ou indiquez son adresse avec -Url / -Port." }
Ecrire ("Version en service : " + $S0.version + " (base " + $S0.base + ")")
if ($S0.version -ne $Ancienne) { Arret ("la version en service (" + $S0.version + ") n'est pas celle que lance la tâche (" + $Ancienne + ").") }
if ($S0.version -eq $Cible) { Arret ("la version " + $Cible + " est déjà en service.") }
if ((NumVersion $S0.version) -gt (NumVersion $Cible)) { Arret ("la version en service (" + $S0.version + ") est plus récente que " + $Cible + ".") }
if ((NumVersion $S0.version) -lt (NumVersion "56.33.10")) { Arret "mise à jour prévue à partir de la version 56.33.10." }

# Node.js (celui de la tâche s'il est indiqué)
$Node = "node"
foreach ($a in $Actions) { if (([string]$a.Execute).Trim('"') -match "node(\.exe)?$") { $Node = ([string]$a.Execute).Trim('"') } }
$nv = ""; try { $nv = (& $Node -v).Trim().TrimStart("v") } catch { }
if (-not $nv) { Arret "Node.js introuvable ($Node)." }
if ((NumVersion $nv) -lt (NumVersion "22.13.0")) { Arret ("Node.js 22.13 ou plus requis (installé : " + $nv + ").") }
Ecrire ("Node.js " + $nv + " : OK")

# sauvegarde vérifiée de moins de 24 h
$Sauv = $null
foreach ($f in (Get-ChildItem -Path (Join-Path $DON "sauvegardes") -Filter "fiwakti-*.json" -ErrorAction SilentlyContinue)) {
  try { $m = Get-Content -Raw -Path $f.FullName | ConvertFrom-Json; if ($m.verification -and $m.verification.ok -and (-not $Sauv -or [string]$m.cree -gt [string]$Sauv.cree)) { $Sauv = $m } } catch { }
}
$Age = $null; if ($Sauv) { $Age = ((Get-Date).ToUniversalTime() - ([datetime]::Parse([string]$Sauv.cree)).ToUniversalTime()).TotalHours }
if (-not $Sauv -or $Age -gt 24) {
  if ($SansControleSauvegarde) { Ecrire "ATTENTION : contrôle de la sauvegarde désactivé." "Yellow" }
  else { Arret "aucune sauvegarde vérifiée de moins de 24 h. Dans FIWAKTI : Système › Sauvegardes › « Sauvegarder maintenant », attendez « vérifiée », puis relancez." }
} else { Ecrire ("Sauvegarde vérifiée : " + $Sauv.fichier + " (il y a " + [math]::Round($Age, 1) + " h)") }

# intégrité du dossier livré
$lignes = Get-Content -Path (Join-Path $Ici "SHA256SUMS.txt") -Encoding UTF8 | Where-Object { $_ -match "^[0-9a-f]{64}  " }
$fautes = 0
foreach ($l in $lignes) {
  $h = $l.Substring(0, 64); $rel = $l.Substring(66); $f = Join-Path $Ici ($rel.Replace("/", [System.IO.Path]::DirectorySeparatorChar))
  if (-not (Test-Path -LiteralPath $f) -or (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLower() -ne $h) { $fautes++; if ($fautes -le 5) { Ecrire ("  absent ou altéré : " + $rel) "Yellow" } }
}
if ($fautes) { Arret ("$fautes fichier(s) du paquet absent(s) ou altéré(s) : décompressez de nouveau l'archive.") }
Ecrire ("Intégrité du paquet : " + $lignes.Count + " fichiers vérifiés")

# espace disque
try { $lettre = (Get-Item $Racine).PSDrive; if ($lettre.Free -lt 1GB) { Arret ("espace disque insuffisant (" + [math]::Round($lettre.Free / 1MB) + " Mo libres, 1 Go requis).") } } catch { }

if ($Verifier) { Ecrire "Contrôles terminés : tout est prêt. Rien n'a été modifié (-Verifier)." "Green"; try { Stop-Transcript | Out-Null } catch { }; exit 0 }

# ======================= 2. sauvegarde de la configuration de lancement =======================
$Sv = Join-Path $Racine ("correctifs\avant-mise-a-jour-" + $Stamp)
New-Item -ItemType Directory -Force -Path $Sv | Out-Null
Export-ScheduledTask -TaskName $Tache | Out-File -FilePath (Join-Path $Sv "tache.xml") -Encoding Unicode
if ($FichierCmd) { Copy-Item $FichierCmd (Join-Path $Sv "lancement.cmd") -Force }
@{ ancienne = $Ancienne; cible = $Cible; mode = $Mode; actuelle = $Actuelle; fichierCmd = $FichierCmd } | ConvertTo-Json | Out-File -FilePath (Join-Path $Sv "etat.json") -Encoding UTF8
Ecrire ("1/5 Contrôles terminés ; configuration de lancement sauvegardée dans " + $Sv)

# ======================= 3. arrêt et copie de la version =======================
if (-not (ArreterFiwakti)) { Arret "le port $Port est toujours occupé : arrêtez FIWAKTI (tâche « $Tache ») puis relancez ce script. Rien n'a été modifié." }
Ecrire "2/5 FIWAKTI arrêté."
$Dest = Join-Path $VD $Cible; $Tmp = $Dest + ".installation"
if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp }
Copy-Item -Recurse -Path $Paquet.FullName -Destination $Tmp
if (Test-Path $Dest) { if (Test-Path ($Dest + ".ancien")) { Remove-Item -Recurse -Force ($Dest + ".ancien") }; Rename-Item -Path $Dest -NewName ($Cible + ".ancien") }
Rename-Item -Path $Tmp -NewName $Cible
Ecrire ("3/5 Version " + $Cible + " copiée dans " + $Dest + " (la version " + $Ancienne + " est conservée).")

# ======================= 4. bascule =======================
$script:TacheModifiee = $false
function Restaurer() {
  Ecrire ("Retour automatique à la version " + $Ancienne + "…") "Yellow"
  [void](ArreterFiwakti)
  if ($script:TacheModifiee) { Set-ScheduledTask -TaskName $Tache -Action (ActionsVers $Actions $Cible $VerLancee) | Out-Null }
  if ($FichierCmd) { Copy-Item (Join-Path $Sv "lancement.cmd") $FichierCmd -Force }
  if ($Actuelle) { EcrireTexte (Join-Path $VD "actuelle.txt") $Actuelle } else { Remove-Item (Join-Path $VD "actuelle.txt") -ErrorAction SilentlyContinue }
  Remove-Item (Join-Path $VD "essai.txt") -ErrorAction SilentlyContinue
  DemarrerFiwakti
  $r = AttendreVersion $Ancienne 180
  if ($r) { Arret ("mise à jour annulée : la version " + $Ancienne + " est de nouveau en service. Envoyez au support le fichier " + (Join-Path $Journaux "serveur.log")) }
  Arret ("mise à jour annulée, mais la version " + $Ancienne + " ne répond pas : vérifiez la tâche « $Tache » et " + $Journaux)
}
try {
  if ($Mode -eq "lanceur") {
    EcrireTexte (Join-Path $VD "precedente.txt") $Actuelle; EcrireTexte (Join-Path $VD "essai.txt") $Cible; EcrireTexte (Join-Path $VD "actuelle.txt") $Cible
  } elseif ($Mode -eq "tache") {
    Set-ScheduledTask -TaskName $Tache -Action (ActionsVers $Actions $VerLancee $Cible) | Out-Null
    $script:TacheModifiee = $true
    EcrireTexte (Join-Path $VD "precedente.txt") $Ancienne; EcrireTexte (Join-Path $VD "actuelle.txt") $Cible
  } else {
    $c = Get-Content -Raw -Path $FichierCmd; [System.IO.File]::WriteAllText($FichierCmd, (RemplacerVersion $c $VerLancee $Cible))
    EcrireTexte (Join-Path $VD "precedente.txt") $Ancienne; EcrireTexte (Join-Path $VD "actuelle.txt") $Cible
  }
  Ecrire ("4/5 Lancement basculé sur la version " + $Cible + ".")
} catch { Ecrire ("Bascule impossible : " + $_.Exception.Message) "Red"; Restaurer }

# ======================= 5. redémarrage et contrôle =======================
DemarrerFiwakti
Ecrire "5/5 Redémarrage de FIWAKTI (mise à niveau de la base au premier démarrage : jusqu'à quelques minutes)…"
$S1 = AttendreVersion $Cible 300
if (-not $S1) { Ecrire ("La version " + $Cible + " ne répond pas sur " + $Url + " après 5 minutes.") "Red"; Restaurer }
Ecrire ("FIWAKTI " + $S1.version + " répond (base " + $S1.base + "). Contrôle de stabilité (90 s)…")
Start-Sleep -Seconds 90
$S2 = Sante
if (-not $S2 -or $S2.version -ne $Cible) { Ecrire "FIWAKTI s'est arrêté pendant le contrôle de stabilité." "Red"; Restaurer }
Ecrire ""
Ecrire ("OK : FIWAKTI " + $Cible + " est en service : " + $Url) "Green"
Ecrire "Dans chaque navigateur ouvert sur FIWAKTI : Ctrl+F5 (rechargement complet)." "Cyan"
Ecrire "Les journées de pointage se recalculent d'elles-mêmes (moteur mis à jour) : quelques minutes en grand effectif." "Cyan"
Ecrire ("Retour possible : powershell -ExecutionPolicy Bypass -File .\METTRE-A-JOUR.ps1 -Retour")
try { Stop-Transcript | Out-Null } catch { }
