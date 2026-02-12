# Cross-Module-Event-Evaluierung v1 — Servanda Office

**Status:** Approved
**Datum:** 2026-02-11
**Owner:** Team 01 (Product Architecture)
**Betroffene Teams:** Alle (01-07)
**Referenzen:** module-boundaries-v1.md, audit-logging-e2e-v1.md, architecture-backbone-v1.md, ADR-003

---

## 1. Problemstellung

### 1.1 Aktueller Zustand

Audit-Events und Cross-Module-Seiteneffekte werden aktuell **direkt im Request-Handler** geloggt:

```typescript
// Beispiel: contract/routes.ts — Zeile ~120
router.post('/', async (req, res) => {
  const contract = await prisma.$transaction(async (tx) => {
    await setTenantContext(tx, ctx.tenantId);
    const instance = await tx.contractInstance.create({ ... });
    return instance;
  });

  // Audit-Event direkt im Handler
  await auditService.log({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    action: 'contract.create',
    objectType: 'ContractInstance',
    objectId: contract.id,
    details: { templateVersionId: contract.templateVersionId },
  });

  res.status(201).json(contract);
});
```

### 1.2 Warum das nicht skaliert

Bei wachsender Komplexitaet muessen **neben dem Audit-Event** weitere Seiteneffekte ausgeloest werden:

| Seiteneffekt | Ausloeser | Benoetigt ab |
|---|---|---|
| **Audit-Logging** | Jede fachliche Operation | MVP (bereits implementiert) |
| **Benachrichtigungen** | Export fertig, Review-Anfrage, Einladung | Phase 2 |
| **Analytics/Metriken** | Contract-Erstellung, Export-Nutzung, Login-Haeufigkeit | Phase 2 |
| **Cache-Invalidierung** | Clause/Template published, StyleTemplate geaendert | Phase 2 |
| **Webhook-Dispatch** | Export fertig, Content published (Enterprise) | Phase 3 |
| **Suche-Indexierung** | Clause/Template/Contract CRUD (OpenSearch) | Phase 2 |

Wenn jeder Seiteneffekt als zusaetzlicher `await`-Aufruf im Handler steht, entsteht:

1. **Handler-Bloat**: Jeder Handler wird zum Orchestrator fuer 3-5 unabhaengige Concerns.
2. **Kopplung**: Handler kennt alle Consumer (Audit, Notifications, Analytics, Cache).
3. **Testbarkeit**: Jeder Handler-Test muss alle Consumer mocken.
4. **Fehler-Propagation**: Ein fehlgeschlagener Consumer kann den Haupt-Request blockieren (trotz try/catch: Code-Noise).
5. **Feature-Flags**: Neue Consumer erfordern Aenderungen in jedem Handler.

---

## 2. Optionen

### Option A: In-Process EventEmitter (Node.js native)

**Beschreibung:** Node.js `EventEmitter` (oder typed Wrapper) als zentraler Event-Bus. Alle Module emittieren Domain-Events, Consumer registrieren Listener.

```typescript
// Simplified Example
import { EventEmitter } from 'events';

const eventBus = new EventEmitter();

// Producer (contract/routes.ts)
eventBus.emit('contract.created', {
  tenantId: ctx.tenantId,
  actorId: ctx.userId,
  contractId: contract.id,
  templateVersionId: contract.templateVersionId,
  timestamp: new Date(),
});

// Consumer (audit.service.ts)
eventBus.on('contract.created', async (event) => {
  await auditService.log({
    tenantId: event.tenantId,
    actorId: event.actorId,
    action: 'contract.create',
    objectType: 'ContractInstance',
    objectId: event.contractId,
  });
});

// Consumer (notification.service.ts) — Phase 2
eventBus.on('contract.created', async (event) => {
  await notificationService.notify(event.tenantId, 'contract_created', event);
});
```

**Vorteile:**
- Kein Infrastruktur-Overhead (kein neuer Service, keine neue Dependency)
- Synchron oder asynchron (Listener koennen `async` sein)
- Extrem niedrige Latenz (<1ms)
- Einfach zu implementieren und zu testen
- TypeScript-Typisierung moeglich (generischer Wrapper)
- Keine DB-Belastung fuer Event-Dispatch

**Nachteile:**
- Kein Replay: Verlorene Events bei Prozess-Crash (zwischen emit und Consumer-Abschluss)
- Kein persistenter Event-Log (ausser Audit-Events in DB)
- Keine natuerliche Backpressure bei vielen Listenern
- Keine Cross-Prozess-Kommunikation (Export-Worker ist separater Prozess)
- Memory-Leak-Risiko bei zu vielen Listenern (>10 pro Event → Node.js Warning)

