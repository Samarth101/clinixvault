#!/usr/bin/env bash
# ==============================================================================
# ClinixVault Observability Starter for Grafana Labs (Grafana Cloud)
# Scrapes Prometheus Metrics & Streams Structured Loki Logs
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "======================================================================"
echo "🚀 ClinixVault -> Grafana Labs Observability Pipeline Starter"
echo "======================================================================"

# 1. Check or Create .env
ENV_FILE="${SCRIPT_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  echo "⚠️  No .env file found. Creating from .env.example..."
  cp "${SCRIPT_DIR}/.env.example" "${ENV_FILE}"
  echo "📄 Please edit ${ENV_FILE} with your Grafana Cloud credentials:"
  echo "   - GRAFANA_CLOUD_PROMETHEUS_URL"
  echo "   - GRAFANA_CLOUD_PROMETHEUS_USER"
  echo "   - GRAFANA_CLOUD_LOKI_URL"
  echo "   - GRAFANA_CLOUD_LOKI_USER"
  echo "   - GRAFANA_CLOUD_API_TOKEN"
  echo ""
fi

# Load environment variables
if [ -f "${ENV_FILE}" ]; then
  # Export lines that do not start with # and contain =
  export $(grep -v '^#' "${ENV_FILE}" | xargs)
fi

# 2. Check logs directory
mkdir -p "${PROJECT_ROOT}/logs"
touch "${PROJECT_ROOT}/logs/clinixvault.log"
echo "✅ Log target initialized at: ${PROJECT_ROOT}/logs/clinixvault.log"

# 3. Choose collector runtime: Grafana Alloy (Native macOS) or Docker Compose
if command -v alloy >/dev/null 2>&1; then
  COLLECTOR="alloy"
elif command -v grafana-alloy >/dev/null 2>&1; then
  COLLECTOR="grafana-alloy"
elif command -v docker >/dev/null 2>&1; then
  COLLECTOR="docker"
else
  COLLECTOR="install_alloy"
fi

case "${COLLECTOR}" in
  "alloy"|"grafana-alloy")
    ALLOY_BIN="$(command -v alloy || command -v grafana-alloy)"
    echo "🌟 Using Native Grafana Alloy binary: ${ALLOY_BIN}"
    echo "📡 Loading Alloy configuration: ${SCRIPT_DIR}/alloy/config.alloy"
    echo "🌐 Alloy Web UI will be accessible at: http://127.0.0.1:12345"
    echo "⚡ Starting Alloy in foreground (Ctrl+C to stop)..."
    echo "----------------------------------------------------------------------"
    exec "${ALLOY_BIN}" run --server.http.listen-addr=0.0.0.0:12345 --storage.path="${PROJECT_ROOT}/data-alloy" "${SCRIPT_DIR}/alloy/config.alloy"
    ;;

  "docker")
    echo "🐳 Grafana Alloy native binary not found, but Docker is available."
    echo "🚢 Launching Grafana Alloy via Docker Compose..."
    cd "${SCRIPT_DIR}"
    docker compose -f docker-compose.observability.yml up -d
    echo "✅ Alloy container is running in background."
    echo "   View logs: docker compose -f ${SCRIPT_DIR}/docker-compose.observability.yml logs -f"
    echo "   Stop:      docker compose -f ${SCRIPT_DIR}/docker-compose.observability.yml down"
    ;;

  "install_alloy")
    echo "ℹ️  Grafana Alloy is not installed yet on this Mac."
    echo "   Install it easily via Homebrew by running:"
    echo "     brew install grafana-alloy"
    echo ""
    echo "   Then re-run this script:"
    echo "     ./observability/start_observability.sh"
    exit 1
    ;;
esac
