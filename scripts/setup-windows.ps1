# English Boost: setup on Windows (run once per device, in PowerShell, from the project folder)
#   powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
# What it does:
#   1. Makes .claude\skills point to .agents\skills, so Claude Code sees the same skills as Codex.
#      It uses a directory junction, which needs no admin rights and no Developer Mode.
#   2. Downloads the official Cambridge sample materials (git-ignored).
#   3. Checks Python, Git, Claude Code and Codex, and tells you what is missing.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host "English Boost - configuração para Windows" -ForegroundColor Cyan

# 1) Skills link
$link = ".claude\skills"
$item = Get-Item $link -ErrorAction SilentlyContinue
if ($item -and $item.PSIsContainer -and (Test-Path "$link\daily-study-planner\SKILL.md")) {
    Write-Host "✓ .claude\skills já aponta para .agents\skills"
} else {
    if ($item) { Remove-Item $link -Force }   # git checked the symlink out as a small text file
    New-Item -ItemType Directory -Force ".claude" | Out-Null
    cmd /c mklink /J ".claude\skills" ".agents\skills" | Out-Null
    git update-index --skip-worktree .claude/skills 2>$null
    $excl = ".git\info\exclude"
    if (-not (Select-String -Path $excl -Pattern '^\.claude/skills/$' -Quiet -ErrorAction SilentlyContinue)) {
        Add-Content $excl ".claude/skills/"
    }
    Write-Host "✓ Junção criada: .claude\skills -> .agents\skills"
}

# 2) Python + materials
$py = $null
foreach ($c in @("py -3", "python")) {
    try { & $c.Split(" ")[0] $c.Split(" ")[1..9] --version *> $null; if ($LASTEXITCODE -eq 0) { $py = $c; break } } catch {}
}
if (-not $py) {
    Write-Host "✗ Python não encontrado. Instala o Python 3 (python.org ou: winget install Python.Python.3.12) e volta a correr este script." -ForegroundColor Yellow
} else {
    Write-Host "✓ Python: $py"
    $parts = $py.Split(" ")
    & $parts[0] $parts[1..9] scripts\fetch_official_materials.py
}

# 3) Agents
function Test-Bin($name) { $null -ne (Get-Command $name -ErrorAction SilentlyContinue) }
$vscodeClaude = Get-ChildItem "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\resources\native-binary\claude.exe" -ErrorAction SilentlyContinue
if ((Test-Bin "claude.exe") -or $vscodeClaude -or (Test-Path "$env:USERPROFILE\.local\bin\claude.exe")) {
    Write-Host "✓ Claude Code encontrado"
} else {
    Write-Host "✗ Claude Code não encontrado. Instala a extensão 'Claude Code' no VS Code e faz login, ou: irm https://claude.ai/install.ps1 | iex" -ForegroundColor Yellow
}
$npmCodex = Get-ChildItem "$env:APPDATA\npm\node_modules\@openai\codex*" -Recurse -Filter codex.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ((Test-Bin "codex.exe") -or $npmCodex) {
    Write-Host "✓ Codex encontrado"
} else {
    Write-Host "✗ Codex não encontrado. Instala com: npm install -g @openai/codex   e depois: codex login" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Pronto. Para estudar: estudar.bat" -ForegroundColor Green