**Aufwand:** ~2 Stunden (Wrapper + erste Migration von auditService.log-Aufrufen)

---

### Option B: pgboss als Event-Bus

**Beschreibung:** pgboss (bereits im Stack fuer Export-Jobs) wird als generischer Event-Bus genutzt. Events werden als Jobs in die Queue geschrieben, Consumer verarbeiten sie asynchron.

```typescript
// Producer (contract/routes.ts)
await pgBoss.send('domain-events', {
  type: 'contract.created',
  tenantId: ctx.tenantId,
  actorId: ctx.userId,
  payload: { contractId: contract.id, templateVersionId: contract.templateVersionId },
  timestamp: new Date(),
});

// Consumer (registriert beim Worker-Start)
await pgBoss.work('domain-events', async (job) => {
  const event = job.data;
  switch (event.type) {
    case 'contract.created':
      await auditService.log({ ... });
      await notificationService.notify({ ... });
      break;
    // ...
  }
});
```

**Vorteile:**
- Persistente Events (PostgreSQL-backed) — kein Datenverlust bei Crash
- Retry-Mechanismus (Exponential Backoff, konfigurierbar)
- Bereits im Stack (kein neues System)
- Cross-Prozess: Export-Worker kann Events konsumieren
- Dead-Letter-Queue fuer fehlgeschlagene Events
- Monitoring ueber bestehende PostgreSQL-Metriken

**Nachteile:**
- DB-Last: Jedes Domain-Event erzeugt INSERT + Polling-Queries (pgboss pollt alle 2s)
- Latenz: 50-200ms Event-to-Consumer (Polling-Intervall + Query)
- Audit-Events sind zeitkritisch (Compliance: Event muss vor Response geloggt sein)
- Schema-Management: pgboss-Tabellen muessen migriert werden
- Monitoring-Overhead: Zusaetzliche Queue-Tiefe-Metriken noetig
- Kopplung von Domain-Events an Export-Infrastruktur

**Aufwand:** ~8 Stunden (Event-Schema, Consumer-Registration, Migration bestehender Audit-Calls)

---

### Option C: Dedizierter Message-Broker (Redis Streams / RabbitMQ)

**Beschreibung:** Externer Message-Broker als Event-Bus. Events werden persistent in Redis Streams oder RabbitMQ publiziert. Consumer-Groups sorgen fuer At-Least-Once Delivery.

```typescript
// Producer (via Adapter)
await messageBroker.publish('domain-events.contract.created', {
  tenantId: ctx.tenantId,
  actorId: ctx.userId,
  contractId: contract.id,
  timestamp: new Date(),
});

// Consumer-Group (separater Prozess oder Co-located)
await messageBroker.subscribe('domain-events.contract.*', 'audit-consumer', async (event) => {
  await auditService.log({ ... });
});
```

**Vorteile:**
- Hohe Skalierbarkeit (Redis: >100k Events/s, RabbitMQ: >10k/s)
- Replay-Faehigkeit (Redis Streams: Consumer-Group mit Offset-Management)
- Consumer-Groups: Mehrere Consumer-Instanzen teilen sich die Last
- Backpressure und Flow-Control nativ
- Entkopplung: Producer und Consumer sind vollstaendig unabhaengig
- Monitoring: Redis/RabbitMQ bieten eigene Dashboards

**Nachteile:**
- **Neue Infrastruktur-Dependency**: Redis oder RabbitMQ muss deployed, gewartet und gesichert werden
- Erhoehte Betriebskomplexitaet (besonders On-Prem: Team 07 muss neues System betreuen)
- Netzwerk-Latenz (1-5ms pro Event, plus Serialisierung)
- Eventual Consistency: Events koennen verzoegert ankommen
- Monitoring-Overhead: Neues System = neues Dashboard + Alerting-Rules
- Overkill fuer MVP-Scope (< 50 Tenants, < 200 Users gleichzeitig)
- Widerspricht BB-002 (PostgreSQL-basierte Queue statt externer Broker)

**Aufwand:** ~24 Stunden (Infrastruktur-Setup, Adapter, Migration, K8s-Manifeste, Monitoring)

---

## 3. Bewertungsmatrix

