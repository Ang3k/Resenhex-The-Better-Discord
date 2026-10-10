# Gera e publica o app de Android (pasta android/) no servidor da Oracle.
# O app abre o site num WebView, então mudanças no site chegam nele pelo deploy normal.
# Só é preciso publicar de novo quando algo na pasta android/ mudar.
#
# Precisa, neste computador:
#   - JDK 17 e SDK do Android em %USERPROFILE%\.bubblewrap
#   - a chave de assinatura em %USERPROFILE%\.resenhex-android\resenhex.keystore e a senha
#     em senha.txt na mesma pasta. GUARDE AS DUAS: sem elas, quem já instalou não consegue
#     atualizar por cima, e a impressão digital em public/.well-known/assetlinks.json deixa de bater.
#
# Uso, na pasta do projeto:
#   1. Aumente versionCode e versionName em discord-clone/android/app/build.gradle
#   2. powershell -ExecutionPolicy Bypass -File discord-clone\deploy\publicar-android.ps1
# Para só gerar e conferir o APK, sem enviar: acrescente -ValidateOnly
param(
    [string]$Server = '146.235.41.73',
    [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\resenhex-oracle-ed25519'),
    [string]$Keystore = (Join-Path $env:USERPROFILE '.resenhex-android\resenhex.keystore'),
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

$android = (Resolve-Path (Join-Path $PSScriptRoot '..\android')).Path
$gradle = Get-Content -Raw -LiteralPath (Join-Path $android 'app\build.gradle')
if ($gradle -notmatch 'versionName "(\d+\.\d+\.\d+)"') {
    throw 'versionName não encontrado em android/app/build.gradle.'
}
$version = $Matches[1]
$tools = Join-Path $env:USERPROFILE '.bubblewrap'
$env:JAVA_HOME = Join-Path $tools 'jdk\jdk-17.0.11+9'
$env:ANDROID_HOME = Join-Path $tools 'android_sdk'
$buildTools = Join-Path $env:ANDROID_HOME 'build-tools\36.1.0'
foreach ($path in @($env:JAVA_HOME, $buildTools, $Keystore)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Não encontrado: $path" }
}
$password = (Get-Content -Raw -LiteralPath (Join-Path (Split-Path $Keystore) 'senha.txt')).Trim()

$out = Join-Path $android 'app\build\outputs\apk\release'
$apk = "Resenhex-$version.apk"
if (-not $SkipBuild) {
    Set-Content -LiteralPath (Join-Path $android 'local.properties') -Value "sdk.dir=$($env:ANDROID_HOME.Replace('\', '/'))" -Encoding ascii
    Push-Location $android
    try {
        Write-Host "Gerando o APK da versão $version..."
        Run '.\gradlew.bat' @('assembleRelease', '--no-daemon', '-q')
    } finally {
        Pop-Location
    }
    $aligned = Join-Path $out 'aligned.apk'
    Run (Join-Path $buildTools 'zipalign.exe') @('-f', '-p', '4', (Join-Path $out 'app-release-unsigned.apk'), $aligned)
    Run (Join-Path $buildTools 'apksigner.bat') @('sign', '--ks', $Keystore, '--ks-key-alias', 'resenhex',
        '--ks-pass', "pass:$password", '--key-pass', "pass:$password", '--out', (Join-Path $out $apk), $aligned)
}
if (-not (Test-Path -LiteralPath (Join-Path $out $apk) -PathType Leaf)) {
    throw "Arquivo não encontrado: android\app\build\outputs\apk\release\$apk. Rode sem -SkipBuild."
}

# A impressão digital da assinatura precisa ser a mesma do assetlinks.json; senão os links do
# Resenhex (convites) deixam de abrir direto no app.
$certs = & (Join-Path $buildTools 'apksigner.bat') verify --print-certs (Join-Path $out $apk) | Out-String
if ($LASTEXITCODE -ne 0 -or $certs -notmatch 'SHA-256 digest: ([0-9a-f]{64})') { throw 'O APK não está assinado corretamente.' }
$digest = $Matches[1]
$links = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '..\public\.well-known\assetlinks.json')
if ($links.Replace(':', '').ToLower() -notmatch $digest) {
    throw 'A assinatura do APK não bate com public/.well-known/assetlinks.json.'
}
$sizeMb = [math]::Round((Get-Item -LiteralPath (Join-Path $out $apk)).Length / 1MB, 1)
Write-Host "APK pronto: android\app\build\outputs\apk\release\$apk ($sizeMb MB)"
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
$stage = "/home/ubuntu/resenhex-android-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

& ssh.exe @sshOptions $remote "sudo test -d $target && mkdir -p $stage"
if ($LASTEXITCODE -ne 0) {
    throw 'O servidor ainda não está pronto para downloads. Rode deploy\atualizar-oracle.ps1 uma vez e tente de novo.'
}

$json = Join-Path $out 'android.json'
[IO.File]::WriteAllText($json, (@{ version = $version; file = $apk } | ConvertTo-Json -Compress))
Write-Host 'Enviando o APK para a Oracle...'
Run 'scp.exe' ($sshOptions + @((Join-Path $out $apk), $json, "${remote}:$stage/"))

# O android.json entra por último: a página só aponta para o APK novo quando ele já está no lugar.
# Ficam os 2 APKs mais novos.
$publish = @(
    "sudo install -o resenhex -g resenhex -m 644 $stage/$apk $target/",
    "sudo install -o resenhex -g resenhex -m 644 $stage/android.json $target/android.json.tmp",
    "sudo mv -f $target/android.json.tmp $target/android.json",
    "sudo sh -c 'cd $target && ls -1t Resenhex-*.apk | tail -n +3 | while read f; do rm -f -- `$f; done'",
    "rm -rf $stage"
) -join ' && '
Run 'ssh.exe' ($sshOptions + @($remote, $publish))

$domain = (& ssh.exe @sshOptions $remote "sudo sed -n 's/^RESENHEX_DOMAIN=//p' /etc/resenhex.env | tail -n 1" | Out-String).Trim()
if ($domain -notmatch '^[a-z0-9.-]+$') { $domain = "$($Server.Replace('.', '-')).sslip.io" }
$info = Invoke-RestMethod -Uri "https://$domain/download/info" -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 20
if (-not $info.PSObject.Properties['android'] -or $info.android.version -ne $version) {
    throw "O servidor não está oferecendo o APK $version. Confira se o site já tem o deploy com o suporte ao Android."
}
Write-Host "App de Android publicado: versão $version."
Write-Host "Link para os amigos: https://$domain/baixar (no celular) ou https://$domain/download/Resenhex.apk"
