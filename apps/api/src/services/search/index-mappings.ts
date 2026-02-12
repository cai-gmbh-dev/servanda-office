/**
 * OpenSearch Index Mappings — Sprint 13 (Team 03)
 *
 * Defines index mappings for clauses and templates with:
 * - Multi-field mappings (text for full-text search, keyword for aggregations/filtering)
 * - Custom German analyzer with legal-domain stopwords
 * - Completion suggester fields for autocomplete
 * - Tenant-scoped index aliases: clauses-{tenantId}, templates-{tenantId}
 */

// Custom German stopwords extended with common legal filler words
const GERMAN_LEGAL_STOPWORDS = [
  // Standard German stopwords
  'aber', 'alle', 'allem', 'allen', 'aller', 'allerdings', 'alles', 'also',
  'am', 'an', 'ander', 'andere', 'anderem', 'anderen', 'anderer', 'anderes',
  'als', 'auf', 'aus', 'bei', 'beide', 'beiden', 'beim', 'bereits', 'bevor',
  'bin', 'bis', 'da', 'dabei', 'dadurch', 'dafür', 'dagegen', 'daher',
  'dahin', 'damals', 'damit', 'danach', 'daneben', 'dann', 'daran', 'darauf',
  'daraus', 'darf', 'darfst', 'darin', 'darum', 'darunter', 'darüber', 'das',
  'dass', 'davon', 'davor', 'dazu', 'dein', 'deine', 'deinem', 'deinen',
  'deiner', 'dem', 'den', 'denn', 'dennoch', 'der', 'deren', 'des',
  'deshalb', 'dessen', 'die', 'dies', 'diese', 'dieselbe', 'dieselben',
  'diesem', 'diesen', 'dieser', 'dieses', 'doch', 'dort', 'du', 'durch',
  'ein', 'eine', 'einem', 'einen', 'einer', 'einige', 'einigem', 'einigen',
  'einiger', 'einiges', 'einmal', 'er', 'es', 'etwas', 'euch', 'euer',
  'eure', 'eurem', 'euren', 'eurer', 'für', 'gegen', 'habe', 'haben',
  'hat', 'hatte', 'hätte', 'hier', 'hin', 'hinter', 'ich', 'ihm', 'ihn',
  'ihnen', 'ihr', 'ihre', 'ihrem', 'ihren', 'ihrer', 'im', 'in', 'indem',
  'ins', 'ist', 'jede', 'jedem', 'jeden', 'jeder', 'jedes', 'jedoch',
  'jene', 'jenem', 'jenen', 'jener', 'jenes', 'kein', 'keine', 'keinem',
  'keinen', 'keiner', 'kann', 'könnte', 'machen', 'man', 'manche',
  'manchem', 'manchen', 'mancher', 'manches', 'mein', 'meine', 'meinem',
  'meinen', 'meiner', 'mit', 'muss', 'musste', 'müssen', 'nach', 'nachdem',
  'nachher', 'nein', 'nicht', 'nichts', 'noch', 'nun', 'nur', 'ob', 'oder',
  'ohne', 'sehr', 'sein', 'seine', 'seinem', 'seinen', 'seiner', 'seit',
  'seitdem', 'sich', 'sie', 'sind', 'so', 'sogar', 'solch', 'solche',
  'solchem', 'solchen', 'solcher', 'soll', 'sollen', 'sollte', 'sollten',
  'sondern', 'sonst', 'über', 'um', 'und', 'uns', 'unser', 'unsere',
  'unserem', 'unseren', 'unserer', 'unter', 'viel', 'vom', 'von', 'vor',
  'während', 'war', 'warum', 'was', 'weder', 'weil', 'welch', 'welche',
  'welchem', 'welchen', 'welcher', 'welches', 'wenn', 'wer', 'werde',
  'werden', 'wie', 'wieder', 'will', 'wir', 'wird', 'wo', 'wollen',
  'würde', 'würden', 'zu', 'zum', 'zur', 'zwar', 'zwischen',
  // Common legal filler words (German)
  'gemäß', 'betreffend', 'hinsichtlich', 'bezüglich', 'insbesondere',
  'vorstehend', 'nachstehend', 'vorgenannt', 'unterzeichnet',
];