| Kriterium | Gewicht | Option A (EventEmitter) | Option B (pgboss) | Option C (Broker) |
|---|---|---|---|---|
| **Implementierungsaufwand** | 20% | 5 (minimal) | 3 (moderat) | 1 (hoch) |
| **Betriebsaufwand** | 15% | 5 (kein neues System) | 4 (bestehendes System) | 2 (neues System) |
| **Latenz** | 15% | 5 (<1ms) | 3 (50-200ms) | 4 (1-5ms) |
| **Zuverlaessigkeit** | 15% | 2 (kein Persist) | 5 (DB-backed) | 5 (persistent) |
| **Skalierbarkeit** | 10% | 3 (In-Process) | 4 (DB-Queue) | 5 (horizontal) |
| **Testbarkeit** | 10% | 5 (einfach mockbar) | 3 (DB-Dependency) | 3 (Broker-Dependency) |
| **Migrationsfaehigkeit** | 15% | 4 (Interface-Adapter) | 4 (bereits Queue-Modell) | 5 (natuerliches Ziel) |
| **Gesamt (gewichtet)** | | **4.1** | **3.7** | **3.3** |

---

## 4. Empfehlung: Option A (EventEmitter) mit Adapter-Pattern

### 4.1 Entscheidung

**Option A (In-Process EventEmitter)** fuer den MVP, implementiert ueber ein abstraktes `EventBus`-Interface das spaeter auf Option B oder C migriert werden kann.

### 4.2 Begruendung

1. **MVP-Scope**: Bei <50 Tenants und <200 gleichzeitigen Nutzern ist ein externer Broker Overengineering.
2. **Audit-Compliance**: Audit-Events muessen synchron vor der HTTP-Response geloggt werden. EventEmitter erlaubt `await` auf kritische Listener.
3. **Kein Infrastruktur-Overhead**: Kein neues System fuer Team 07 zum Deployen und Warten.
4. **Konsistenz mit BB-002**: Architektur-Entscheidung BB-002 bevorzugt PostgreSQL-basierte Infrastruktur. EventEmitter + AuditService (der in PostgreSQL schreibt) ist konsistent.
5. **Adapter-Pattern**: Das `EventBus`-Interface erlaubt spaetere Migration ohne Aenderung der Producer/Consumer.

### 4.3 EventBus Interface

```typescript
// packages/shared/src/event-bus.ts

/**
 * Abstraktion ueber den Event-Dispatch-Mechanismus.
 * MVP: In-Process EventEmitter
 * Phase 2+: pgboss oder Redis Streams
 */
export interface EventBus {
  /**
   * Emittiert ein Domain-Event.
   * Bei kritischen Events (Audit) wird auf synchrone Consumer gewartet.
   */
  emit<T extends DomainEvent>(event: T): Promise<void>;

  /**
   * Registriert einen Event-Handler fuer einen Event-Typ.
   * Handler werden in Registrierungs-Reihenfolge aufgerufen.
   */
  on<T extends DomainEvent>(
    eventType: T['type'],
    handler: EventHandler<T>,
  ): void;

  /**
   * Entfernt einen registrierten Handler.
   */
  off<T extends DomainEvent>(
    eventType: T['type'],
    handler: EventHandler<T>,
  ): void;

  /**
   * Gibt Metriken zurueck (registrierte Handler, emittierte Events).
   */
  stats(): EventBusStats;
}

export type EventHandler<T extends DomainEvent> = (event: T) => Promise<void>;

export interface EventBusStats {
  registeredHandlers: Record<string, number>;
  eventsEmitted: number;
  eventsFailed: number;
  lastEventAt: Date | null;
}
```

### 4.4 In-Process EventEmitter Implementation

```typescript
// packages/shared/src/event-bus-emitter.ts

import { EventEmitter } from 'events';
import type { EventBus, DomainEvent, EventHandler, EventBusStats } from './event-bus';

export class InProcessEventBus implements EventBus {
  private readonly emitter = new EventEmitter();
  private readonly handlers = new Map<string, Set<EventHandler<any>>>();
  private eventsEmitted = 0;
  private eventsFailed = 0;
  private lastEventAt: Date | null = null;
  private readonly logger: { error: (...args: any[]) => void };

  constructor(logger: { error: (...args: any[]) => void }) {
    this.logger = logger;
    // Erhoehe Listener-Limit (Default: 10)
    this.emitter.setMaxListeners(50);
  }

  async emit<T extends DomainEvent>(event: T): Promise<void> {
    this.eventsEmitted++;
    this.lastEventAt = new Date();

    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.size === 0) {
      return;
    }

    // Alle Handler parallel ausfuehren, Fehler isolieren
    const results = await Promise.allSettled(
      Array.from(handlers).map((handler) => handler(event)),
    );

    // Fehlgeschlagene Handler loggen, aber nicht re-thrown
    for (const result of results) {
      if (result.status === 'rejected') {
        this.eventsFailed++;
        this.logger.error('EventBus handler failed', {
          eventType: event.type,
          error: result.reason?.message ?? String(result.reason),
        });
      }
    }
  }

  on<T extends DomainEvent>(
    eventType: T['type'],
    handler: EventHandler<T>,
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  off<T extends DomainEvent>(
    eventType: T['type'],
    handler: EventHandler<T>,
  ): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  stats(): EventBusStats {
    const registeredHandlers: Record<string, number> = {};
    for (const [type, handlers] of this.handlers) {
      registeredHandlers[type] = handlers.size;
    }
    return {
      registeredHandlers,
      eventsEmitted: this.eventsEmitted,
      eventsFailed: this.eventsFailed,
      lastEventAt: this.lastEventAt,
    };
  }
}
```

