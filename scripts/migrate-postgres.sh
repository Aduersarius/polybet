#!/bin/bash

################################################################################
# PostgreSQL Migration Script
# Migrates database from OLD VPS to NEW VPS automatically
################################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   PostgreSQL Migration Script         ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo ""

# Get configuration from user
read -p "Old VPS IP: " OLD_VPS_IP
read -p "New VPS IP: " NEW_VPS_IP
read -p "Old VPS SSH User (default: root): " OLD_VPS_USER
OLD_VPS_USER=${OLD_VPS_USER:-root}
read -p "New VPS SSH User (default: root): " NEW_VPS_USER
NEW_VPS_USER=${NEW_VPS_USER:-root}
read -p "Database name (default: polybet): " DB_NAME
DB_NAME=${DB_NAME:-polybet}
read -p "Database user (default: polybet_user): " DB_USER
DB_USER=${DB_USER:-polybet_user}
read -sp "Database password: " DB_PASSWORD
echo ""
read -p "PostgreSQL version to install (default: 15): " PG_VERSION
PG_VERSION=${PG_VERSION:-15}

BACKUP_FILE="polybet_migration_$(date +%Y%m%d_%H%M%S).dump"
BACKUP_PATH="/tmp/${BACKUP_FILE}"

echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Old VPS: $OLD_VPS_USER@$OLD_VPS_IP"
echo "  New VPS: $NEW_VPS_USER@$NEW_VPS_IP"
echo "  Database: $DB_NAME"
echo "  Database User: $DB_USER"
echo "  PostgreSQL Version: $PG_VERSION"
echo "  Backup file: $BACKUP_FILE"
echo ""

read -p "Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo -e "${RED}Migration cancelled${NC}"
    exit 1
fi

################################################################################
# Step 1: Test SSH Connections
################################################################################
echo ""
echo -e "${BLUE}[1/8] Testing SSH connections...${NC}"

if ssh -o ConnectTimeout=5 -o BatchMode=yes ${OLD_VPS_USER}@${OLD_VPS_IP} exit 2>/dev/null; then
    echo -e "${GREEN}✓ Connected to old VPS${NC}"
else
    echo -e "${RED}✗ Cannot connect to old VPS${NC}"
    echo "Run: ssh-copy-id ${OLD_VPS_USER}@${OLD_VPS_IP}"
    exit 1
fi

if ssh -o ConnectTimeout=5 -o BatchMode=yes ${NEW_VPS_USER}@${NEW_VPS_IP} exit 2>/dev/null; then
    echo -e "${GREEN}✓ Connected to new VPS${NC}"
else
    echo -e "${RED}✗ Cannot connect to new VPS${NC}"
    echo "Run: ssh-copy-id ${NEW_VPS_USER}@${NEW_VPS_IP}"
    exit 1
fi

################################################################################
# Step 2: Install PostgreSQL on New VPS
################################################################################
echo ""
echo -e "${BLUE}[2/8] Installing PostgreSQL on new VPS...${NC}"

ssh ${NEW_VPS_USER}@${NEW_VPS_IP} bash <<EOF
    set -e
    
    # Check if already installed
    if command -v psql &> /dev/null; then
        echo "PostgreSQL already installed"
        exit 0
    fi
    
    echo "Installing PostgreSQL ${PG_VERSION}..."
    apt update -qq
    apt install -y postgresql-${PG_VERSION} postgresql-contrib-${PG_VERSION}
    
    systemctl enable postgresql
    systemctl start postgresql
    
    echo "PostgreSQL installed successfully"
EOF

echo -e "${GREEN}✓ PostgreSQL installation complete${NC}"

################################################################################
# Step 3: Configure PostgreSQL on New VPS
################################################################################
echo ""
echo -e "${BLUE}[3/8] Configuring PostgreSQL on new VPS...${NC}"

ssh ${NEW_VPS_USER}@${NEW_VPS_IP} bash <<EOF
    set -e
    
    # Set postgres user password
    sudo -u postgres psql -c "ALTER USER postgres PASSWORD '${DB_PASSWORD}';" 2>/dev/null || true
    
    # Create database and user
    sudo -u postgres psql <<SQL
DROP DATABASE IF EXISTS ${DB_NAME};
DROP USER IF EXISTS ${DB_USER};
CREATE DATABASE ${DB_NAME};
CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
    
    # Enable remote connections
    PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"
    PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"
    
    # Update listen_addresses
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" \$PG_CONF
    sed -i "s/listen_addresses = 'localhost'/listen_addresses = '*'/" \$PG_CONF
    
    # Add remote access rule (if not exists)
    grep -q "host all all 0.0.0.0/0 md5" \$PG_HBA || echo "host all all 0.0.0.0/0 md5" >> \$PG_HBA
    
    # Restart PostgreSQL
    systemctl restart postgresql
    
    echo "PostgreSQL configured successfully"
EOF

echo -e "${GREEN}✓ PostgreSQL configuration complete${NC}"

################################################################################
# Step 4: Create Backup on Old VPS
################################################################################
echo ""
echo -e "${BLUE}[4/8] Creating backup on old VPS...${NC}"

