param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$BackupRoot = (Join-Path $env:USERPROFILE "Documents\gikai_portal_backups"),
    [switch]$SkipDbExport,
    [string]$SupabaseUrl = "",
    [string]$SupabaseAnonKey = "",
    [string[]]$Tables = @(
        "general_question_tracker",
        "general_question_updates",
        "meeting_settings",
        "member_directory",
        "document_notes",
        "document_ink_notes"
    )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-AuthConfigValue {
    param(
        [Parameter(Mandatory = $true)][string]$AuthConfigPath,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not (Test-Path -LiteralPath $AuthConfigPath)) {
        return ""
    }

    $content = Get-Content -LiteralPath $AuthConfigPath -Raw -Encoding UTF8
    $pattern = [regex]::Escape($Name) + '\s*:\s*"([^\"]+)"'
    $m = [regex]::Match($content, $pattern)
    if ($m.Success) {
        return $m.Groups[1].Value
    }

    return ""
}

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
Ensure-Directory -Path $BackupRoot

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$targetDir = Join-Path $BackupRoot "backup_$timestamp"
Ensure-Directory -Path $targetDir

$zipPath = Join-Path $targetDir "project_files.zip"
$entries = Get-ChildItem -LiteralPath $ProjectRoot -Force | Where-Object {
    $_.Name -ne "backups" -and $_.Name -ne ".git"
}

if (-not $entries) {
    throw "No project files found to archive."
}

Compress-Archive -Path $entries.FullName -DestinationPath $zipPath -CompressionLevel Optimal -Force

$bundlePath = Join-Path $targetDir "repo.bundle"
if (Test-Path -LiteralPath (Join-Path $ProjectRoot ".git")) {
    git -C $ProjectRoot bundle create $bundlePath --all | Out-Null
}

$authConfigPath = Join-Path $ProjectRoot "auth-config.js"
if ([string]::IsNullOrWhiteSpace($SupabaseUrl)) {
    $SupabaseUrl = Get-AuthConfigValue -AuthConfigPath $authConfigPath -Name "supabaseUrl"
}
if ([string]::IsNullOrWhiteSpace($SupabaseAnonKey)) {
    $SupabaseAnonKey = Get-AuthConfigValue -AuthConfigPath $authConfigPath -Name "supabaseAnonKey"
}

$dbDir = Join-Path $targetDir "db_csv"
$dbExportLog = @()

if (-not $SkipDbExport) {
    if ([string]::IsNullOrWhiteSpace($SupabaseUrl) -or [string]::IsNullOrWhiteSpace($SupabaseAnonKey)) {
        $dbExportLog += "DB export skipped: Supabase credentials not found."
    } else {
        Ensure-Directory -Path $dbDir
        $headers = @{
            "apikey" = $SupabaseAnonKey
            "Authorization" = "Bearer $SupabaseAnonKey"
            "Accept" = "text/csv"
        }

        foreach ($table in $Tables) {
            $uri = "$SupabaseUrl/rest/v1/${table}?select=*"
            $outputPath = Join-Path $dbDir "$table.csv"
            try {
                Invoke-WebRequest -Method Get -Uri $uri -Headers $headers -OutFile $outputPath | Out-Null
                $dbExportLog += "OK: $table"
            } catch {
                $dbExportLog += "FAILED: $table -> $($_.Exception.Message)"
            }
        }
    }
}

$headCommit = ""
try {
    $headCommit = (git -C $ProjectRoot rev-parse HEAD).Trim()
} catch {
    $headCommit = "unknown"
}

$meta = [ordered]@{
    created_at = (Get-Date).ToString("s")
    project_root = $ProjectRoot
    zip_path = $zipPath
    bundle_path = "not-created"
    head_commit = $headCommit
    db_export = $dbExportLog
}

if (Test-Path -LiteralPath $bundlePath) {
    $meta.bundle_path = $bundlePath
}

$metaPath = Join-Path $targetDir "backup_meta.json"
$meta | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $metaPath -Encoding UTF8

Write-Host "Backup completed"
Write-Host "Target: $targetDir"
Write-Host "Zip: $zipPath"
if (Test-Path -LiteralPath $bundlePath) {
    Write-Host "Bundle: $bundlePath"
}
if ($dbExportLog.Count -gt 0) {
    Write-Host "DB export summary:"
    $dbExportLog | ForEach-Object { Write-Host " - $_" }
}
