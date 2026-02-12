# SSE-KMS per-Tenant Encryption Evaluation v1

> **Sprint 13 — Team 02 (Platform Security & Identity)**
> **Status:** Approved for Phase 2 implementation
> **Date:** 2026-02-12
> **Author:** Team 02

---

## 1. Problem Statement

Servanda Office stores sensitive legal data (contracts, clauses, client references) in a
multi-tenant PostgreSQL database with Row-Level Security (RLS). While RLS provides logical
isolation, enterprise customers and DSGVO auditors increasingly require **encryption at rest
with per-tenant key management** to achieve true cryptographic data isolation.

This evaluation compares three encryption-at-rest approaches and recommends a strategy
for Phase 2 implementation.

---

## 2. Options Evaluated

### Option A: AWS KMS with per-Tenant Customer Master Keys (CMK)

**Architecture:**
- One AWS KMS CMK per tenant
- Application uses AWS Encryption SDK for envelope encryption
- Data Encryption Key (DEK) generated per record or per batch
- Encrypted DEK stored alongside ciphertext in PostgreSQL
- Decryption requires KMS call to unwrap DEK (cached locally for performance)

**Advantages:**
- Native AWS integration (if deployed on AWS)
- Hardware-backed key storage (FIPS 140-2 Level 2)
- Automatic key rotation (annual, configurable)
- Full audit trail via CloudTrail
- No key material ever leaves AWS boundary

**Disadvantages:**
- AWS vendor lock-in
- Not viable for on-premises deployments
- Cost: ~$1/month per CMK + $0.03 per 10,000 API calls
  - 50 tenants = ~$50/month base + API costs
  - 500 tenants = ~$500/month base
- Latency: ~5-15ms per KMS API call (mitigated by DEK caching)
- Cross-region considerations for DR

**DSGVO Compliance:**
- Data remains in EU region (eu-central-1)
- Customer can request key deletion (crypto-shredding)
- AWS is a certified data processor under DSGVO

### Option B: HashiCorp Vault Transit Secrets Engine (On-Prem)

**Architecture:**
- Vault Transit engine acts as "encryption as a service"
- Per-tenant named key in Transit engine
- Application sends plaintext to Vault, receives ciphertext
- Or: use Vault for envelope encryption (encrypt DEK, not raw data)
- Vault deployed as part of on-prem K8s stack

**Advantages:**
- Cloud-agnostic, works for on-prem and cloud deployments
- Per-tenant key with independent rotation policies
- Supports convergent encryption (enables encrypted search)
- Open-source core available
- No cloud vendor dependency
- Excellent Kubernetes integration (Vault Agent Injector)

**Disadvantages:**
- Operational complexity: Vault cluster needs HA, unsealing, backup
- Requires dedicated infrastructure (3-node HA cluster recommended)
- Higher DevOps burden than managed KMS
- Latency: ~2-10ms per Transit call (on-prem network)
- No HSM backing in open-source (Enterprise edition needed for FIPS)
- Vault Enterprise license cost for production features

**DSGVO Compliance:**
- Full data sovereignty (keys never leave customer infrastructure)
- Customer controls key lifecycle entirely
- Crypto-shredding via key deletion
- Best option for customers with strict data residency requirements

### Option C: Application-Level Envelope Encryption with BYOK

**Architecture:**
- Application generates DEK per record/batch using Node.js crypto
- DEK encrypted with tenant's Key Encryption Key (KEK)
- KEK can be:
  - Stored in Vault, KMS, or local HSM (Bring Your Own Key)
  - Derived from tenant-provided master secret
- Encrypted DEK + ciphertext stored in PostgreSQL
- Decryption: unwrap DEK with KEK, then decrypt data

**Advantages:**
- Maximum flexibility: works with any key storage backend
- Supports true BYOK (customer provides their own KEK)
- No external service dependency for data encryption
- Lowest latency (local encryption, only KEK operations remote)
- Works with any deployment model
- Can integrate with customer HSMs

**Disadvantages:**
- Most complex implementation
- Key management responsibility falls on application code
- Risk of implementation bugs (crypto is hard)
- Must implement key rotation manually
- Testing and auditing more difficult
- Need secure KEK storage solution regardless

**DSGVO Compliance:**
- Depends entirely on KEK storage solution
- BYOK enables customer-controlled crypto-shredding
- Customer can verify encryption implementation (open source)
- Auditability requires custom implementation

---

## 3. Comparison Matrix

