# Project installation provenance

Source: https://github.com/cloudflare/security-audit-skill
Revision: c1c8a8c1471069fb0e188eeaff69b8e8db6564a8
Installed: 2026-09-20 into the project-level `.agents/skills/security-audit` directory.
Scope: generic Agent Skills; no global installation or OpenAI security skill.
Upstream SKILL.md and companions are unmodified. Upstream MIT LICENSE is included.

This session loaded the installed SKILL.md directly. Future agent turns can discover
it through the project skill directory. Reports and scratch data are outside Git.

On this Windows host the upstream CLI validators refuse to read files because Node
lacks their required POSIX no-follow flags. Their exported pure validators can
check parent-generated JSON structure, but that does not satisfy the strict CLI
file-protection contract. See the audit report for actual coverage and limits.
