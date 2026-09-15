---
title: Application Error Codes
type: core
source_file: src/core/errorCodes.ts
tags:
  - #core
  - #backend
---

# Application Error Codes

Centralized enumeration of machine-readable error codes returned in JSON API responses.

## Key Error Codes
- `ERR_SERVER_NOT_FOUND`: Server ID does not exist
- `ERR_SERVER_RUNNING`: Action cannot be performed while server is active
- `ERR_SERVER_STOPPED`: Command rejected because server is not running
- `ERR_AUTH_INVALID_TOKEN`: Bearer token expired or invalid
- `ERR_AUTH_2FA_REQUIRED`: Two-factor TOTP verification pending
- `ERR_API_KEY_IP_FORBIDDEN`: Client IP outside API key allowlist
- `ERR_FILE_ACCESS_DENIED`: Path traversal or restricted file access

## Related Architecture
- Used by: [[Application Errors Framework]]
- Consumed by: [[API Key Auth Middleware]], [[Subsystem - Authentication and Permissions]]
