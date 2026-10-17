export type McpIdentity = {
  id: string; name: string; description: string; rankId: number | null; overrides: Record<string, boolean>;
  allowedServers: string[]; approvalMode: 'full' | 'dangerous' | 'everything'; requestsPerMinute: number;
  enabled: boolean; keyVersion: number; createdAt: number; lastUsedAt: number | null;
};
export type IdentityForm = Omit<McpIdentity, 'id' | 'keyVersion' | 'createdAt' | 'lastUsedAt'>;
export type McpSettings = {
  enabled: boolean; endpoint: string; publicUrl: string; allowedOrigins: string[]; requestsPerMinute: number;
  identityRequestsPerMinute: number; maxConcurrent: number; maxPendingApprovals: number; requestTimeoutMs: number;
  approvalExpirationMs: number; maxRequestBytes: number;
};
export type Approval = { id: string; identity_id: string; identity_name: string; tool: string; arguments: string;
  risk: string; server_id: string | null; created_at: number; expires_at: number; status: string };
export const approvalModes = { full: 'Full Access', dangerous: 'Approve Dangerous Commands', everything: 'Approve Everything' };

export function canManageMcp(user: { role?: string; globalPermissions?: string[] } | null | undefined): boolean {
  const granted = Array.isArray(user?.globalPermissions) ? user.globalPermissions : [];
  return user?.role === 'admin' || granted.includes('*') || granted.includes('root') || granted.includes('mcp.manage');
}
