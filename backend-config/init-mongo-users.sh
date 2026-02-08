#!/usr/bin/env sh
set -eu

: "${MONGODB_INITDB_ROOT_USERNAME:?}"  # root username has to be provided
: "${MONGODB_INITDB_ROOT_PASSWORD:?}"  # keep the root password in sync with the mongo service

MONGO_HOST=${MONGODB__HOST:-mongo}
MONGO_PORT=${MONGODB__PORT:-27017}
MONGO_URI="mongodb://${MONGODB_INITDB_ROOT_USERNAME}:${MONGODB_INITDB_ROOT_PASSWORD}@${MONGODB__HOST}:${MONGODB__PORT}/admin?authSource=admin"

mongosh "$MONGO_URI" \
  --tls \
  --tlsCAFile /run/secrets/ca.cert.pem \
  --tlsCertificateKeyFile /run/secrets/mongo.pem \
  --quiet <<'EOF'
const ensureUser = (userName, roles) => {
  const externalDb = db.getSiblingDB("$external");
  if (externalDb.getUser(userName)) {
    print(`${userName} already exists`);
    return;
  }
  externalDb.createUser({
    user: userName,
    roles
  });
  print(`Created ${userName}`);
};

ensureUser("CN=admin", [{ role: "readWrite", db: "admin" }, { role: "readWrite", db: "oauth" }, { role: "userAdminAnyDatabase", db: "admin" }]);
ensureUser("CN=oauth-service", [{ role: "readWrite", db: "oauth" }]);
ensureUser("CN=task-service", [{ role: "readWrite", db: "tasks" }]);
ensureUser("CN=notification-service", [{ role: "read", db: "oauth" }]);
ensureUser("CN=otel-collector", [{ role: "clusterMonitor", db: "admin" }]);
EOF
