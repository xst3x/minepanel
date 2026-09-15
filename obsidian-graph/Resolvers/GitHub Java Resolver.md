---
title: GitHub Java Resolver
type: resolver
source_file: src/core/resolvers/github-java.ts
tags:
  - #resolver
  - #backend
---

# GitHub Java Resolver

Generic reusable resolver that pulls release artifacts from GitHub repositories using the GitHub REST API.

## Key Responsibilities
- Inspects GitHub release assets for matching `.jar` filenames.
- Handles rate-limiting, release tags, and asset download streaming.

## Related Architecture
- Used by: [[Arclight Resolver]], [[Software Version Resolvers]]
- Bedrock variant: [[Bedrock Version Service]]
