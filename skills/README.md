# Skills

Agent skills for this project. A skill is a markdown file with frontmatter. The
agent loads it on demand, when the request matches the `description`.

| Skill | Audience | Purpose |
|---|---|---|
| `domain-glossary-mcp` | anyone who uses the server | connect the server to an MCP client, and use the 3 tools correctly |
| `domain-glossary-mcp-dev` | anyone who changes this repository | layout, traps, design rules and the release steps |

## Install

Copy the folder of the skill you want.

For one repository:

```bash
cp -r skills/domain-glossary-mcp <target-repo>/.kiro/skills/
```

For every repository on the machine:

```bash
cp -r skills/domain-glossary-mcp ~/.kiro/skills/
```

Kiro reads `.kiro/skills/<name>/SKILL.md` in both scopes. Start a new session
after the copy, so the agent sees the skill.

Most consumers need only `domain-glossary-mcp`. Copy
`domain-glossary-mcp-dev` into a clone of this repository.