---

## 5. Domain-Event-Typen

### 5.1 Base-Event-Interface

```typescript
// packages/shared/src/domain-events.ts

export interface DomainEvent {
  /** Eindeutiger Event-Typ (dot-notation: module.action) */
  type: string;
  /** Tenant-ID des Ausloeser-Kontexts */
  tenantId: string;
  /** User-ID des Ausloeser (null bei System-Events) */
  actorId: string | null;
  /** ISO-Timestamp der Event-Erzeugung */
  timestamp: string;
  /** Korrelations-ID (z.B. Request-ID) */
  correlationId?: string;
}
```

### 5.2 Event-Katalog

#### Identity-Events

```typescript
export interface UserInvitedEvent extends DomainEvent {
  type: 'user.invited';
  payload: {
    userId: string;
    email: string;
    role: 'admin' | 'editor' | 'user';
  };
}

export interface UserActivatedEvent extends DomainEvent {
  type: 'user.activated';
  payload: {
    userId: string;
  };
}

export interface UserDeactivatedEvent extends DomainEvent {
  type: 'user.deactivated';
  payload: {
    userId: string;
    reason?: string;
  };
}

export interface UserDeletedEvent extends DomainEvent {
  type: 'user.deleted';
  payload: {
    userId: string;
    anonymized: boolean;
  };
}

export interface UserRoleChangedEvent extends DomainEvent {
  type: 'user.role_changed';
  payload: {
    userId: string;
    oldRole: string;
    newRole: string;
  };
}

export interface UserLoginEvent extends DomainEvent {
  type: 'user.login';
  payload: {
    sessionId: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

export interface UserLoginFailedEvent extends DomainEvent {
  type: 'user.login_failed';
  payload: {
    email: string;
    reason: string;
    ipAddress?: string;
  };
}
```

#### Content-Events

```typescript
export interface ClauseCreatedEvent extends DomainEvent {
  type: 'clause.created';
  payload: {
    clauseId: string;
    title: string;
    jurisdiction: string;
  };
}

export interface ClauseVersionCreatedEvent extends DomainEvent {
  type: 'clause_version.created';
  payload: {
    clauseId: string;
    versionId: string;
    versionNumber: number;
  };
}

export interface ClauseVersionPublishedEvent extends DomainEvent {
  type: 'clause_version.published';
  payload: {
    clauseId: string;
    versionId: string;
    versionNumber: number;
    reviewerId: string;
  };
}

export interface ContentPublishedEvent extends DomainEvent {
  type: 'content.published';
  payload: {
    entityType: 'clause' | 'template';
    entityId: string;
    versionId: string;
    versionNumber: number;
  };
}

export interface TemplateCreatedEvent extends DomainEvent {
  type: 'template.created';
  payload: {
    templateId: string;
    name: string;
    jurisdiction: string;
  };
}

export interface TemplateVersionPublishedEvent extends DomainEvent {
  type: 'template_version.published';
  payload: {
    templateId: string;
    versionId: string;
    versionNumber: number;
    clauseCount: number;
  };
}
```

#### Contract-Events

```typescript
export interface ContractCreatedEvent extends DomainEvent {
  type: 'contract.created';
  payload: {
    contractId: string;
    templateVersionId: string;
    pinnedClauseVersionIds: string[];
  };
}

export interface ContractUpdatedEvent extends DomainEvent {
  type: 'contract.updated';
  payload: {
    contractId: string;
    changedFields: string[];
  };
}

export interface ContractCompletedEvent extends DomainEvent {
  type: 'contract.completed';
  payload: {
    contractId: string;
    templateVersionId: string;
    clauseCount: number;
  };
}

export interface ContractValidatedEvent extends DomainEvent {
  type: 'contract.validated';
  payload: {
    contractId: string;
    isValid: boolean;
    hardConflicts: number;
    softConflicts: number;
  };
}
```

