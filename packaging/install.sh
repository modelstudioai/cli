#!/usr/bin/env bash
# Binary install script for the OSS release
#
#   curl -fsSL https://bailian.aliyun.com/install.sh | bash
#   bash install.sh --channel sync-release          # local / channel verify
#   bash install.sh --version 1.10.1
#   curl -fsSL …/install.sh | bash -s -- --channel sync-release
#
set -euo pipefail

CDN_BASE="${BAILIAN_CLI_CDN:-https://bailian-wiki.oss-cn-hangzhou.aliyuncs.com/release}"
CDN_BASE="${CDN_BASE%/}"
CHANNEL="${BAILIAN_CHANNEL:-}"
VERSION="${BAILIAN_VERSION:-}"
BIN_DIR="${BAILIAN_BIN_DIR:-${HOME}/.local/bin}"
SHARE_DIR="${BAILIAN_SHARE_DIR:-${HOME}/.local/share/bailian-cli}"
CONFIG_DIR="${BAILIAN_CONFIG_DIR:-${HOME}/.bailian}"

ZIP_FILE=""
ZIP_SHA256=""
INNER_NAME=""
MANIFEST_LABEL="manifest.json"

log() { printf '%s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

usage() {
  cat >&2 <<'EOF'
Usage: install.sh [--channel <name>] [--version <ver>] [--cdn <url>] [--help]

  --channel <name>   Install from {CDN}/{name}.json (default: manifest.json)
  --version <ver>    Pin a release version (checksum via SHA256SUMS if needed)
  --cdn <url>        Override CDN base (default / BAILIAN_CLI_CDN)
  --help             Show this help

Env fallbacks: BAILIAN_CHANNEL, BAILIAN_VERSION, BAILIAN_CLI_CDN,
               BAILIAN_BIN_DIR, BAILIAN_SHARE_DIR, BAILIAN_CONFIG_DIR
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --channel|-c)
        [[ $# -ge 2 ]] || die "$1 requires a value"
        CHANNEL="$2"
        shift 2
        ;;
      --version)
        [[ $# -ge 2 ]] || die "$1 requires a value"
        VERSION="$2"
        shift 2
        ;;
      --cdn)
        [[ $# -ge 2 ]] || die "$1 requires a value"
        CDN_BASE="${2%/}"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      --)
        shift
        break
        ;;
      -*)
        die "unknown option: $1 (try --help)"
        ;;
      *)
        die "unexpected argument: $1 (try --help)"
        ;;
    esac
  done
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

version_tag() {
  local ver="$1"
  if [[ "${ver}" == v* ]]; then
    printf '%s\n' "${ver}"
  else
    printf 'v%s\n' "${ver}"
  fi
}

detect_os_arch() {
  local uname_s uname_m
  uname_s="$(uname -s)"
  uname_m="$(uname -m)"

  case "${uname_s}" in
    Darwin) OS="darwin" ;;
    Linux) OS="linux" ;;
    *) die "unsupported OS: ${uname_s}" ;;
  esac

  case "${uname_m}" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64|amd64) ARCH="x64" ;;
    *) die "unsupported architecture: ${uname_m}" ;;
  esac

  # Rosetta 2: report the native arm64 binary, not the translated x64 view.
  if [[ "${OS}" == "darwin" ]] && [[ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" == "1" ]]; then
    ARCH="arm64"
  fi

  if [[ "${OS}" == "linux" && "${ARCH}" == "arm64" ]]; then
    die "linux arm64 is not supported for binary install; use: npm install -g bailian-cli"
  fi

  PLATFORM_KEY="${OS}-${ARCH}"
}

# First top-level JSON string field: "key": "value"
json_string_field() {
  local key="$1"
  local file="$2"
  sed -n "s/^[[:space:]]*\"${key}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "${file}" | head -n1
}

# String field inside the `"<platform_key>": { ... }` asset object.
json_asset_field() {
  local platform_key="$1"
  local field="$2"
  local file="$3"
  awk -v platform="${platform_key}" -v field="${field}" '
    BEGIN { in_block = 0 }
    $0 ~ "\"" platform "\"[[:space:]]*:" { in_block = 1; next }
    in_block && /\{/ { next }
    in_block {
      if ($0 ~ "\"" field "\"[[:space:]]*:") {
        if (match($0, /:[[:space:]]*"[^"]*"/)) {
          value = substr($0, RSTART, RLENGTH)
          sub(/^:[[:space:]]*"/, "", value)
          sub(/"$/, "", value)
          print value
          exit
        }
      }
      if ($0 ~ /\}/) exit
    }
  ' "${file}"
}

# Prints: version<TAB>file<TAB>sha256<TAB>inner
# Pure POSIX-ish shell + awk/sed — no python/jq/node.
parse_manifest_asset() {
  local manifest_path="$1"
  local platform_key="$2"
  local pinned_version="${3:-}"
  local channel_version file_name sha256_value inner_name version

  channel_version="$(json_string_field version "${manifest_path}")"
  [[ -n "${channel_version}" ]] || die "manifest missing version"

  if [[ -n "${pinned_version}" ]]; then
    version="${pinned_version}"
  else
    version="${channel_version}"
  fi

  if [[ -z "${pinned_version}" || "${pinned_version}" == "${channel_version}" ]]; then
    file_name="$(json_asset_field "${platform_key}" file "${manifest_path}")"
    sha256_value="$(json_asset_field "${platform_key}" sha256 "${manifest_path}")"
    inner_name="$(json_asset_field "${platform_key}" inner "${manifest_path}")"
  else
    # Pinned version differs from channel tip — naming convention + SHA256SUMS.
    file_name="bl-${version}-${platform_key}.zip"
    sha256_value=""
    if [[ "${platform_key}" == windows-* ]]; then
      inner_name="bl-${version}-${platform_key}.exe"
    else
      inner_name="bl-${version}-${platform_key}"
    fi
  fi

  [[ -n "${file_name}" && -n "${inner_name}" ]] \
    || die "manifest missing asset metadata for ${platform_key}"

  printf '%s\t%s\t%s\t%s\n' "${version}" "${file_name}" "${sha256_value}" "${inner_name}"
}

resolve_asset() {
  need_cmd curl
  local manifest_path parsed manifest_url
  manifest_path="$(mktemp)"
  if [[ -n "${CHANNEL}" && "${CHANNEL}" != "latest" && "${CHANNEL}" != "stable" ]]; then
    MANIFEST_LABEL="${CHANNEL}.json"
    manifest_url="${CDN_BASE}/${CHANNEL}.json"
  else
    MANIFEST_LABEL="manifest.json"
    manifest_url="${CDN_BASE}/manifest.json"
  fi
  log "Fetching ${manifest_url}"
  if ! curl -fsSL "${manifest_url}" -o "${manifest_path}"; then
    rm -f "${manifest_path}"
    die "failed to download channel manifest: ${manifest_url}"
  fi

  if ! parsed="$(parse_manifest_asset "${manifest_path}" "${PLATFORM_KEY}" "${VERSION}")"; then
    rm -f "${manifest_path}"
    die "failed to parse asset metadata from ${MANIFEST_LABEL} for ${PLATFORM_KEY}"
  fi
  rm -f "${manifest_path}"

  VERSION="$(printf '%s\n' "${parsed}" | cut -f1)"
  ZIP_FILE="$(printf '%s\n' "${parsed}" | cut -f2)"
  ZIP_SHA256="$(printf '%s\n' "${parsed}" | cut -f3)"
  INNER_NAME="$(printf '%s\n' "${parsed}" | cut -f4)"

  [[ -n "${VERSION}" && -n "${ZIP_FILE}" && -n "${INNER_NAME}" ]] \
    || die "incomplete asset metadata from ${MANIFEST_LABEL}"
}

sha256_file() {
  local path="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${path}" | awk '{ print $1 }'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${path}" | awk '{ print $1 }'
  else
    die "required command not found: shasum or sha256sum"
  fi
}

verify_checksum() {
  local zip_path="$1"
  local expected="$2"
  local tag sums_url sums_path actual

  if [[ -n "${expected}" ]]; then
    actual="$(sha256_file "${zip_path}")"
    [[ "${expected}" == "${actual}" ]] || die "checksum mismatch for ${ZIP_FILE}"
    return
  fi

  # Pinned / convention fallback: verify against per-version SHA256SUMS.
  need_cmd curl
  tag="$(version_tag "${VERSION}")"
  sums_url="${CDN_BASE}/${tag}/SHA256SUMS"
  sums_path="$(mktemp)"
  curl -fsSL "${sums_url}" -o "${sums_path}" || die "download failed: ${sums_url}"
  expected="$(awk -v file="${ZIP_FILE}" '$2 == file { print $1; exit }' "${sums_path}")"
  rm -f "${sums_path}"
  [[ -n "${expected}" ]] || die "checksum for ${ZIP_FILE} not found in SHA256SUMS"
  actual="$(sha256_file "${zip_path}")"
  [[ "${expected}" == "${actual}" ]] || die "checksum mismatch for ${ZIP_FILE}"
}

download_and_install() {
  need_cmd curl
  need_cmd unzip

  local tag tmp_dir version_dir zip_path extract_path
  tag="$(version_tag "${VERSION}")"
  tmp_dir="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${tmp_dir}'" EXIT

  zip_path="${tmp_dir}/${ZIP_FILE}"
  log "Downloading ${ZIP_FILE}…"
  curl -fsSL "${CDN_BASE}/${tag}/${ZIP_FILE}" -o "${zip_path}" \
    || die "download failed: ${CDN_BASE}/${tag}/${ZIP_FILE}"

  verify_checksum "${zip_path}" "${ZIP_SHA256}"

  log "Extracting ${INNER_NAME}…"
  unzip -j -o "${zip_path}" "${INNER_NAME}" -d "${tmp_dir}" >/dev/null \
    || die "failed to extract ${INNER_NAME} from ${ZIP_FILE}"
  extract_path="${tmp_dir}/${INNER_NAME}"
  [[ -f "${extract_path}" ]] || die "extracted binary missing: ${INNER_NAME}"

  version_dir="${SHARE_DIR}/versions/${VERSION}"
  mkdir -p "${version_dir}" "${BIN_DIR}" "${CONFIG_DIR}"
  install -m 755 "${extract_path}" "${version_dir}/bl"
  ln -sfn "${version_dir}/bl" "${BIN_DIR}/bl"
  ln -sfn "${version_dir}/bl" "${BIN_DIR}/bailian"
  printf 'binary\n' > "${CONFIG_DIR}/install-method"
  chmod 600 "${CONFIG_DIR}/install-method" 2>/dev/null || true
}

warn_path() {
  case ":${PATH}:" in
    *":${BIN_DIR}:"*) ;;
    *)
      log ""
      log "Add ${BIN_DIR} to your PATH, then open a new terminal:"
      log "  export PATH=\"${BIN_DIR}:\$PATH\""
      ;;
  esac
}

warn_npm_conflict() {
  if command -v npm >/dev/null 2>&1; then
    local npm_bl
    npm_bl="$(npm root -g 2>/dev/null)/bailian-cli" || true
    if [[ -d "${npm_bl}" ]]; then
      log "warning: npm global bailian-cli is also installed; PATH may prefer one over the other."
      log "  Consider: npm uninstall -g bailian-cli"
    fi
  fi
}

main() {
  parse_args "$@"
  need_cmd curl
  need_cmd uname
  detect_os_arch
  resolve_asset
  log "Installing bailian-cli ${VERSION} (${PLATFORM_KEY}) from ${CDN_BASE} [${MANIFEST_LABEL}]"
  download_and_install
  warn_npm_conflict
  warn_path
  log ""
  log "Installed: ${BIN_DIR}/bl → bailian-cli ${VERSION}"
  if command -v "${BIN_DIR}/bl" >/dev/null 2>&1 || [[ -x "${BIN_DIR}/bl" ]]; then
    "${BIN_DIR}/bl" --version >&2 || true
  fi
  log "Done. Run: bl --help"
}

main "$@"
