---
title: "phase-9-documentation"
type: "plan"
tags:
  - #plan
  - #architecture
---

# phase-9-documentation

> Internal development plan for [[Project]].

\## Documentation Architecture



MinePanel uses TWO separate documentation systems:



\---



\### 1. In-Panel Documentation (UI)



Location: Web Panel → Documentation tab



Purpose:

\- End-user guides

\- How to use features

\- Simple explanations

\- Admin usage



Rules:

\- Must stay non-technical

\- Must be easy to understand

\- No internal implementation details



\---



\### 2. Project Documentation (Developer Docs)



Location:

/docs



Purpose:

\- Architecture details

\- Internal behavior

\- API specs (technical)

\- Database structure

\- Security notes

\- Deployment info



Rules:

\- Only for developers

\- Must reflect real implementation

\- No fake or “planned” features

\- Must not duplicate UI docs unless necessary



## Related Architecture
- Overview: [[Project]]
- Roadmap: [[MASTER_ROADMAP]]


## Architecture Connections
- Documentation Routes: [[Documentation Routes]]
- Frontend Reader: [[Frontend Page - Docs]]
- OpenAPI Specs: [[Server API Documentation Routes]]
- Index: [[INDEX]]
