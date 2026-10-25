param(
    # Versão para onde voltar: commit, tag ou branch. A 1.9.0, de antes do plano de 5 mil online, é o 484c2f8.
    [Parameter(Mandatory = $true)][string]$Commit,
    [string]$Server = '146.235.41.73',
    [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\resenhex-oracle-ed25519'),
    # Só mostra o que faria e confere o pacote da versão de destino. Nada vai para o servidor.
    [switch]$ValidateOnly
)

# Volta o site para uma versão anterior, sem perder o que as pessoas fizeram depois da publicação:
# 1. prepara o servidor (deploy/preparar-volta.sh): guarda o site instalado e a configuração em
#    /var/backups/resenhex/volta-<data>; se a versão de destino não tem o banco SQLite, desliga o site e grava o
#    data.db como data.json; se o instalador dela usa a senha fixa antiga do retransmissor, troca a senha;
# 2. publica a versão de destino com o atualizar-oracle.ps1 dela (que faz o backup e reinstala tudo).
# Se qualquer passo falhar, o servidor volta a ser o que estava guardado e o site religa.
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
$snapshot = "/var/backups/resenhex/volta-$stamp"
$prepare = "sudo bash $remoteScript --guardar $snapshot $($flags -join ' ')".Trim()

Run 'git' @('-C', $repoRoot, 'worktree', 'add', '--detach', '--quiet', $worktree, $sha)
try {
    $deploy = Join-Path $worktree 'discord-clone\deploy\atualizar-oracle.ps1'
    if ($ValidateOnly) {
        & $deploy -Server $Server -KeyPath $KeyPath -ValidateOnly | Select-Object -Last 1
        Write-Host "No servidor rodaria: $($prepare.Replace($remoteScript, 'preparar-volta.sh'))"
        Write-Host 'Nada foi enviado.'
        return
    }

    # Até aqui o servidor não mudou nada: se o envio falhar, não há o que desfazer.
    Run 'scp.exe' @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', (Join-Path $PSScriptRoot 'preparar-volta.sh'), "${remote}:$remoteScript")
    try {
        Write-Host 'Guardando a instalação atual e preparando o servidor...'
        Run 'ssh.exe' ($sshArgs + @($prepare))
        & $deploy -Server $Server -KeyPath $KeyPath
    } catch {
        # O site pode ter ficado desligado, e o instalador antigo pode ter parado no meio, com parte da configuração
        # já reescrita. A cópia do passo 1 põe o servidor de volta como estava; a versão restaurada vê o data.json e
        # importa de novo, sem perder nada.
        Write-Warning "A volta para $short falhou: $($_.Exception.Message)"
        Write-Warning "Restaurando o servidor como estava antes da volta ($snapshot)..."
        & ssh.exe @sshArgs "sudo bash $remoteScript --restaurar $snapshot && systemctl is-active resenhex caddy"
        if ($LASTEXITCODE -ne 0) { Write-Warning "A restauração também falhou: a cópia continua no servidor, em $snapshot (app/, config.tar, permissoes)." }
        throw
    } finally {
        & ssh.exe @sshArgs "rm -f $remoteScript"
    }
    Write-Host "Site de volta na versão $short. A instalação de antes ficou guardada no servidor, em $snapshot."
} finally {
    & git -C $repoRoot worktree remove --force $worktree
    if ($LASTEXITCODE -ne 0) { Write-Warning "Apague a pasta temporária à mão: git worktree remove --force `"$worktree`"" }
}
