set shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    just --list

# =========================================================
# DEV
# =========================================================

dev:
    npm run dev

preview:
    npm run preview

tauri-dev:
    .\scripts\tauri-dev.cmd

code:
    code .

dev-open:
    Start-Process "http://localhost:5173"
    npm run dev

# =========================================================
# PACKAGE MANAGEMENT
# =========================================================

install package="" flags="":
    if ("{{package}}" -eq "") { npm install {{flags}} } else { npm install {{package}} {{flags}} }

add package:
    npm install {{package}}

add-dev package:
    npm install -D {{package}}

remove package:
    npm uninstall {{package}}

update:
    npm update

fresh:
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
    Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
    npm install

# =========================================================
# CLEAN / RESET
# =========================================================

clean:
    Remove-Item -Recurse -Force node_modules, .svelte-kit, build, docs -ErrorAction SilentlyContinue

reset: clean
    npm install

rebuild:
    Remove-Item -Recurse -Force .svelte-kit -ErrorAction SilentlyContinue
    npm run build
    New-Item -ItemType File -Force docs/.nojekyll | Out-Null

# =========================================================
# BUILD / DEPLOY
# =========================================================

build:
    npm run build
    New-Item -ItemType File -Force docs/.nojekyll | Out-Null

deploy: build
    git add docs; git diff --cached --quiet; if ($LASTEXITCODE -eq 0) { Write-Host "No docs changes to deploy."; exit 0 }; git commit -m "Build for deployment"; git push

sync-localdeck source="../LocalDeck":
    $ErrorActionPreference = "Stop"; $sourcePath = (Resolve-Path -LiteralPath "{{source}}").Path; $destinationPath = (Resolve-Path -LiteralPath ".").Path; if ($sourcePath -eq $destinationPath) { Write-Error "Source and destination are the same folder."; exit 1 }; $directories = @("src", "static"); $tauriDirectories = @("src", "capabilities", "icons"); $requiredFiles = @("package.json", "package-lock.json", "svelte.config.js", "tsconfig.json", "vite.config.ts"); $optionalFiles = @(".npmrc", "LICENSE", "README.md", "SECURITY.md", "CHANGELOG.md"); $tauriFiles = @("Cargo.toml", "Cargo.lock", "build.rs", "tauri.conf.json"); foreach ($item in $directories) { $sourceItem = Join-Path $sourcePath $item; if (-not (Test-Path -LiteralPath $sourceItem -PathType Container)) { Write-Error "Missing source directory: $sourceItem"; exit 1 } }; foreach ($item in $tauriDirectories) { $sourceItem = Join-Path $sourcePath "src-tauri\$item"; if (-not (Test-Path -LiteralPath $sourceItem -PathType Container)) { Write-Error "Missing Tauri source directory: $sourceItem"; exit 1 } }; foreach ($item in $requiredFiles) { $sourceItem = Join-Path $sourcePath $item; if (-not (Test-Path -LiteralPath $sourceItem -PathType Leaf)) { Write-Error "Missing source file: $sourceItem"; exit 1 } }; foreach ($item in $tauriFiles) { $sourceItem = Join-Path $sourcePath "src-tauri\$item"; if (-not (Test-Path -LiteralPath $sourceItem -PathType Leaf)) { Write-Error "Missing Tauri source file: $sourceItem"; exit 1 } }; foreach ($item in $directories) { $targetItem = Join-Path $destinationPath $item; Remove-Item -LiteralPath $targetItem -Recurse -Force -ErrorAction SilentlyContinue; Copy-Item -LiteralPath (Join-Path $sourcePath $item) -Destination $destinationPath -Recurse -Force }; $targetTauri = Join-Path $destinationPath "src-tauri"; Remove-Item -LiteralPath $targetTauri -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Path $targetTauri | Out-Null; foreach ($item in $tauriDirectories) { Copy-Item -LiteralPath (Join-Path $sourcePath "src-tauri\$item") -Destination $targetTauri -Recurse -Force }; foreach ($item in $tauriFiles) { Copy-Item -LiteralPath (Join-Path $sourcePath "src-tauri\$item") -Destination $targetTauri -Force }; $sourceTauriIgnore = Join-Path $sourcePath "src-tauri\.gitignore"; if (Test-Path -LiteralPath $sourceTauriIgnore -PathType Leaf) { Copy-Item -LiteralPath $sourceTauriIgnore -Destination $targetTauri -Force }; foreach ($item in $requiredFiles + $optionalFiles) { $sourceItem = Join-Path $sourcePath $item; if (Test-Path -LiteralPath $sourceItem -PathType Leaf) { Copy-Item -LiteralPath $sourceItem -Destination $destinationPath -Force } }; node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('tauri.conf.json OK')"; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; Write-Host "Synced LocalDeck release sources from $sourcePath to $destinationPath."