#### Export-Events

```typescript
export interface ExportRequestedEvent extends DomainEvent {
  type: 'export.requested';
  payload: {
    jobId: string;
    contractId: string;
    format: 'docx' | 'odt';
    styleTemplateId?: string;
  };
}

export interface ExportCompletedEvent extends DomainEvent {
  type: 'export.completed';
  payload: {
    jobId: string;
    contractId: string;
    format: 'docx' | 'odt';
    durationMs: number;
    fileSizeBytes: number;
  };
}

export interface ExportFailedEvent extends DomainEvent {
  type: 'export.failed';
  payload: {
    jobId: string;
    contractId: string;
    format: 'docx' | 'odt';
    error: string;
    retryCount: number;
  };
}

export interface ExportDownloadedEvent extends DomainEvent {
  type: 'export.downloaded';
  payload: {
    jobId: string;
    contractId: string;
  };
}
```

#### System-Events

```typescript
export interface SystemRetentionEvent extends DomainEvent {
  type: 'system.retention_cleanup';
  actorId: null;
  payload: {
    eventsDeleted: number;
    retentionDays: number;
  };
}

export interface SystemHealthEvent extends DomainEvent {
  type: 'system.health_check';
  actorId: null;
  payload: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, boolean>;
  };
}
```

### 5.3 Union-Type fuer Type-Safety

```typescript
export type ServandaDomainEvent =
  // Identity
  | UserInvitedEvent
  | UserActivatedEvent
  | UserDeactivatedEvent
  | UserDeletedEvent
  | UserRoleChangedEvent
  | UserLoginEvent
  | UserLoginFailedEvent
  // Content
  | ClauseCreatedEvent
  | ClauseVersionCreatedEvent
  | ClauseVersionPublishedEvent
  | ContentPublishedEvent
  | TemplateCreatedEvent
  | TemplateVersionPublishedEvent
  // Contract
  | ContractCreatedEvent
  | ContractUpdatedEvent
  | ContractCompletedEvent
  | ContractValidatedEvent
  // Export
  | ExportRequestedEvent
  | ExportCompletedEvent
  | ExportFailedEvent
  | ExportDownloadedEvent
  // System
  | SystemRetentionEvent
  | SystemHealthEvent;
```

---

## 6. Consumer-Registrierung

### 6.1 Audit-Consumer (MVP)

```typescript
// apps/api/src/consumers/audit-consumer.ts

import type { EventBus, ServandaDomainEvent } from '@servanda/shared';
import type { AuditService } from '../services/audit.service';

/**
 * Registriert Audit-Event-Handler fuer alle relevanten Domain-Events.
 * Dieser Consumer ersetzt die direkten auditService.log() Aufrufe in den Request-Handlern.
 */
export function registerAuditConsumer(
  eventBus: EventBus,
  auditService: AuditService,
): void {
  // Contract-Events
  eventBus.on<ContractCreatedEvent>('contract.created', async (event) => {
    await auditService.log({
      tenantId: event.tenantId,
      actorId: event.actorId,
      action: 'contract.create',
      objectType: 'ContractInstance',
      objectId: event.payload.contractId,
      details: { templateVersionId: event.payload.templateVersionId },
    });
  });

  eventBus.on<ContractCompletedEvent>('contract.completed', async (event) => {
    await auditService.log({
      tenantId: event.tenantId,
      actorId: event.actorId,
      action: 'contract.complete',
      objectType: 'ContractInstance',
      objectId: event.payload.contractId,
      severity: 'info',
    });
  });

  // Export-Events
  eventBus.on<ExportCompletedEvent>('export.completed', async (event) => {
    await auditService.log({
      tenantId: event.tenantId,
      actorId: event.actorId,
      action: 'export.complete',
      objectType: 'ExportJob',
      objectId: event.payload.jobId,
      details: {
        format: event.payload.format,
        durationMs: event.payload.durationMs,
      },
    });
  });

  // Content-Events
  eventBus.on<ContentPublishedEvent>('content.published', async (event) => {
    await auditService.log({
      tenantId: event.tenantId,
      actorId: event.actorId,
      action: `${event.payload.entityType}_version.publish`,
      objectType: event.payload.entityType === 'clause' ? 'ClauseVersion' : 'TemplateVersion',
      objectId: event.payload.versionId,
      severity: 'critical',
    });
  });

  // Identity-Events
  eventBus.on<UserInvitedEvent>('user.invited', async (event) => {
    await auditService.log({
      tenantId: event.tenantId,
      actorId: event.actorId,
      action: 'user.invite',
      objectType: 'User',
      objectId: event.payload.userId,
      details: { role: event.payload.role },
    });
  });

  // ... weitere Event-Handler analog
}
```

