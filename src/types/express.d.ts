import 'express';
import 'express-serve-static-core';

// Augment Express Request to include user property set by auth middleware
declare global {
  namespace Express {
    interface Request {
      user?: any;
      id?: string;
    }
  }
}

// Augment ParamsDictionary to allow any string key access
declare module 'express-serve-static-core' {
  interface ParamsDictionary {
    [key: string]: string;
    serverId?: string;
    ruleId?: string;
    userId?: string;
    fileId?: string;
    botId?: string;
  }
}
