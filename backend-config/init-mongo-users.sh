#!/usr/bin/env sh
set -eu

: "${MONGODB_INITDB_ROOT_USERNAME:?}"  # root username has to be provided
: "${MONGODB_INITDB_ROOT_PASSWORD:?}"  # keep the root password in sync with the mongo service
: "${MONGODB__OTEL_COLLECTOR_PASSWORD:?}"  # password for the admin user used by OTEL collector

MONGO_HOST=${MONGODB__HOST:-mongo}
MONGO_PORT=${MONGODB__PORT:-27017}
MONGO_URI="mongodb://${MONGODB_INITDB_ROOT_USERNAME}:${MONGODB_INITDB_ROOT_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/admin?authSource=admin"

mongosh "$MONGO_URI" \
  --tls \
  --tlsCAFile /run/secrets/ca.cert.pem \
  --tlsCertificateKeyFile /run/secrets/mongo.pem \
  --quiet <<'EOF'
const ensureUser = (userName, roles, options = {}) => {
  const {
    dbName = "$external",
    password,
    mechanisms
  } = options;
  const targetDb = db.getSiblingDB(dbName);
  if (targetDb.getUser(userName)) {
    print(`${userName} already exists`);
    return;
  }
  const userDoc = { user: userName, roles };
  if (password) {
    userDoc.pwd = password;
  }
  if (mechanisms) {
    userDoc.mechanisms = mechanisms;
  }
  targetDb.createUser(userDoc);
  print(`Created ${userName}`);
};

ensureUser("CN=oauth-service", [{ role: "readWrite", db: "oauth" }]);
ensureUser("CN=task-service", [{ role: "readWrite", db: "tasks" }]);
ensureUser("CN=notification-service", [{ role: "read", db: "oauth" }]);
ensureUser("otel-collector", [{ role: "clusterMonitor", db: "admin" }], {
  dbName: "admin",
  password: process.env.MONGODB__OTEL_COLLECTOR_PASSWORD,
  mechanisms: ["SCRAM-SHA-256"],
});
EOF