### 6.2 Zukuenftige Consumer (Phase 2+)

```typescript
// Phase 2: Notification-Consumer
export function registerNotificationConsumer(
  eventBus: EventBus,
  notificationService: NotificationService,
): void {
  eventBus.on<ExportCompletedEvent>('export.completed', async (event) => {
    await notificationService.notifyUser(event.actorId, {
      type: 'export_ready',
      jobId: event.payload.jobId,
    });
  });

  eventBus.on<UserInvitedEvent>('user.invited', async (event) => {
    await notificationService.sendInvitationEmail(event.payload.email, {
      tenantId: event.tenantId,
      role: event.payload.role,
    });
  });
}

// Phase 2: Cache-Invalidation-Consumer
export function registerCacheConsumer(
  eventBus: EventBus,
  cacheService: CacheService,
): void {
  eventBus.on<ContentPublishedEvent>('content.published', async (event) => {
    await cacheService.invalidate(`catalog:${event.tenantId}`);
    await cacheService.invalidate(`${event.payload.entityType}:${event.payload.entityId}`);
  });
}

// Phase 2: Analytics-Consumer (Prometheus Metrics)
export function registerAnalyticsConsumer(
  eventBus: EventBus,
  metrics: PrometheusMetrics,
): void {
  eventBus.on<ContractCreatedEvent>('contract.created', async (event) => {
    metrics.contractsCreatedTotal.inc({ tenant_id: event.tenantId });
  });

  eventBus.on<ExportCompletedEvent>('export.completed', async (event) => {
    metrics.exportDurationSeconds.observe(
      { format: event.payload.format },
      event.payload.durationMs / 1000,
    );
  });
}
```

---

## 7. Migration bestehender Audit-Aufrufe

### 7.1 Vorher (direkte Aufrufe in Handlern)

```typescript
// contract/routes.ts — VORHER
router.post('/', async (req, res) => {
  const contract = await createContract(prisma, ctx);

  // Direkt im Handler — gekoppelt
  await auditService.log({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    action: 'contract.create',
    objectType: 'ContractInstance',
    objectId: contract.id,
    details: { templateVersionId: contract.templateVersionId },
  });

  res.status(201).json(contract);
});
```

### 7.2 Nachher (Event-basiert)

```typescript
// contract/routes.ts — NACHHER
router.post('/', async (req, res) => {
  const contract = await createContract(prisma, ctx);

  // Event emittieren — entkoppelt
  await eventBus.emit({
    type: 'contract.created',
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    timestamp: new Date().toISOString(),
    payload: {
      contractId: contract.id,
      templateVersionId: contract.templateVersionId,
      pinnedClauseVersionIds: contract.pinnedClauseVersionIds,
    },
  });

  res.status(201).json(contract);
});
```

### 7.3 Migrations-Checkliste

| Modul | Datei | Aktuelle auditService.log()-Aufrufe | Ziel-Event |
|---|---|---|---|
| Identity | `identity/routes.ts` | invite, activate, deactivate, delete, update | `user.invited`, `user.activated`, `user.deactivated`, `user.deleted`, `user.role_changed` |
| Content | `content/routes.ts` | clause.create, version.create, status-change | `clause.created`, `clause_version.created`, `content.published` |
| Content | `content/reviewer.ts` | assign-reviewer, approve, reject | Via bestehende auditService-Calls (vorlaeufig) |
| Contract | `contract/routes.ts` | create, update, validate, complete | `contract.created`, `contract.updated`, `contract.validated`, `contract.completed` |
| Export | `export/routes.ts` | request, download | `export.requested`, `export.downloaded` |
| Export | `export-handler.ts` | complete, fail | `export.completed`, `export.failed` |

**Migrations-Strategie:** Schrittweise Migration. Zuerst EventBus einrichten und Audit-Consumer registrieren, dann Handler-fuer-Handler migrieren. Beide Varianten (direkt + Event) koennen temporaer koexistieren.

---

## 8. Migrations-Pfad: EventEmitter -> pgboss -> Message Broker

### 8.1 Phase 1: MVP (aktuell) — In-Process EventEmitter

