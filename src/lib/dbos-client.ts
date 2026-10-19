import { DBOSClient } from "@dbos-inc/dbos-sdk";

const appName = process.env.DBOS_APP_NAME;

export async function createDBOSClient() {
  const systemDatabaseUrl =
    process.env.DBOS_SYSTEM_DATABASE_URL;

  if (!systemDatabaseUrl) {
    throw new Error(
      "DBOS_SYSTEM_DATABASE_URL is not configured."
    );
  }

  return DBOSClient.create({
    systemDatabaseUrl,
    applicationName: appName,
  });
}