# Un solo paso que tú tienes que ejecutar en PowerShell:
#   .\scripts\first-publish.ps1
#
# Abre el navegador para autorizar el scope "workflow", sube el código,
# carga la clave de auto-update como secret y publica el tag v0.1.0
# para que GitHub Actions compile el .exe.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

if (-not (Test-Path ".\tauri-updater.key")) {
  Write-Error "No encuentro tauri-updater.key en la carpeta del proyecto."
}

Write-Host "1/5  Autoriza en el navegador el permiso 'workflow' (GitHub lo pide para subir Actions)..."
gh auth refresh -h github.com -s repo,workflow,gist,read:org

Write-Host "2/5  Subiendo el código a GitHub..."
git push -u origin master

Write-Host "3/5  Permisos de Actions (write) para que el workflow pueda crear Releases..."
gh api -X PUT repos/speedzyxx/albion-loot-auditor/actions/permissions -f enabled=true -f allowed_actions=all | Out-Null
gh api -X PUT repos/speedzyxx/albion-loot-auditor/actions/permissions/workflow -f default_workflow_permissions=write -f can_approve_pull_request_reviews=false | Out-Null

Write-Host "4/5  Cargando TAURI_SIGNING_PRIVATE_KEY como secret (no se sube al git)..."
Get-Content -Raw ".\tauri-updater.key" | gh secret set TAURI_SIGNING_PRIVATE_KEY --repo speedzyxx/albion-loot-auditor
gh secret list --repo speedzyxx/albion-loot-auditor

Write-Host "5/5  Tag v0.1.0 para disparar la compilación del .exe..."
git tag v0.1.0 2>$null
git push origin v0.1.0

Write-Host ""
Write-Host "Listo. Mira el build en:"
Write-Host "https://github.com/speedzyxx/albion-loot-auditor/actions"
Write-Host "Cuando termine, el instalador estará en:"
Write-Host "https://github.com/speedzyxx/albion-loot-auditor/releases"