```
┌──────────────────────────────────────────────┐
│              API-Prozess                     │
│                                              │
│  Handler ──emit──> InProcessEventBus         │
│                         │                    │
│                    ┌────┴─────┐              │
│                    │ Consumer │              │
│                    │ (Audit)  │              │
│                    └──────────┘              │
│                                              │
│  Export-Worker: Eigener Event-Bus            │
│  (oder direkte auditService-Aufrufe)        │
└──────────────────────────────────────────────┘
```

**Trigger fuer Phase 2:** Wenn eines dieser Kriterien erfuellt ist:
- Mehr als 3 Consumer pro Event-Typ
- Notification-System wird eingefuehrt
- Event-Replay wird benoetigt (z.B. fuer Analytics-Rebuild)
- Export-Worker muss Domain-Events konsumieren (Cross-Prozess)

### 8.2 Phase 2: pgboss als Event-Bus

```
┌──────────────────────────────────────────────┐
│              API-Prozess                     │
│                                              │
│  Handler ──emit──> PgBossEventBus            │
│                         │                    │
│                    pgboss.send()             │
│                         │                    │
└─────────────────────────┼────────────────────┘
                          │
                   ┌──────▼──────┐
                   │  PostgreSQL │
                   │  pgboss     │
                   │  Tabellen   │
                   └──────┬──────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
         ┌────▼────┐ ┌───▼────┐ ┌───▼────────┐
         │ Audit   │ │ Notify │ │ Export-    │
         │ Consumer│ │ Consumer│ │ Worker     │
         └─────────┘ └────────┘ └────────────┘
```

**Implementation:**

```typescript
// packages/shared/src/event-bus-pgboss.ts

import type { EventBus, DomainEvent, EventHandler } from './event-bus';
import PgBoss from 'pg-boss';

export class PgBossEventBus implements EventBus {
  private readonly boss: PgBoss;
  private readonly handlers = new Map<string, Set<EventHandler<any>>>();

  constructor(boss: PgBoss) {
    this.boss = boss;
  }

  async emit<T extends DomainEvent>(event: T): Promise<void> {
    // Persistent in pgboss-Queue schreiben
    await this.boss.send(`domain-event.${event.type}`, event, {
      retryLimit: 3,
      retryDelay: 30,
      expireInSeconds: 3600,
    });
  }

  on<T extends DomainEvent>(
    eventType: T['type'],
    handler: EventHandler<T>,
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
      // pgboss Worker fuer diesen Event-Typ registrieren
      this.boss.work(`domain-event.${eventType}`, async (job) => {
        const event = job.data as T;
        const handlers = this.handlers.get(eventType);
        if (handlers) {
          await Promise.allSettled(
            Array.from(handlers).map((h) => h(event)),
          );
        }
      });
    }
    this.handlers.get(eventType)!.add(handler);
  }

  // ... off(), stats() analog
}
```

### 8.3 Phase 3: Dedizierter Message-Broker (bei Bedarf)

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  API Pod 1   │   │  API Pod 2   │   │  API Pod N   │
│              │   │              │   │              │
│  Handler     │   │  Handler     │   │  Handler     │
│   ──emit──>  │   │   ──emit──>  │   │   ──emit──>  │
│  BrokerBus   │   │  BrokerBus   │   │  BrokerBus   │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                   ┌──────▼──────┐
                   │  Redis      │
                   │  Streams    │
                   │  (oder      │
                   │  RabbitMQ)  │
                   └──────┬──────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    ┌────▼────┐   ┌──────▼──────┐   ┌────▼────────┐
    │ Audit   │   │ Notification│   │ Analytics   │
    │ Group   │   │ Group       │   │ Group       │
    │ (2 Pods)│   │ (1 Pod)     │   │ (1 Pod)     │
    └─────────┘   └─────────────┘   └─────────────┘
```

**Trigger fuer Phase 3:**
- Mehr als 100 Tenants gleichzeitig aktiv
- Event-Rate > 1000 Events/Minute sustained
- Multi-Region-Deployment (Events muessen repliziert werden)
- Enterprise-Kunden benoetigen Webhook-Dispatch

### 8.4 Migrations-Garantie: Interface bleibt stabil

```typescript
// Der Code in den Handlern aendert sich NIE:
await eventBus.emit({
  type: 'contract.created',
  tenantId: ctx.tenantId,
  actorId: ctx.userId,
  timestamp: new Date().toISOString(),
  payload: { ... },
});

