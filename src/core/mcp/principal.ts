import type { Request } from 'express';

// This capability is object-local. Headers, JWTs and request bodies cannot mint it.
const principals = new WeakMap<object, string>();
export function bindMcpPrincipal(request: object, identityId: string) {
    principals.set(request, identityId);
}
export function trustedMcpPrincipal(request: Request): string | undefined {
    return principals.get(request);
}
