import express = require('express');
import type { Request, Response, Router } from 'express';
import { bindMcpPrincipal } from './principal';

/** Invoke fixed, audited GUI operations in process, retaining their middleware and validators.
 * No loopback listener, internal JWT, client-selected route, or administrator impersonation.
 * Only JSON handlers are supported; downloads/uploads get explicit adapters separately.
 */
export function invokeOperation(router: Router, identityId: string, method: string, url: string,
    serverId?: string, body: Record<string, unknown> = {}, query: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const req = Object.assign(Object.create(express.request) as Request, {
            method, url, originalUrl: url, baseUrl: '', headers: {}, body, query,
            params: serverId ? { serverId } : {}, app: { get: () => undefined },
        });
        bindMcpPrincipal(req, identityId);
        const res = Object.assign(Object.create(express.response) as Response, {
            statusCode: 200, locals: {}, req,
            setHeader: () => res, getHeader: () => undefined, removeHeader: () => res,
            status: (status: number) => { res.statusCode = status; return res; },
            json: (value: unknown) => {
                if (res.statusCode >= 400) reject(new Error(`MinePanel operation rejected (${res.statusCode})`));
                else resolve(value);
                return res;
            },
            send: (value: unknown) => { resolve(value); return res; }
        });
        // express.Router.handle is an existing public runtime method omitted by @types/express.
        (router as Router & { handle(req: Request, res: Response, next: (error?: unknown) => void): void })
            .handle(req, res, error => reject(new Error(error ? 'MinePanel operation failed' : 'Unsupported operation')));
    });
}