| Criterion                  | A: AWS KMS         | B: Vault Transit   | C: App-Level BYOK  |
|----------------------------|---------------------|---------------------|---------------------|
| **Cloud deployment**       | Excellent           | Good                | Good                |
| **On-prem deployment**     | Not viable          | Excellent           | Good                |
| **Implementation effort**  | Medium (2-3 weeks)  | Medium (3-4 weeks)  | High (4-6 weeks)    |
| **Operational complexity** | Low (managed)       | High (Vault ops)    | Medium              |
| **Performance impact**     | ~5-15ms/record      | ~2-10ms/record      | ~1-3ms/record       |
| **Key rotation**           | Automatic           | Configurable        | Manual              |
| **DSGVO compliance**       | Good (EU region)    | Excellent           | Depends on KEK      |
| **Data sovereignty**       | AWS-dependent       | Full control        | Full control        |
| **Crypto-shredding**       | Yes (key deletion)  | Yes (key deletion)  | Yes (KEK deletion)  |
| **Audit trail**            | CloudTrail          | Vault Audit Log     | Custom              |
| **BYOK support**           | Limited (import)    | Yes                 | Native              |
| **FIPS 140-2**             | Level 2 (HSM-backed)| Enterprise only     | Depends on HSM      |
| **Cost (50 tenants/mo)**   | ~$60                | ~$0 (OSS) / $$$ (Ent) | ~$0              |
| **Cost (500 tenants/mo)**  | ~$550               | ~$0 (OSS) / $$$ (Ent) | ~$0              |

---

## 4. Recommendation

**Recommended approach: Hybrid — Option B (Vault Transit) + Option C (Envelope Encryption)**

Rationale:
1. **On-prem requirement is non-negotiable** — AWS KMS alone is insufficient
2. Vault Transit provides the best balance of security, auditability, and flexibility
3. Application-level envelope encryption reduces Vault call frequency (performance)
4. The combination supports both cloud and on-prem deployments

**Implementation strategy:**
- Use **envelope encryption** at the application layer (Option C pattern)
- Use **Vault Transit** as the KEK provider (unwraps DEKs)
- For cloud deployments: Vault can optionally delegate to AWS KMS as auto-unseal + KEK backend
- For on-prem: Vault standalone with Shamir unsealing or customer HSM

**Phase 2 rollout:**
1. Implement envelope encryption layer in the API service
2. Deploy Vault Transit as KEK provider
3. Encrypt sensitive fields incrementally (see schema changes below)
4. Provide migration tooling for existing unencrypted data

---

## 5. Prisma Schema Changes

The following schema changes are needed to support per-tenant encrypted fields.
Encrypted data is stored as `Bytes` (binary) with a companion `_keyId` field to
track which DEK version was used.

```prisma
// --- Tenant Key Management ---

model TenantEncryptionKey {
  id          String   @id @default(uuid())
  tenantId    String
  keyVersion  Int      @default(1)
  /// Encrypted DEK (wrapped by Vault Transit KEK)
  wrappedDek  Bytes
  /// Vault Transit key name used to wrap this DEK
  kekKeyName  String
  /// Vault Transit key version at time of wrapping
  kekVersion  Int
  status      String   @default("active") // active | rotated | destroyed
  createdAt   DateTime @default(now())
  rotatedAt   DateTime?
  destroyedAt DateTime?

  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, keyVersion])
  @@index([tenantId, status])
}

// --- Encrypted Fields on Existing Models ---

// ContractInstance: encrypt answers (contains client-specific data)
// Add to existing model:
//   answersEncrypted    Bytes?
//   answersKeyVersion   Int?

// ClauseVersion: encrypt content (legal text, potentially confidential)
// Add to existing model:
//   contentEncrypted    Bytes?
//   contentKeyVersion   Int?

// AuditEvent: encrypt details (may contain PII)
// Add to existing model:
//   detailsEncrypted    Bytes?
//   detailsKeyVersion   Int?

// User: encrypt email + displayName (PII)
// Add to existing model:
//   emailEncrypted       Bytes?
//   emailKeyVersion      Int?
//   displayNameEncrypted Bytes?
```

**Migration strategy:**
- New fields are nullable — existing data remains unencrypted initially
- Background migration job encrypts existing records batch-by-batch
- Read path: if `*Encrypted` is present, decrypt; otherwise read plaintext
- Once migration is complete, drop plaintext columns (Phase 3)

---

## 6. Key Rotation Strategy

### Rotation Triggers
1. **Scheduled rotation:** Every 90 days (configurable per tenant)
2. **On-demand rotation:** Admin triggers via API
3. **Incident rotation:** Immediate rotation on suspected compromise

### Rotation Process

