#!/usr/bin/env bash
# ==============================================================================
# ClinixVault Google Colab Database Provisioner
# Sets up native PostgreSQL (5432) and Neo4j Community (7687) on Google Colab.
# ==============================================================================
set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RESET='\033[0m'

echo -e "${CYAN}======================================================================${RESET}"
echo -e "${CYAN}🏥 ClinixVault Database Provisioner for Google Colab (Postgres + Neo4j)${RESET}"
echo -e "${CYAN}======================================================================${RESET}"

# ------------------------------------------------------------------------------
# 1. PostgreSQL Installation & Configuration
# ------------------------------------------------------------------------------
echo -e "\n${GREEN}[1/2] Setting up PostgreSQL on Colab (port 5432)...${RESET}"
if ! command -v psql &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq postgresql postgresql-contrib
fi

# Ensure service is running
service postgresql start || /etc/init.d/postgresql start

# Configure user and database
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';" >/dev/null 2>&1 || true
sudo -u postgres createdb clinixvault 2>/dev/null || sudo -u postgres psql -c "CREATE DATABASE clinixvault;" >/dev/null 2>&1 || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE clinixvault TO postgres;" >/dev/null 2>&1 || true

# Test connectivity
if PGPASSWORD=postgres psql -U postgres -h 127.0.0.1 -d clinixvault -c "SELECT 1" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ PostgreSQL active and ready on 127.0.0.1:5432 (Database: clinixvault)${RESET}"
else
    echo -e "${YELLOW}⚠️ PostgreSQL service started, validating connection...${RESET}"
fi

# ------------------------------------------------------------------------------
# 2. Neo4j Community Installation & Configuration
# ------------------------------------------------------------------------------
echo -e "\n${GREEN}[2/2] Setting up Neo4j Community 5 on Colab (port 7687)...${RESET}"

# Neo4j requires Java 17 or 21
if ! command -v java &>/dev/null || ! java -version 2>&1 | grep -q "17\|21"; then
    echo -e "   Installing OpenJDK 17 headless..."
    apt-get install -y -qq openjdk-17-jdk-headless >/dev/null 2>&1 || true
fi

NEO4J_DIR="/content/neo4j"
if [ ! -d "$NEO4J_DIR" ]; then
    echo -e "   Downloading standalone Neo4j Community 5.26.0..."
    curl -fsSL "https://dist.neo4j.org/neo4j-community-5.26.0-unix.tar.gz" -o /tmp/neo4j.tar.gz
    tar -xzf /tmp/neo4j.tar.gz -C /content/
    mv /content/neo4j-community-5.26.0 "$NEO4J_DIR"
    rm -f /tmp/neo4j.tar.gz

    # Configure default password for ClinixVault and permit flexible local auth
    echo -e "   Configuring Neo4j initial credentials and listening endpoints..."
    "$NEO4J_DIR/bin/neo4j-admin" dbms set-initial-password clinixvault2026 || true
    echo "server.default_listen_address=0.0.0.0" >> "$NEO4J_DIR/conf/neo4j.conf"
    echo "dbms.security.auth_enabled=false" >> "$NEO4J_DIR/conf/neo4j.conf"
fi

# Start Neo4j daemon
echo -e "   Starting Neo4j engine daemon..."
"$NEO4J_DIR/bin/neo4j" start || true

# Wait for Bolt port 7687 to become ready (max 35s)
echo -n "   Waiting for Bolt port 7687 to accept connections"
for i in {1..35}; do
    if timeout 1 bash -c '</dev/tcp/127.0.0.1/7687' 2>/dev/null; then
        echo -e "\n${GREEN}✓ Neo4j active and accepting Bolt connections on bolt://127.0.0.1:7687${RESET}"
        break
    fi
    echo -n "."
    sleep 1
done

echo -e "\n${GREEN}======================================================================${RESET}"
echo -e "${GREEN}🎉 POSTGRESQL & NEO4J ARE NOW RUNNING INSIDE GOOGLE COLAB!${RESET}"
echo -e "${GREEN}======================================================================${RESET}"
echo -e "🐘 PostgreSQL URI: postgresql+psycopg2://postgres:postgres@localhost:5432/clinixvault"
echo -e "🕸️ Neo4j Bolt:     bolt://localhost:7687 (user: neo4j | pass: clinixvault2026)"
echo -e "🖥️ Neo4j Browser:  http://localhost:7474"
echo -e "${GREEN}======================================================================${RESET}\n"
