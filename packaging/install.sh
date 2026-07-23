#!/usr/bin/env bash
# REFERENCE install script for the OSS layout (production scripts are maintained elsewhere).
# Production users should curl the copy hosted on OSS after FC sync, not this file from git.
#
# Expected production entry:
#   curl -fsSL https://bailian-cli.oss-cn-hangzhou.aliyuncs.com/bailian-cli/install.sh | bash
#   BAILIAN_VERSION=1.10.1 bash install.sh
#   BAILIAN_CHANNEL=latest bash install.sh
set -euo pipefail

CDN_BASE="${BAILIAN_CLI_CDN:-https://bailian-cli.oss-cn-hangzhou.aliyuncs.com/bailian-cli}"
CDN_BASE="${CDN_BASE%/}"
CHANNEL="${BAILIAN_CHANNEL:-latest}"
VERSION="${BAILIAN_VERSION:-}"
BIN_DIR="${BAILIAN_BIN_DIR:-${HOME}/.local/bin}"
SHARE_DIR="${BAILIAN_SHARE_DIR:-${HOME}/.local/share/bailian-cli}"
CONFIG_DIR="${BAILIAN_CONFIG_DIR:-${HOME}/.bailian}"

log() { printf '%s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
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

  if [[ "${OS}" == "darwin" ]] && [[ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" == "1" ]]; then
    ARCH="arm64"
  fi

  if [[ "${OS}" == "linux" && "${ARCH}" == "arm64" ]]; then
    die "linux arm64 is not supported for binary install; use: npm install -g bailian-cli"
  fi
}

resolve_version() {
  if [[ -n "${VERSION}" ]]; then
    return
  fi
  need_cmd curl
  local manifest
  manifest="$(mktemp)"
  curl -fsSL "${CDN_BASE}/channels/${CHANNEL}.json" -o "${manifest}" \
    || die "failed to download channel manifest: ${CDN_BASE}/channels/${CHANNEL}.json"
  VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${manifest}" | head -n1)"
  rm -f "${manifest}"
  [[ -n "${VERSION}" ]] || die "could not parse version from ${CHANNEL} channel manifest"
}

download_and_verify() {
  local asset="bl-${VERSION}-${OS}-${ARCH}"
  local url="${CDN_BASE}/releases/${VERSION}/${asset}"
  local sums_url="${CDN_BASE}/releases/${VERSION}/SHA256SUMS"
  local tmp_dir version_dir
  tmp_dir="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${tmp_dir}'" EXIT

  log "Downloading ${asset}…"
  curl -fsSL "${url}" -o "${tmp_dir}/${asset}" || die "download failed: ${url}"
  curl -fsSL "${sums_url}" -o "${tmp_dir}/SHA256SUMS" || die "download failed: ${sums_url}"

  need_cmd shasum
  local expected actual
  expected="$(awk -v file="${asset}" '$2 == file { print $1; exit }' "${tmp_dir}/SHA256SUMS")"
  [[ -n "${expected}" ]] || die "checksum for ${asset} not found in SHA256SUMS"
  actual="$(shasum -a 256 "${tmp_dir}/${asset}" | awk '{ print $1 }')"
  [[ "${expected}" == "${actual}" ]] || die "checksum mismatch for ${asset}"

  version_dir="${SHARE_DIR}/versions/${VERSION}"
  mkdir -p "${version_dir}" "${BIN_DIR}" "${CONFIG_DIR}"
  install -m 755 "${tmp_dir}/${asset}" "${version_dir}/bl"
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
  need_cmd curl
  need_cmd uname
  detect_os_arch
  resolve_version
  log "Installing bailian-cli ${VERSION} (${OS}-${ARCH}) from ${CDN_BASE}"
  download_and_verify
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