```
1. Generate new DEK (v2) via Vault Transit
2. Store wrapped DEK v2 in TenantEncryptionKey (status=active)
3. Mark DEK v1 as "rotated" (still usable for reads)
4. New writes use DEK v2
5. Background re-encryption job:
   a. Read records encrypted with v1
   b. Decrypt with v1, re-encrypt with v2
   c. Update record + keyVersion
6. Once all records migrated to v2:
   a. Mark v1 as "destroyed"
   b. Request Vault to destroy v1 key version
```

### Key Hierarchy

```
Vault Transit KEK (per tenant, managed by Vault)
  └─ DEK v1 (wrapped by KEK, stored in DB)
  │    └─ Record-level encryption (AES-256-GCM)
  └─ DEK v2 (after rotation)
       └─ Record-level encryption (AES-256-GCM)
```

### Crypto-Shredding (Tenant Offboarding / DSGVO Right to Erasure)

```
1. Destroy all DEK versions in TenantEncryptionKey
2. Request Vault to destroy the tenant's KEK
3. All encrypted data becomes permanently unrecoverable
4. Optionally: DELETE rows for complete removal
```

---

## 7. Performance Impact Assessment

| Operation              | Without Encryption | With Encryption    | Delta     |
|------------------------|--------------------|--------------------|-----------|
| Create contract        | ~15ms              | ~18ms (+DEK cache) | +3ms      |
| Read contract          | ~8ms               | ~10ms (DEK cached) | +2ms      |
| Read contract (cold)   | ~8ms               | ~18ms (Vault call) | +10ms     |
| List 20 contracts      | ~12ms              | ~15ms (batch)      | +3ms      |
| Export (10 clauses)    | ~45ms              | ~55ms              | +10ms     |
| Key rotation (1000 rec)| N/A                | ~30s (background)  | N/A       |

**Mitigation strategies:**
- DEK caching in memory (LRU, 5-minute TTL)
- Batch decryption for list operations
- Vault connection pooling
- Async re-encryption during rotation

---

## 8. Vault Deployment Topology

### Cloud (AWS / Azure)

```
┌─────────────────────────────────────────┐
│  Kubernetes Cluster                      │
│                                          │
│  ┌──────────┐    ┌──────────────────┐   │
│  │ API Pod  │───▶│ Vault Agent      │   │
│  │          │    │ (sidecar)        │   │
│  └──────────┘    └────────┬─────────┘   │
│                           │              │
│  ┌────────────────────────▼───────────┐  │
│  │ Vault HA Cluster (3 nodes)        │  │
│  │  - Transit engine                  │  │
│  │  - Auto-unseal via AWS KMS         │  │
│  │  - Raft storage                    │  │
│  └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### On-Prem

```
┌─────────────────────────────────────────┐
│  Customer K8s Cluster                    │
│                                          │
│  ┌──────────┐    ┌──────────────────┐   │
│  │ API Pod  │───▶│ Vault Agent      │   │
│  │          │    │ (sidecar)        │   │
│  └──────────┘    └────────┬─────────┘   │
│                           │              │
│  ┌────────────────────────▼───────────┐  │
│  │ Vault HA Cluster (3 nodes)        │  │
│  │  - Transit engine                  │  │
│  │  - Shamir unseal / customer HSM    │  │
│  │  - Raft storage (encrypted)        │  │
│  └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## 9. Open Questions for Phase 2 Planning

1. **Vault licensing:** Do we need Vault Enterprise for FIPS compliance, or is OSS sufficient?
2. **Search over encrypted fields:** Do we need convergent encryption for email search, or is
   a separate search index (OpenSearch) acceptable?
3. **Performance SLA:** What is the maximum acceptable latency increase per request?
4. **Tenant key escrow:** Should Servanda hold a backup of tenant KEKs, or is the customer
   solely responsible?
5. **Encryption scope:** Should we encrypt all fields from day one, or start with
   high-sensitivity fields (answers, PII) only?

---

## 10. References

- [RFC 7516 — JSON Web Encryption (JWE)](https://www.rfc-editor.org/rfc/rfc7516)
- [AWS KMS Developer Guide](https://docs.aws.amazon.com/kms/latest/developerguide/)
- [HashiCorp Vault Transit Engine](https://developer.hashicorp.com/vault/docs/secrets/transit)
- [DSGVO Art. 32 — Security of Processing](https://dsgvo-gesetz.de/art-32-dsgvo/)
- [NIST SP 800-57 — Key Management Recommendations](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)
- [ADR-001 — Multi-Tenant Isolation](../knowledge/adr-001-multi-tenant-isolation.md)
