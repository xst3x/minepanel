---
title: "phase-5-auth-review"
type: "plan"
tags:
  - #plan
  - #architecture
---

# phase-5-auth-review

> Internal development plan for [[Project]].

# Phase 5 - Authentication Review

Read and follow core-rules.md.

Goal:
Review and improve authentication.

Analyze:
- Password hashing
- JWT handling
- Session handling
- Login flow
- Logout flow

---

## Finding 1: Case-Sensitive Username Clash on Registration & Creation
* **File:** `src/routes/authRoutes.js` (registration) and `src/routes/userRoutes.js` (direct user creation)
* **Function:** `/register` endpoint and `/create` endpoint
* **Evidence:**
  In `authRoutes.js`:
  ```javascript
  const existingUser = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
  ```
  In `userRoutes.js`:
  ```javascript
  const existingUser = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
  ```
  However, in `authRoutes.js` `/login`:
  ```javascript
  const user = await dbGet('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
  ```
* **Impact:** 
  Users can register with duplicate names differing only in casing (e.g. `Admin` and `admin`). When either logs in, SQLite retrieves whichever record comes first or clashes, preventing the correct user from authenticating, or potentially allowing account shadowing.
* **Fix:** 
  Change checks to use `LOWER(username) = LOWER(?)` for both registration and creation.
* **Risk:** 
  Low. Resolves login conflicts and prevents spoofing.

---

## Finding 2: Lack of Centralized Errors in Token Authentication Middleware
* **File:** `src/core/auth.js`
* **Function:** `authenticateToken`
* **Evidence:**
  ```javascript
  if (token == null) return res.status(401).json({ error: 'Unauthorized' });
  // ...
  if (err) return res.status(401).json({ error: 'Session expired or invalid token' });
  ```
* **Impact:** 
  Violates Phase 3 specifications which mandate standardized error codes (`code`) and JSON response structure (`{ error: string, code: string }`) returned via the `sendError` function.
* **Fix:** 
  Import and call `sendError` from `../core/errors` with the corresponding error codes (`E.AUTH_UNAUTHORIZED` and `E.AUTH_TOKEN_INVALID`).
* **Risk:** 
  Low. Frontend is already designed to fallback or parse error fields.

---

## Finding 3: Missing /logout API Endpoint
* **File:** `src/routes/authRoutes.js`
* **Function:** Router definitions
* **Evidence:** 
  No `/logout` route is defined in the Express routes; logout is handled entirely client-side.
* **Impact:** 
  No server-side hook exists to record logout events, invalidate session caches (if introduced later), or allow external OAuth integrations to logout cleanly.
* **Fix:** 
  Add a `POST /logout` route that responds with `{ success: true }` and clear cookie wrappers if used.
* **Risk:** 
  Low. Completely backward-compatible.


## Related Architecture
- Overview: [[Project]]
- Roadmap: [[MASTER_ROADMAP]]


## Architecture Connections
- Auth Engine: [[Authentication Core Service]], [[Subsystem - Authentication and Permissions]]
- User Entity: [[Model - User]], [[Model - Rank]]
- Session Tokens: [[Model - AccountCreationToken]]
- Endpoints: [[Auth Routes]], [[User Management Routes]]
