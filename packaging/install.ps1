# Binary install script for the OSS release layout (see packages/core/src/install/cdn.ts).
#
#   irm https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/release/install.ps1 | iex
#   $env:BAILIAN_CHANNEL = "sync-release"; irm ... | iex
#   $env:BAILIAN_VERSION = "1.10.1"; irm ... | iex
#
# Layout:
#   {CDN}/{channel}.json              — rolling manifest (version + assets)
#   {CDN}/v{version}/{file}.zip       — per-platform zip
param()

$ErrorActionPreference = "Stop"

$CdnBase = if ($env:BAILIAN_CLI_CDN) { $env:BAILIAN_CLI_CDN.TrimEnd("/") } else { "https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/release" }
$Channel = if ($env:BAILIAN_CHANNEL) { $env:BAILIAN_CHANNEL } else { "latest" }
$Version = $env:BAILIAN_VERSION
$InstallRoot = if ($env:BAILIAN_SHARE_DIR) { $env:BAILIAN_SHARE_DIR } else { Join-Path $env:LOCALAPPDATA "bailian-cli" }
$ConfigDir = if ($env:BAILIAN_CONFIG_DIR) { $env:BAILIAN_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".bailian" }

function Write-Log([string]$Message) {
  [Console]::Error.WriteLine($Message)
}

function Get-VersionTag([string]$Ver) {
  if ($Ver.StartsWith("v")) { return $Ver }
  return "v$Ver"
}

$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
if ($Arch -eq "arm64") {
  throw "windows arm64 is not supported for binary install; use: npm install -g bailian-cli"
}
$PlatformKey = "windows-$Arch"

$ManifestUrl = "$CdnBase/$Channel.json"
Write-Log "Fetching $ManifestUrl"
$Manifest = Invoke-RestMethod -Uri $ManifestUrl

$PinnedVersion = $Version
if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = $Manifest.version
}
if ([string]::IsNullOrWhiteSpace($Version)) {
  throw "Could not parse version from $Channel channel manifest"
}

$ZipFile = $null
$ExpectedSha = $null
$InnerName = $null
$AssetMeta = $null
if ($Manifest.assets -and $Manifest.assets.$PlatformKey) {
  $AssetMeta = $Manifest.assets.$PlatformKey
}

$UseManifestAsset = $AssetMeta -and (
  [string]::IsNullOrWhiteSpace($PinnedVersion) -or ($PinnedVersion -eq $Manifest.version)
)

if ($UseManifestAsset) {
  $ZipFile = $AssetMeta.file
  $ExpectedSha = $AssetMeta.sha256
  $InnerName = $AssetMeta.inner
} else {
  $ZipFile = "bl-$Version-$PlatformKey.zip"
  $InnerName = "bl-$Version-$PlatformKey.exe"
}

if ([string]::IsNullOrWhiteSpace($ZipFile) -or [string]::IsNullOrWhiteSpace($InnerName)) {
  throw "Manifest missing asset metadata for $PlatformKey"
}

$Tag = Get-VersionTag $Version
$Url = "$CdnBase/$Tag/$ZipFile"
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("bailian-cli-install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TempDir | Out-Null

try {
  $ZipPath = Join-Path $TempDir $ZipFile
  Write-Log "Downloading $ZipFile…"
  Invoke-WebRequest -Uri $Url -OutFile $ZipPath

  $Actual = (Get-FileHash -Algorithm SHA256 -Path $ZipPath).Hash.ToLowerInvariant()
  if (-not [string]::IsNullOrWhiteSpace($ExpectedSha)) {
    if ($ExpectedSha.ToLowerInvariant() -ne $Actual) {
      throw "Checksum mismatch for $ZipFile"
    }
  } else {
    $SumsUrl = "$CdnBase/$Tag/SHA256SUMS"
    $SumsPath = Join-Path $TempDir "SHA256SUMS"
    Invoke-WebRequest -Uri $SumsUrl -OutFile $SumsPath
    $Expected = $null
    Get-Content $SumsPath | ForEach-Object {
      if ($_ -match "^([a-fA-F0-9]+)\s+$([regex]::Escape($ZipFile))\s*$") {
        $Expected = $Matches[1].ToLowerInvariant()
      }
    }
    if (-not $Expected) { throw "Checksum for $ZipFile not found in SHA256SUMS" }
    if ($Expected -ne $Actual) { throw "Checksum mismatch for $ZipFile" }
  }

  Write-Log "Extracting $InnerName…"
  Expand-Archive -Path $ZipPath -DestinationPath $TempDir -Force
  $ExtractPath = Join-Path $TempDir $InnerName
  if (-not (Test-Path -LiteralPath $ExtractPath)) {
    # Some Expand-Archive versions nest a single top-level folder.
    $Found = Get-ChildItem -Path $TempDir -Recurse -File | Where-Object { $_.Name -eq $InnerName } | Select-Object -First 1
    if (-not $Found) { throw "Extracted binary missing: $InnerName" }
    $ExtractPath = $Found.FullName
  }

  $VersionDir = Join-Path $InstallRoot "versions\$Version"
  New-Item -ItemType Directory -Force -Path $VersionDir | Out-Null
  New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
  $Target = Join-Path $VersionDir "bl.exe"
  Copy-Item -Force $ExtractPath $Target

  $ShimDir = Join-Path $InstallRoot "bin"
  New-Item -ItemType Directory -Force -Path $ShimDir | Out-Null
  Copy-Item -Force $Target (Join-Path $ShimDir "bl.exe")
  Copy-Item -Force $Target (Join-Path $ShimDir "bailian.exe")
  Set-Content -Path (Join-Path $ConfigDir "install-method") -Value "binary" -NoNewline

  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not ($UserPath -split ";" | Where-Object { $_ -eq $ShimDir })) {
    [Environment]::SetEnvironmentVariable("Path", "$ShimDir;$UserPath", "User")
    Write-Log "Added $ShimDir to your user PATH. Open a new terminal to use bl."
  }

  Write-Log "Installed: $Target (bailian-cli $Version) [$Channel]"
  Write-Log "Done. Run: bl --help"
}
finally {
  Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}
