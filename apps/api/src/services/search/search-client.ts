/**
 * OpenSearch Client Wrapper — Sprint 13 (Team 03)
 *
 * Provides a configured OpenSearch client with:
 * - Connection config from environment variables
 * - ensureIndices() to create indices if they don't exist
 * - Health check method
 * - Tenant-scoped alias management
 */

import { Client } from '@opensearch-project/opensearch';
import { logger } from '../../shared/logger';
import {
  INDEX_NAMES,
  CLAUSES_INDEX_MAPPING,
  TEMPLATES_INDEX_MAPPING,
  tenantAlias,
  tenantAliasFilter,
} from './index-mappings';

/**
 * OpenSearch connection configuration sourced from environment.
 */
function getConfig() {
  return {
    url: process.env.OPENSEARCH_URL ?? 'https://localhost:9200',
    username: process.env.OPENSEARCH_USERNAME ?? 'admin',
    password: process.env.OPENSEARCH_PASSWORD ?? 'admin',
  };
}

let clientInstance: Client | null = null;

/**
 * Returns a singleton OpenSearch client instance.
 * Creates the client on first call using environment configuration.
 */
export function getSearchClient(): Client {
  if (!clientInstance) {
    const config = getConfig();
    clientInstance = new Client({
      node: config.url,
      auth: {
        username: config.username,
        password: config.password,
      },
      ssl: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    });
    logger.info({ url: config.url }, 'OpenSearch client initialized');
  }
  return clientInstance;
}

/**
 * Resets the client instance (useful for testing).
 */
export function resetSearchClient(): void {
  clientInstance = null;
}

/**
 * Allows injecting a mock client (for testing).
 */
export function setSearchClient(client: Client): void {
  clientInstance = client;
}

/**
 * Index definitions mapping index names to their OpenSearch mappings.
 */
const INDEX_DEFINITIONS: Record<string, { settings: Record<string, unknown>; mappings: Record<string, unknown> }> = {
  [INDEX_NAMES.clauses]: {
    settings: CLAUSES_INDEX_MAPPING.settings,
    mappings: CLAUSES_INDEX_MAPPING.mappings,
  },
  [INDEX_NAMES.templates]: {
    settings: TEMPLATES_INDEX_MAPPING.settings,
    mappings: TEMPLATES_INDEX_MAPPING.mappings,
  },
};

/**
 * Creates indices if they do not already exist.
 * Safe to call multiple times (idempotent).
 */
export async function ensureIndices(): Promise<void> {
  const client = getSearchClient();

  for (const [indexName, body] of Object.entries(INDEX_DEFINITIONS)) {
    try {
      const { body: exists } = await client.indices.exists({ index: indexName });

      if (!exists) {
        await client.indices.create({
          index: indexName,
          body,
        });
        logger.info({ index: indexName }, 'OpenSearch index created');
      } else {
        logger.debug({ index: indexName }, 'OpenSearch index already exists');
      }
    } catch (err) {
      logger.error({ err, index: indexName }, 'Failed to ensure OpenSearch index');
      throw err;
    }
  }
}

/**
 * Ensures a tenant-scoped alias exists for the given tenant on all indices.
 * The alias includes a filter on tenantId so searches via the alias are automatically scoped.
 */
export async function ensureTenantAliases(tenantId: string): Promise<void> {
  const client = getSearchClient();

  for (const indexName of Object.values(INDEX_NAMES)) {
    const aliasName = tenantAlias(indexName, tenantId);

    try {
      const { body: aliasExists } = await client.indices.existsAlias({
        index: indexName,
        name: aliasName,
      });

      if (!aliasExists) {
        await client.indices.putAlias({
          index: indexName,
          name: aliasName,
          body: tenantAliasFilter(tenantId),
        });
        logger.info({ index: indexName, alias: aliasName }, 'Tenant alias created');
      }
    } catch (err) {
      logger.error({ err, index: indexName, alias: aliasName }, 'Failed to ensure tenant alias');
      throw err;
    }
  }
}

/**
 * Health check for OpenSearch cluster.
 * Returns cluster health status or null if unreachable.
 */
export async function checkHealth(): Promise<{
  status: string;
  clusterName: string;
  numberOfNodes: number;
} | null> {
  try {
    const client = getSearchClient();
    const { body } = await client.cluster.health();

    return {
      status: body.status,
      clusterName: body.cluster_name,
      numberOfNodes: body.number_of_nodes,
    };
  } catch (err) {
    logger.warn({ err }, 'OpenSearch health check failed');
    return null;
  }
}

/**
 * Checks whether OpenSearch is reachable and healthy.
 */
export async function isAvailable(): Promise<boolean> {
  const health = await checkHealth();
  return health !== null && (health.status === 'green' || health.status === 'yellow');
}