/**
 * Custom analyzer settings for German legal text.
 * Uses german_legal analyzer with decompounding and stemming.
 */
export const ANALYSIS_SETTINGS = {
  analysis: {
    analyzer: {
      german_legal: {
        type: 'custom' as const,
        tokenizer: 'standard',
        filter: [
          'lowercase',
          'german_legal_stop',
          'german_normalization',
          'german_stemmer',
        ],
      },
      german_legal_search: {
        type: 'custom' as const,
        tokenizer: 'standard',
        filter: [
          'lowercase',
          'german_legal_stop',
          'german_normalization',
          'german_stemmer',
        ],
      },
    },
    filter: {
      german_legal_stop: {
        type: 'stop' as const,
        stopwords: GERMAN_LEGAL_STOPWORDS,
      },
      german_stemmer: {
        type: 'stemmer' as const,
        language: 'light_german',
      },
    },
  },
};

/**
 * OpenSearch index mapping for the `clauses` index.
 */
export const CLAUSES_INDEX_MAPPING = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
    ...ANALYSIS_SETTINGS,
  },
  mappings: {
    properties: {
      id: { type: 'keyword' as const },
      title: {
        type: 'text' as const,
        analyzer: 'german_legal',
        search_analyzer: 'german_legal_search',
        fields: {
          keyword: {
            type: 'keyword' as const,
            ignore_above: 500,
          },
          suggest: {
            type: 'completion' as const,
            analyzer: 'simple',
          },
        },
      },
      tags: {
        type: 'keyword' as const,
      },
      content: {
        type: 'text' as const,
        analyzer: 'german_legal',
        search_analyzer: 'german_legal_search',
      },
      jurisdiction: {
        type: 'keyword' as const,
      },
      legalArea: {
        type: 'keyword' as const,
      },
      tenantId: {
        type: 'keyword' as const,
      },
      status: {
        type: 'keyword' as const,
      },
      versionNumber: {
        type: 'integer' as const,
      },
      authorId: {
        type: 'keyword' as const,
      },
      createdAt: {
        type: 'date' as const,
      },
      updatedAt: {
        type: 'date' as const,
      },
    },
  },
};

/**
 * OpenSearch index mapping for the `templates` index.
 */
export const TEMPLATES_INDEX_MAPPING = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
    ...ANALYSIS_SETTINGS,
  },
  mappings: {
    properties: {
      id: { type: 'keyword' as const },
      title: {
        type: 'text' as const,
        analyzer: 'german_legal',
        search_analyzer: 'german_legal_search',
        fields: {
          keyword: {
            type: 'keyword' as const,
            ignore_above: 500,
          },
          suggest: {
            type: 'completion' as const,
            analyzer: 'simple',
          },
        },
      },
      description: {
        type: 'text' as const,
        analyzer: 'german_legal',
        search_analyzer: 'german_legal_search',
      },
      category: {
        type: 'keyword' as const,
      },
      tags: {
        type: 'keyword' as const,
      },
      jurisdiction: {
        type: 'keyword' as const,
      },
      legalArea: {
        type: 'keyword' as const,
      },
      tenantId: {
        type: 'keyword' as const,
      },
      status: {
        type: 'keyword' as const,
      },
      versionNumber: {
        type: 'integer' as const,
      },
      authorId: {
        type: 'keyword' as const,
      },
      createdAt: {
        type: 'date' as const,
      },
      updatedAt: {
        type: 'date' as const,
      },
    },
  },
};

/**
 * Index name constants.
 */
export const INDEX_NAMES = {
  clauses: 'servanda-clauses',
  templates: 'servanda-templates',
} as const;

/**
 * Generates a tenant-scoped alias name for an index.
 * Used for filtering search queries to a specific tenant's documents.
 */
export function tenantAlias(indexName: string, tenantId: string): string {
  return `${indexName}-${tenantId}`;
}

/**
 * Returns alias configuration for a tenant on a given index.
 * The alias filters documents to only those belonging to the tenant.
 */
export function tenantAliasFilter(tenantId: string): Record<string, unknown> {
  return {
    filter: {
      term: {
        tenantId,
      },
    },
  };
}
