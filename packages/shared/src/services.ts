/**
 * Module Service Interfaces — Sprint 5
 *
 * These interfaces define the contract between modules.
 * Each module implements its service and exposes it to the API layer.
 * All methods receive tenantId explicitly for RLS context.
 */

import type {
  TenantContext,
  PaginatedResult,
  VersionStatus,
  ContractStatus,
  ExportFormat,
  ExportJobStatus,
  AuditAction,
  RuleSeverity,
} from './types';

// ============================================================
// CONTENT SERVICE (Team 03)
// ============================================================

export interface CreateClauseInput {
  title: string;
  jurisdiction: string;
  legalArea?: string;
  tags?: string[];
}

export interface CreateClauseVersionInput {
  clauseId: string;
  content: string;
  parameters?: Record<string, unknown>;
  rules?: RuleInput[];
  validFrom?: string;
  validUntil?: string;
}

export interface RuleInput {
  type: 'requires' | 'forbids' | 'incompatible_with' | 'scoped_to' | 'requires_answer';
  targetClauseId?: string;
  questionKey?: string;
  expectedAnswer?: unknown;
  severity: RuleSeverity;
  message: string;
}

export interface ClauseDto {
  id: string;
  tenantId: string;
  title: string;
  tags: string[];
  jurisdiction: string;
  legalArea: string | null;
  currentPublishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClauseVersionDto {
  id: string;
  clauseId: string;
  versionNumber: number;
  content: string;
  parameters: Record<string, unknown> | null;
  rules: RuleInput[];
  status: VersionStatus;
  authorId: string;
  reviewerId: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface CreateTemplateInput {
  title: string;
  description?: string;
  category?: string;
  jurisdiction: string;
  legalArea?: string;
  tags?: string[];
}

export interface CreateTemplateVersionInput {
  templateId: string;
  structure: TemplateSectionInput[];
  interviewFlowId?: string;
  defaultStyleTemplateId?: string;
}

export interface TemplateSectionInput {
  title: string;
  slots: TemplateSlotInput[];
}

export interface TemplateSlotInput {
  clauseId: string;
  type: 'required' | 'optional' | 'alternative';
  alternativeClauseIds?: string[];
}

export interface TemplateDto {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  category: string | null;
  jurisdiction: string;
  legalArea: string | null;
  tags: string[];
  currentPublishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVersionDto {
  id: string;
  templateId: string;
  versionNumber: number;
  structure: TemplateSectionInput[];
  interviewFlowId: string | null;
  defaultStyleTemplateId: string | null;
  status: VersionStatus;
  authorId: string;
  reviewerId: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface ContentService {
  // Clauses
  createClause(ctx: TenantContext, input: CreateClauseInput): Promise<ClauseDto>;
  listClauses(ctx: TenantContext, page?: number, pageSize?: number): Promise<PaginatedResult<ClauseDto>>;
  getClause(ctx: TenantContext, clauseId: string): Promise<ClauseDto>;
  createClauseVersion(ctx: TenantContext, input: CreateClauseVersionInput): Promise<ClauseVersionDto>;
  listClauseVersions(ctx: TenantContext, clauseId: string): Promise<ClauseVersionDto[]>;
  transitionClauseVersionStatus(
    ctx: TenantContext,
    clauseId: string,
    versionId: string,
    targetStatus: VersionStatus,
    reviewerId?: string,
  ): Promise<ClauseVersionDto>;

  // Templates
  createTemplate(ctx: TenantContext, input: CreateTemplateInput): Promise<TemplateDto>;
  listTemplates(ctx: TenantContext, page?: number, pageSize?: number): Promise<PaginatedResult<TemplateDto>>;
  getTemplate(ctx: TenantContext, templateId: string): Promise<TemplateDto>;
  createTemplateVersion(ctx: TenantContext, input: CreateTemplateVersionInput): Promise<TemplateVersionDto>;
  transitionTemplateVersionStatus(
    ctx: TenantContext,
    templateId: string,
    versionId: string,
    targetStatus: VersionStatus,
    reviewerId?: string,
  ): Promise<TemplateVersionDto>;

  // Published Catalog (cross-tenant read for lawfirms)
  listPublishedTemplates(ctx: TenantContext, page?: number, pageSize?: number): Promise<PaginatedResult<TemplateDto>>;
}

// ============================================================
// CONTRACT SERVICE (Team 04)
// ============================================================

export interface CreateContractInput {
  title: string;
  templateVersionId: string;
  clientReference?: string;
  tags?: string[];
}

export interface UpdateContractInput {
  answers?: Record<string, unknown>;
  selectedSlots?: Record<string, string>;
  title?: string;
  clientReference?: string;
  tags?: string[];
}

export interface ContractDto {
  id: string;
  tenantId: string;
  creatorId: string;
  title: string;
  clientReference: string | null;
  tags: string[];
  templateVersionId: string;
  clauseVersionIds: string[];
  answers: Record<string, unknown>;
  selectedSlots: Record<string, string>;
  validationState: string;
  validationMessages: ValidationMessage[] | null;
  status: ContractStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationMessage {
  ruleId: string;
  clauseId: string;
  severity: RuleSeverity;
  message: string;
}

export interface ContractService {
  createContract(ctx: TenantContext, input: CreateContractInput): Promise<ContractDto>;
  listContracts(ctx: TenantContext, page?: number, pageSize?: number): Promise<PaginatedResult<ContractDto>>;
  getContract(ctx: TenantContext, contractId: string): Promise<ContractDto>;
  updateContract(ctx: TenantContext, contractId: string, input: UpdateContractInput): Promise<ContractDto>;
  completeContract(ctx: TenantContext, contractId: string): Promise<ContractDto>;
  validateContract(ctx: TenantContext, contractId: string): Promise<ValidationMessage[]>;
}

// ============================================================
// EXPORT SERVICE (Team 05)
// ============================================================

export interface CreateExportJobInput {
  contractInstanceId: string;
  format: ExportFormat;
  styleTemplateId?: string;
}

export interface ExportJobDto {
  id: string;
  tenantId: string;
  contractInstanceId: string;
  requestedBy: string;
  format: ExportFormat;
  status: ExportJobStatus;
  resultStoragePath: string | null;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  downloadUrl?: string;
}

export interface ExportService {
  createExportJob(ctx: TenantContext, input: CreateExportJobInput): Promise<ExportJobDto>;
  getExportJob(ctx: TenantContext, jobId: string): Promise<ExportJobDto>;
  getDownloadUrl(ctx: TenantContext, jobId: string): Promise<string>;
}

// ============================================================
// AUDIT SERVICE (Team 02)
// ============================================================

export interface AuditEventInput {
  action: AuditAction;
  objectType: string;
  objectId: string;
  details?: Record<string, unknown>;
}

export interface AuditEventDto {
  id: string;
  tenantId: string;
  actorId: string | null;
  action: string;
  objectType: string;
  objectId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
}

export interface AuditQueryFilter {
  action?: string;
  objectType?: string;
  objectId?: string;
  from?: string;
  to?: string;
}

export interface AuditService {
  log(ctx: TenantContext, input: AuditEventInput, meta?: { ip?: string; userAgent?: string }): Promise<void>;
  query(
    ctx: TenantContext,
    filter: AuditQueryFilter,
    page?: number,
    pageSize?: number,
  ): Promise<PaginatedResult<AuditEventDto>>;
}