sync-localdeck-dev destination="../LocalDeck":
    $ErrorActionPreference = "Stop"; $sourcePath = (Resolve-Path -LiteralPath ".").Path; $destinationPath = (Resolve-Path -LiteralPath "{{destination}}").Path; if ($sourcePath -eq $destinationPath) { Write-Error "Source and destination are the same folder."; exit 1 }; $directories = @("src", "static"); $tauriDirectories = @("src", "capabilities", "icons"); $files = @("package.json", "package-lock.json", "svelte.config.js", "tsconfig.json", "vite.config.ts"); $tauriFiles = @("Cargo.toml", "Cargo.lock", "build.rs", "tauri.conf.json"); foreach ($item in $directories) { $sourceItem = Join-Path $sourcePath $item; if (-not (Test-Path -LiteralPath $sourceItem -PathType Container)) { Write-Error "Missing release directory: $sourceItem"; exit 1 } }; foreach ($item in $tauriDirectories) { $sourceItem = Join-Path $sourcePath "src-tauri\$item"; if (-not (Test-Path -LiteralPath $sourceItem -PathType Container)) { Write-Error "Missing release Tauri directory: $sourceItem"; exit 1 } }; foreach ($item in $files) { $sourceItem = Join-Path $sourcePath $item; if (-not (Test-Path -LiteralPath $sourceItem -PathType Leaf)) { Write-Error "Missing release file: $sourceItem"; exit 1 } }; foreach ($item in $tauriFiles) { $sourceItem = Join-Path $sourcePath "src-tauri\$item"; if (-not (Test-Path -LiteralPath $sourceItem -PathType Leaf)) { Write-Error "Missing release Tauri file: $sourceItem"; exit 1 } }; foreach ($item in $directories) { $targetItem = Join-Path $destinationPath $item; Remove-Item -LiteralPath $targetItem -Recurse -Force -ErrorAction SilentlyContinue; Copy-Item -LiteralPath (Join-Path $sourcePath $item) -Destination $destinationPath -Recurse -Force }; $targetTauri = Join-Path $destinationPath "src-tauri"; foreach ($item in $tauriDirectories) { $targetItem = Join-Path $targetTauri $item; Remove-Item -LiteralPath $targetItem -Recurse -Force -ErrorAction SilentlyContinue; Copy-Item -LiteralPath (Join-Path $sourcePath "src-tauri\$item") -Destination $targetTauri -Recurse -Force }; foreach ($item in $tauriFiles) { Copy-Item -LiteralPath (Join-Path $sourcePath "src-tauri\$item") -Destination $targetTauri -Force }; $sourceTauriIgnore = Join-Path $sourcePath "src-tauri\.gitignore"; if (Test-Path -LiteralPath $sourceTauriIgnore -PathType Leaf) { Copy-Item -LiteralPath $sourceTauriIgnore -Destination $targetTauri -Force }; foreach ($item in $files) { Copy-Item -LiteralPath (Join-Path $sourcePath $item) -Destination $destinationPath -Force }; node -e "JSON.parse(require('fs').readFileSync('{{destination}}/src-tauri/tauri.conf.json','utf8')); console.log('dev tauri.conf.json OK')"; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; Write-Host "Back-copied LocalDeck release sources from $sourcePath to $destinationPath."

release msg="Release LocalDeck" source="../LocalDeck" branch="release" from="main":
    $ErrorActionPreference = "Stop"; $currentBranch = (git branch --show-current).Trim(); if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; if ($currentBranch -ne "{{from}}") { Write-Error "Refusing to release from '$currentBranch'. Switch to '{{from}}' or pass from=$currentBranch if intentional."; exit 1 }; just sync-localdeck "{{source}}"; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; $changes = git status --porcelain; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; if ([string]::IsNullOrWhiteSpace(($changes -join "`n"))) { Write-Host "No release changes to commit." } else { git add .; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git commit -m "{{msg}}"; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }; git push origin HEAD:{{branch}}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git push origin HEAD:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; Write-Host "Pushed HEAD to origin/{{branch}} and origin/main. GitHub Actions will build the release from {{branch}}."

# =========================================================
# DAILY GIT
# =========================================================

status:
    git status

pull:
    git pull

push:
    git push -u origin HEAD

save msg:
    git add .
    git commit -m "{{msg}}"
    git push -u origin HEAD

checkpoint:
    git add .
    git commit -m "Checkpoint"
    git push -u origin HEAD

# Backward compatibility
gac msg:
    just save "{{msg}}"

undo-last:
    git reset --soft HEAD~1

undo-hard:
    git reset --hard HEAD~1

# =========================================================
# FEATURE FLOW
# =========================================================

start name:
    git checkout main
    git pull origin main
    git checkout -b feature/{{name}}

finish:
    $branch = git branch --show-current; if ($branch -eq "main") { Write-Error "Already on main."; exit 1 }; git checkout main; git pull origin main; git merge $branch; git push origin main; git branch -d $branch

sync:
    git fetch origin
    git merge origin/main

rebase:
    git fetch origin
    git rebase origin/main

branches:
    git branch

delete-branch name:
    git branch -d {{name}}

# =========================================================
# UTILITIES
# =========================================================

list:
    just --list

pwd:
    Get-Location

open:
    explorer .

serve-docs:
    npx serve docs

kill-node:
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# =========================================================
# PROJECT SHORTCUTS
# =========================================================

packy:
    code .\packy

localdeck:
    code .\localdeck

prefy:
    code .\prefy
