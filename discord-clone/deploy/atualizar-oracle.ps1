param(
    [string]$Server = '168.138.227.230',
    [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\resenhex-oracle-ed25519'),
    # Troca o endereço do site, ex.: -Domain resenhex.dev (o domínio precisa apontar para o servidor).
    [string]$Domain = '',
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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$appPath = Join-Path $repoRoot 'discord-clone'
if (-not (Test-Path -LiteralPath (Join-Path $appPath 'server.js'))) {
    throw 'A pasta discord-clone não foi encontrada.'
}
if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
    throw "Chave SSH não encontrada: $KeyPath"
}
if ($Server -notmatch '^\d{1,3}(\.\d{1,3}){3}$' -or
    @($Server.Split('.') | Where-Object { [int]$_ -gt 255 }).Count -ne 0) {
    throw 'Informe um IPv4 válido em -Server.'
}
$Domain = $Domain.Trim().ToLowerInvariant()
if ($Domain -and ($Domain.Length -gt 253 -or $Domain -notmatch '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$')) {
    throw 'Domínio inválido em -Domain. Exemplo: -Domain resenhex.dev'
}

$untracked = @(& git -C $repoRoot ls-files --others --exclude-standard -- discord-clone)
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível ler os arquivos do Git.' }
if ($untracked.Count -gt 0) {
    throw "Há arquivos novos fora do Git. Adicione-os antes de publicar: $($untracked -join ', ')"
}
$tracked = @(& git -C $repoRoot ls-files -- discord-clone)
if ($LASTEXITCODE -ne 0 -or $tracked.Count -eq 0) {
    throw 'Não foi possível listar os arquivos do aplicativo.'
}
# O app de Windows (desktop/) é publicado à parte, por deploy/publicar-app.ps1.
$tracked = @($tracked | Where-Object { $_ -notlike 'discord-clone/desktop/*' })

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$localStage = Join-Path ([System.IO.Path]::GetTempPath()) ("resenhex-deploy-$([guid]::NewGuid().ToString('N'))")
$remoteStage = "/home/ubuntu/resenhex-update-$stamp"
$remoteArchive = "$remoteStage.tar"
$remote = "ubuntu@$Server"
$sshArgs = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', $remote)

New-Item -ItemType Directory -Path $localStage | Out-Null
$fileList = Join-Path $localStage 'files.txt'
$archive = Join-Path $localStage 'source.tar'
try {
    [System.IO.File]::WriteAllLines($fileList, $tracked, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Preparando versão de $appPath"
    Run 'tar.exe' @('-cf', $archive, '-C', $repoRoot, '-T', $fileList)
    if ($ValidateOnly) {
        Run 'tar.exe' @('-tf', $archive)
        Write-Host "Pacote válido com $($tracked.Count) arquivos. Nada foi enviado."
        return
    }

    Write-Host 'Enviando versão para a Oracle...'
    Run 'scp.exe' @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', $archive, "${remote}:$remoteArchive")

    $prepare = "mkdir -p $remoteStage && tar -xf $remoteArchive -C $remoteStage && test -f $remoteStage/discord-clone/server.js && test -f $remoteStage/discord-clone/deploy/instalar-vps.sh"
    Run 'ssh.exe' ($sshArgs + @($prepare))

    Write-Host 'Salvando os dados e atualizando o site...'
    $backup = "/var/backups/resenhex/data-before-$stamp.tar.gz"
    $setDomain = ''
    if ($Domain) { $setDomain = "RESENHEX_SET_DOMAIN=$Domain " }
    $update = "sudo mkdir -p /var/backups/resenhex && sudo tar -czf $backup -C /var/lib/resenhex data.json uploads && sudo ${setDomain}bash $remoteStage/discord-clone/deploy/instalar-vps.sh --oracle && systemctl is-active resenhex caddy coturn"
    Run 'ssh.exe' ($sshArgs + @($update))

    $siteDomain = (& ssh.exe @sshArgs "sed -n 's/^RESENHEX_DOMAIN=//p' /etc/resenhex.env | tail -n 1" | Out-String).Trim()
    if ($siteDomain -notmatch '^[a-z0-9.-]+$') { $siteDomain = "$($Server.Replace('.', '-')).sslip.io" }
    $url = "https://$siteDomain"
    Run 'curl.exe' @('-fLsS', '--max-time', '20', '--output', 'NUL', "$url/config")
    Run 'ssh.exe' ($sshArgs + @("rm -f $remoteArchive && rm -rf $remoteStage"))
    Write-Host "Site atualizado: $url"
    Write-Host "Backup anterior no servidor: $backup"
} finally {
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $fileList -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $localStage -Force -ErrorAction SilentlyContinue
}
