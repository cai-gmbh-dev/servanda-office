// === Tenant Types ===

export type TenantType = 'vendor' | 'lawfirm' | 'individual';
export type TenantStatus = 'active' | 'suspended' | 'deleted';

export type UserRole = 'admin' | 'editor' | 'user';
export type UserStatus = 'invited' | 'active' | 'disabled';

// === Content Types ===

export type VersionStatus = 'draft' | 'review' | 'approved' | 'published' | 'deprecated';

export type RuleType = 'requires' | 'forbids' | 'incompatible_with' | 'scoped_to' | 'requires_answer';
export type RuleSeverity = 'hard' | 'soft';

export type SlotType = 'required' | 'optional' | 'alternative';

// === Interview Types ===

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'text'
  | 'number'
  | 'date'
  | 'currency'
  | 'yes_no';

export type ConditionOperator = 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in';
export type ConditionLogic = 'show' | 'hide' | 'skip';

// === Contract Types ===

export type ContractStatus = 'draft' | 'completed' | 'archived';
export type ValidationState = 'valid' | 'has_warnings' | 'has_conflicts';
export type Visibility = 'private' | 'team';

// === Export Types ===

export type ExportFormat = 'docx' | 'odt';
export type ExportJobStatus = 'queued' | 'running' | 'done' | 'failed';

// === Audit Types ===

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.invite'
  | 'user.update'
  | 'user.activate'
  | 'user.deactivate'
  | 'user.delete'
  | 'user.role_change'
  | 'clause.create'
  | 'clause.publish'
  | 'clause.deprecate'
  | 'clause.assign_reviewer'
  | 'clause.approve'
  | 'clause.reject'
  | 'clause.request_changes'
  | 'template.create'
  | 'template.publish'
  | 'template.deprecate'
  | 'template.assign_reviewer'
  | 'template.approve'
  | 'template.reject'
  | 'template.request_changes'
  | 'contract.create'
  | 'contract.update'
  | 'contract.complete'
  | 'contract.delete'
  | 'export.request'
  | 'export.complete'
  | 'export.fail'
  | 'export.dlq.retry'
  | 'export.dlq.archive'
  | 'branding.style_template.create'
  | 'branding.style_template.update'
  | 'branding.style_template.delete'
  | 'tenant.settings_change';

// === Shared Interfaces ===

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: UserRole;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
