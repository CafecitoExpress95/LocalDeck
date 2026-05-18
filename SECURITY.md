# Security Policy

LocalDeck is a local-first, offline-capable desktop application. It is designed to avoid accounts, telemetry, and a centralized cloud backend, but it is still software that may contain security issues. This policy explains which versions receive security attention and how to report vulnerabilities responsibly.

## Supported Versions

Security updates are provided for the currently supported public releases of LocalDeck.

| Version | Supported | Notes |
| --- | --- | --- |
| `<current-supported-version>` | Yes | Current stable release line. |
| `<previous-supported-version>` | `<yes/no>` | Optional previous release line, if maintained. |
| Nightly builds | No immediate guarantee | Experimental builds may include unstable or partially tested functionality. |
| Older versions | No | Please update to a supported version before reporting issues when possible. |

Nightly builds are useful for testing new work, but they are experimental and may not receive immediate security support. Security fixes are prioritized for supported stable releases.

## Reporting a Vulnerability

Please do not post security issues publicly in GitHub Issues.

Preferred reporting methods:

1. Use GitHub private vulnerability reporting, if enabled: `<GitHub security advisory / private vulnerability reporting link>`
2. If private reporting is not available, email: `<security-email@example.com>`

If neither option is available yet, please open a non-sensitive GitHub Issue asking for a private security contact without including technical details of the vulnerability.

## What to Include in Reports

Helpful vulnerability reports include:

- Clear reproduction steps
- Screenshots or screen recordings, if relevant
- Platform and operating system version
- LocalDeck application version
- Severity assessment, if known
- Proof-of-concept code or files, if applicable
- Any relevant logs or error messages that do not expose personal data

Please avoid including private board data, secrets, credentials, or personal information unless it is strictly necessary to demonstrate the issue.

## Response Expectations

LocalDeck is a personally maintained open source project, so response times may vary. Legitimate security reports will be reviewed seriously, but immediate triage or fixes cannot always be guaranteed.

Responsible disclosure is appreciated. When a report is confirmed, the maintainer will aim to assess impact, identify affected versions, prepare a fix when practical, and coordinate disclosure in a reasonable way.

## Security Philosophy

LocalDeck's design intentionally reduces exposure to common cloud application risks:

- User data remains local by default.
- The app does not require accounts.
- The app does not include telemetry.
- The app does not depend on a centralized backend.
- Offline-capable workflows are part of the core design.

This local-first model reduces cloud attack surface, but it does not eliminate local application, dependency, file handling, platform, or operating system risks.

## Important Security Notes

- No software is perfectly secure.
- Users should keep regular backups of important boards and project data.
- Users should avoid storing highly sensitive regulated information in LocalDeck until the project matures further.
- Local encryption features may evolve over time and should not be assumed unless clearly documented for a specific release.
- Nightly builds may contain unstable, incomplete, or partially tested functionality.
- Security can depend on the operating system, local device configuration, installed dependencies, and how board files are shared or stored.

## Scope

Security reports should focus on LocalDeck itself, including:

- LocalDeck application behavior
- Board file handling
- Local data storage behavior
- Import/export behavior
- Tauri desktop integration
- SvelteKit frontend behavior
- Dependency usage within the LocalDeck application

Third-party dependencies, operating systems, browsers, package managers, and desktop environments may have their own disclosure processes. Operating system level compromises, compromised user accounts, or malicious local administrator access are generally outside the scope of the LocalDeck project.

## Responsible Disclosure

When researching or reporting a vulnerability, please:

- Avoid public disclosure before a fix or mitigation is available.
- Give reasonable time for review and remediation.
- Avoid destructive testing.
- Avoid attempts to access, modify, or delete another person's data.
- Avoid testing against public infrastructure that is not owned by you.

Because LocalDeck has no cloud backend, most testing should be possible in a local environment using test data.

## Credits

Responsible reporters may optionally be credited in release notes or security advisories unless anonymity is requested.