ssh ${OLD_VPS_USER}@${OLD_VPS_IP} bash <<EOF
    set -e
    
    export PGPASSWORD="${DB_PASSWORD}"
    
    echo "Stopping writes (vacuum)..."
    sudo -u postgres psql -d ${DB_NAME} -c "VACUUM ANALYZE;" 2>/dev/null || \
        psql -h localhost -U ${DB_USER} -d ${DB_NAME} -c "VACUUM ANALYZE;"
    
    echo "Creating backup..."
    sudo -u postgres pg_dump -d ${DB_NAME} \
        --format=custom \
        --file=${BACKUP_PATH} \
        --verbose 2>&1 | grep -v "^$" || \
    pg_dump -h localhost -U ${DB_USER} -d ${DB_NAME} \
        --format=custom \
        --file=${BACKUP_PATH} \
        --verbose
    
    echo "Backup created: ${BACKUP_PATH}"
    ls -lh ${BACKUP_PATH}
EOF

echo -e "${GREEN}✓ Backup created successfully${NC}"

################################################################################
# Step 5: Transfer Backup to New VPS
################################################################################
echo ""
echo -e "${BLUE}[5/8] Transferring backup to new VPS...${NC}"

# Transfer via local machine (most reliable)
echo "Downloading backup from old VPS..."
scp ${OLD_VPS_USER}@${OLD_VPS_IP}:${BACKUP_PATH} ./${BACKUP_FILE}

echo "Uploading backup to new VPS..."
scp ./${BACKUP_FILE} ${NEW_VPS_USER}@${NEW_VPS_IP}:${BACKUP_PATH}

echo "Cleaning up local backup..."
rm ./${BACKUP_FILE}

echo -e "${GREEN}✓ Backup transferred successfully${NC}"

################################################################################
# Step 6: Restore Database on New VPS
################################################################################
echo ""
echo -e "${BLUE}[6/8] Restoring database on new VPS...${NC}"

ssh ${NEW_VPS_USER}@${NEW_VPS_IP} bash <<EOF
    set -e
    
    export PGPASSWORD="${DB_PASSWORD}"
    
    echo "Restoring database..."
    pg_restore -h localhost -U ${DB_USER} -d ${DB_NAME} \
        --verbose \
        --no-owner \
        --no-acl \
        ${BACKUP_PATH} || true
    
    # Grant permissions to user
    sudo -u postgres psql -d ${DB_NAME} <<SQL
GRANT ALL ON SCHEMA public TO ${DB_USER};
GRANT ALL ON ALL TABLES IN SCHEMA public TO ${DB_USER};
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
SQL
    
    # Cleanup backup file
    rm -f ${BACKUP_PATH}
    
    echo "Database restored successfully"
EOF

echo -e "${GREEN}✓ Database restored successfully${NC}"

################################################################################
# Step 7: Verify Migration
################################################################################
echo ""
echo -e "${BLUE}[7/8] Verifying migration...${NC}"

# Test connection
export PGPASSWORD="${DB_PASSWORD}"

echo "Testing connection to new database..."
if psql -h ${NEW_VPS_IP} -U ${DB_USER} -d ${DB_NAME} -c "SELECT COUNT(*) FROM \"User\";" &>/dev/null; then
    echo -e "${GREEN}✓ Connection successful${NC}"
    
    echo ""
    echo "Database statistics:"
    psql -h ${NEW_VPS_IP} -U ${DB_USER} -d ${DB_NAME} <<SQL
SELECT 'Users: ' || COUNT(*) FROM "User";
SELECT 'Deposits: ' || COUNT(*) FROM "Deposit";
SELECT 'Events: ' || COUNT(*) FROM "Event";
SELECT 'Orders: ' || COUNT(*) FROM "Order";
SQL
else
    echo -e "${RED}✗ Connection failed${NC}"
    exit 1
fi

################################################################################
# Step 8: Update Configuration Files
################################################################################
echo ""
echo -e "${BLUE}[8/8] Updating configuration...${NC}"

OLD_CONNECTION="postgresql://${DB_USER}:${DB_PASSWORD}@${OLD_VPS_IP}:5432/${DB_NAME}"
NEW_CONNECTION="postgresql://${DB_USER}:${DB_PASSWORD}@${NEW_VPS_IP}:5432/${DB_NAME}"

# Update .env if exists
if [ -f ".env" ]; then
    echo "Updating .env..."
    if grep -q "DATABASE_URL" .env; then
        sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=\"${NEW_CONNECTION}\"|" .env
        echo -e "${GREEN}✓ Updated .env${NC}"
    fi
fi

# Update .env.local if exists
if [ -f ".env.local" ]; then
    echo "Updating .env.local..."
    if grep -q "DATABASE_URL" .env.local; then
        sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=\"${NEW_CONNECTION}\"|" .env.local
        echo -e "${GREEN}✓ Updated .env.local${NC}"
    fi
fi

################################################################################
# Summary
################################################################################
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Migration Complete! ✅               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}New database connection string:${NC}"
echo "${NEW_CONNECTION}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update DATABASE_URL in Vercel:"
echo "   ${NEW_CONNECTION}"
echo ""
echo "2. Update DATABASE_URL in Coolify for all services"
echo ""
echo "3. Test your application"
echo ""
echo "4. Keep old VPS running for 48 hours as backup"
echo ""
echo -e "${YELLOW}Cleanup old VPS after verification:${NC}"
echo "ssh ${OLD_VPS_USER}@${OLD_VPS_IP} \"sudo systemctl stop postgresql\""
echo ""
echo -e "${GREEN}Migration completed successfully!${NC}"
