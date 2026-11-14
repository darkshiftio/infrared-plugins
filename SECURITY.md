# Security policy

## Reporting a vulnerability

Report a vulnerability in this repository privately, through GitHub's private vulnerability reporting: on the
repository's **Security** tab, choose **Report a vulnerability**, or open
<https://github.com/darkshiftio/infrared-plugins/security/advisories/new>. Only you and the repository's maintainers
see the report.

Please don't report a vulnerability in a public issue, pull request or discussion.

Include what you can of:

- the plugin and its version (the `version` in its `.claude-plugin/plugin.json`, or `claude plugin list`);
- what an attacker could do, and under what conditions;
- the steps to reproduce it, or a proof of concept.

We reply on the report, and tell you there when a fix ships.

## Scope

- The hooks, which run on your machine with your permissions whenever Claude Code runs them.
- The skills, where an instruction could lead Claude to do something unsafe.
- The marketplace's manifest, and this repository's CI.

## Supported versions

Only the latest version of each plugin is supported. A fix ships as a new version of the plugin it affects; to take
it, run `claude plugin marketplace update infrared`, then `claude plugin update <plugin>@infrared`, such as
`infrared-change@infrared` or `infrared-telemetry@infrared` (see [README.md](README.md), Updating).
