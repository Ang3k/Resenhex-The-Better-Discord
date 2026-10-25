param(
    # Versão para onde voltar: commit, tag ou branch. A 1.9.0, de antes do plano de 5 mil online, é o 484c2f8.
    [Parameter(Mandatory = $true)][string]$Commit,
    [string]$Server = '146.235.41.73',
    [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\resenhex-oracle-ed25519'),
    # Só mostra o que faria e confere o pacote da versão de destino. Nada vai para o servidor.
    [switch]$ValidateOnly
)

# Volta o site para uma versão anterior, sem perder o que as pessoas fizeram depois da publicação:
# 1. prepara o servidor (deploy/preparar-volta.sh): se a versão de destino não tem o banco SQLite, desliga o site e
#    grava o data.db como data.json; se o instalador dela usa a senha fixa antiga do retransmissor, troca a senha;
# 2. publica a versão de destino com o atualizar-oracle.ps1 dela (que faz o backup e reinstala tudo).
# O site fica fora do ar entre o passo 1 e o fim do passo 2 (~2 min). Publicar reinicia o coturn e derruba as calls.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Run([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program terminou com erro ($LASTEXITCODE)."
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sha = (& git -C $repoRoot rev-parse --verify --quiet "$Commit^{commit}" | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $sha) { throw "Versão não encontrada no Git: $Commit" }
$short = $sha.Substring(0, 7)
# Sem redirecionar o stderr do git: no PowerShell 5.1, com 'Stop', isso vira erro.
function Has([string]$File) { (& git -C $repoRoot ls-tree --name-only $sha -- "discord-clone/$File" | Out-String).Trim() -ne '' }
if (-not (Has 'deploy/atualizar-oracle.ps1')) { throw "A versão $short não tem deploy/atualizar-oracle.ps1." }
if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) { throw "Chave SSH não encontrada: $KeyPath" }

$needsJson = -not (Has 'server/store.js')
$installer = (& git -C $repoRoot show "${sha}:discord-clone/deploy/instalar-vps.sh" | Out-String)
$oldTurn = $installer -match 'lt-cred-mech'
$flags = @()
if ($needsJson) { $flags += '--json' }
if ($oldTurn) { $flags += '--turn-antigo' }

Write-Host "Voltando para $short ($((& git -C $repoRoot log -1 --format=%s $sha | Out-String).Trim()))"
if ($needsJson) { Write-Host '- essa versão só lê o data.json: o site desliga e o banco é gravado como data.json' }
if ($oldTurn) { Write-Host '- essa versão usa a senha fixa antiga do retransmissor: a senha é trocada' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$worktree = Join-Path ([System.IO.Path]::GetTempPath()) "resenhex-volta-$short-$stamp"
$remote = "ubuntu@$Server"
$sshArgs = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', $remote)
$remoteScript = "/home/ubuntu/resenhex-preparar-volta-$stamp.sh"

Run 'git' @('-C', $repoRoot, 'worktree', 'add', '--detach', '--quiet', $worktree, $sha)
try {
    $deploy = Join-Path $worktree 'discord-clone\deploy\atualizar-oracle.ps1'
    if ($ValidateOnly) {
        & $deploy -Server $Server -KeyPath $KeyPath -ValidateOnly | Select-Object -Last 1
        Write-Host "No servidor rodaria: sudo bash preparar-volta.sh $($flags -join ' ')"
        Write-Host 'Nada foi enviado.'
        return
    }

    if ($flags.Count -gt 0) {
        Write-Host 'Preparando o servidor...'
        Run 'scp.exe' @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', (Join-Path $PSScriptRoot 'preparar-volta.sh'), "${remote}:$remoteScript")
        Run 'ssh.exe' ($sshArgs + @("sudo bash $remoteScript $($flags -join ' '); status=`$?; rm -f $remoteScript; exit `$status"))
    }

    try {
        & $deploy -Server $Server -KeyPath $KeyPath
    } catch {
        # O site pode ter ficado desligado pelo passo 1. Religar a versão que está instalada é seguro: se for a nova,
        # ela vê o data.json e importa de novo, sem perder nada.
        Write-Warning "A publicação da versão $short falhou: $($_.Exception.Message)"
        Write-Warning 'Religando o site que está instalado...'
        & ssh.exe @sshArgs 'sudo systemctl start resenhex && systemctl is-active resenhex'
        throw
    }
    Write-Host "Site de volta na versão $short."
} finally {
    & git -C $repoRoot worktree remove --force $worktree
    if ($LASTEXITCODE -ne 0) { Write-Warning "Apague a pasta temporária à mão: git worktree remove --force `"$worktree`"" }
}