// Nur die EventBus-Implementierung wird ausgetauscht:
// Phase 1: const eventBus = new InProcessEventBus(logger);
// Phase 2: const eventBus = new PgBossEventBus(boss);
// Phase 3: const eventBus = new RedisStreamsEventBus(redis);
```

---

## 9. Testing-Strategie

### 9.1 EventBus Unit-Tests

```typescript
describe('InProcessEventBus', () => {
  it('should emit events to registered handlers', async () => {
    const bus = new InProcessEventBus(console);
    const handler = vi.fn();

    bus.on('contract.created', handler);
    await bus.emit({
      type: 'contract.created',
      tenantId: 't1',
      actorId: 'u1',
      timestamp: new Date().toISOString(),
      payload: { contractId: 'c1', templateVersionId: 'tv1', pinnedClauseVersionIds: [] },
    });

    expect(handler).toHaveBeenCalledOnce();
  });

  it('should isolate handler failures', async () => {
    const bus = new InProcessEventBus({ error: vi.fn() });
    const failingHandler = vi.fn().mockRejectedValue(new Error('boom'));
    const successHandler = vi.fn();

    bus.on('contract.created', failingHandler);
    bus.on('contract.created', successHandler);

    await bus.emit({
      type: 'contract.created',
      tenantId: 't1',
      actorId: 'u1',
      timestamp: new Date().toISOString(),
      payload: { contractId: 'c1', templateVersionId: 'tv1', pinnedClauseVersionIds: [] },
    });

    expect(failingHandler).toHaveBeenCalledOnce();
    expect(successHandler).toHaveBeenCalledOnce(); // Nicht blockiert
  });

  it('should track stats', async () => {
    const bus = new InProcessEventBus(console);
    bus.on('test.event', vi.fn());

    await bus.emit({ type: 'test.event', tenantId: 't1', actorId: null, timestamp: '' });

    const stats = bus.stats();
    expect(stats.eventsEmitted).toBe(1);
    expect(stats.registeredHandlers['test.event']).toBe(1);
  });
});
```

### 9.2 Consumer Integration-Tests

```typescript
describe('Audit Consumer', () => {
  it('should log audit event when contract is created', async () => {
    const bus = new InProcessEventBus(console);
    const auditService = { log: vi.fn().mockResolvedValue(undefined) };

    registerAuditConsumer(bus, auditService);

    await bus.emit({
      type: 'contract.created',
      tenantId: 'tenant-1',
      actorId: 'user-1',
      timestamp: new Date().toISOString(),
      payload: {
        contractId: 'contract-1',
        templateVersionId: 'tv-1',
        pinnedClauseVersionIds: ['cv-1', 'cv-2'],
      },
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        action: 'contract.create',
        objectType: 'ContractInstance',
        objectId: 'contract-1',
      }),
    );
  });
});
```

---

## 10. Offene Punkte

| # | Thema | Owner | Ziel |
|---|---|---|---|
| 1 | EventBus Interface + InProcessEventBus implementieren | Team 01 | Sprint 13 |
| 2 | Audit-Consumer registrieren und erste Handler migrieren | Team 02 | Sprint 13 |
| 3 | EventBus-Stats als Prometheus-Metrik exponieren | Team 01 + 07 | Sprint 13 |
| 4 | Alle Request-Handler auf eventBus.emit() migrieren | Alle Teams | Sprint 14 |
| 5 | PgBossEventBus-Adapter implementieren (Phase 2) | Team 01 + 05 | Phase 2 |
| 6 | Notification-Consumer implementieren | Team 02 | Phase 2 |
| 7 | Cache-Invalidation-Consumer implementieren | Team 03 + 04 | Phase 2 |
| 8 | OpenSearch-Indexierung-Consumer implementieren | Team 03 + 07 | Phase 2 |

---

## 11. Referenzen

- [Module Boundaries v1](module-boundaries-v1.md) -- Modul-Zugriffsmatrix, Cross-Module-Regeln
- [Audit Logging E2E Spec](audit-logging-e2e-v1.md) -- AuditService Interface, Event-Typen
- [Architecture Backbone v1](architecture-backbone-v1.md) -- BB-002 (pgboss), Modularer Monolith
- [ADR-003: Export-Engine](adr-003-export-engine-service.md) -- Export als separater Worker-Prozess
- [ADR-005: Breaking-Change-Policy](adr-005-breaking-change-policy.md) -- SemVer, Interface-Stabilitaet
- [Performance Baseline v1](performance-baseline-v1.md) -- Latenz-Ziele, Metriken

---

*Erstellt: 2026-02-11 | Team 01 (Product Architecture) | Sprint 12*
