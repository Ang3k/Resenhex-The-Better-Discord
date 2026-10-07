# Publica uma versão nova do app de Windows (pasta desktop/) no servidor da Oracle.
# O app instalado nos computadores dos amigos encontra a versão nova sozinho e se atualiza.
#
# Só é preciso publicar o app quando algo na pasta desktop/ mudar. Mudanças no site
# (public/, server.js) chegam no app pelo deploy normal (atualizar-oracle.ps1).
#
# Uso, na pasta do projeto:
#   1. Aumente "version" em discord-clone/desktop/package.json (ex.: 1.0.0 -> 1.0.1)
#   2. powershell -ExecutionPolicy Bypass -File discord-clone\deploy\publicar-app.ps1
# Para só gerar e conferir o instalador, sem enviar: acrescente -ValidateOnly
param(
    [string]$Server = '146.235.41.73',
    [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\resenhex-oracle-ed25519'),
    [switch]$SkipBuild,
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Run([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program terminou com erro ($LASTEXITCODE)."
    }
}

$desktop = (Resolve-Path (Join-Path $PSScriptRoot '..\desktop')).Path
$version = (Get-Content -Raw -LiteralPath (Join-Path $desktop 'package.json') | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Versão inválida em desktop/package.json: $version"
}
$dist = Join-Path $desktop 'dist'
$installer = "Resenhex-Setup-$version.exe"
$files = @($installer, "$installer.blockmap", 'latest.yml')

if (-not $SkipBuild) {
    Push-Location $desktop
    try {
        if (-not (Test-Path -LiteralPath 'node_modules')) { Run 'npm.cmd' @('ci', '--no-audit', '--no-fund') }
        Run 'npm.cmd' @('test')
        Write-Host "Gerando o instalador da versão $version..."
        Run 'npm.cmd' @('run', 'dist')
    } finally {
        Pop-Location
    }
}

foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $dist $file) -PathType Leaf)) {
        throw "Arquivo não encontrado: desktop\dist\$file. Rode sem -SkipBuild para gerar o instalador."
    }
}
$latest = Get-Content -Raw -LiteralPath (Join-Path $dist 'latest.yml')
if ($latest -notmatch "(?m)^version: $([regex]::Escape($version))\s*$" -or $latest -notmatch "(?m)^path: $([regex]::Escape($installer))\s*$") {
    throw 'O latest.yml não corresponde a esta versão. Gere o instalador de novo.'
}
$sizeMb = [math]::Round((Get-Item -LiteralPath (Join-Path $dist $installer)).Length / 1MB)
Write-Host "Instalador pronto: desktop\dist\$installer ($sizeMb MB)"
if ($ValidateOnly) {
    Write-Host 'Nada foi enviado (-ValidateOnly).'
    return
}

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
    throw "Chave SSH não encontrada: $KeyPath"
}
$remote = "ubuntu@$Server"
$sshOptions = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes')
$target = '/var/lib/resenhex/downloads'
$stage = "/home/ubuntu/resenhex-app-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

& ssh.exe @sshOptions $remote "sudo grep -q '^DOWNLOAD_DIR=' /etc/resenhex.env && sudo test -d $target && mkdir -p $stage"
if ($LASTEXITCODE -ne 0) {
    throw 'O servidor ainda não está pronto para o app. Rode deploy\atualizar-oracle.ps1 uma vez e tente de novo.'
}

Write-Host 'Enviando o instalador para a Oracle...'
Run 'scp.exe' ($sshOptions + @($files | ForEach-Object { Join-Path $dist $_ }) + @("${remote}:$stage/"))

# O latest.yml entra por último: o app só enxerga a versão nova quando o instalador já está no lugar.
# Ficam as 3 versões mais novas; a anterior é usada para baixar só o que mudou.
$publish = @(
    "sudo install -o resenhex -g resenhex -m 644 $stage/$installer $stage/$installer.blockmap $target/",
    "sudo install -o resenhex -g resenhex -m 644 $stage/latest.yml $target/latest.yml.tmp",
    "sudo mv -f $target/latest.yml.tmp $target/latest.yml",
    "sudo sh -c 'cd $target && ls -1t Resenhex-Setup-*.exe | tail -n +4 | while read f; do rm -f -- `$f `$f.blockmap; done'",
    "rm -rf $stage"
) -join ' && '
Run 'ssh.exe' ($sshOptions + @($remote, $publish))

$domain = (& ssh.exe @sshOptions $remote "sudo sed -n 's/^RESENHEX_DOMAIN=//p' /etc/resenhex.env | tail -n 1" | Out-String).Trim()
if ($domain -notmatch '^[a-z0-9.-]+$') { $domain = "$($Server.Replace('.', '-')).sslip.io" }
$info = Invoke-RestMethod -Uri "https://$domain/download/info" -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 20
if ($info.version -ne $version) {
    throw "O servidor respondeu a versão $($info.version), esperada $version."
}
Write-Host "App publicado: versão $version."
Write-Host "Link para os amigos: https://$domain/baixar"
