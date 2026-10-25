# Security Policy

## Supported versions

Security fixes are released for the latest minor version on npm. While yapin.js is below 1.0, that means the newest `0.x` release only. Please upgrade before reporting.

| Version | Supported |
| --- | --- |
| Latest `0.x` | Yes |
| Older | No |

## Reporting a vulnerability

**Please don't open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub instead:

1. Go to the [Security tab](https://github.com/yapin-js/yapin.js/security) of this repository.
2. Click **Report a vulnerability**.
3. Describe the problem, the affected version, and how to reproduce it. A minimal bot or test case helps a lot.

Only the maintainers can see the report.

## What to expect

- We aim to acknowledge reports within **3 days**.
- We'll confirm whether it's a vulnerability and keep you updated as we work on a fix.
- Once a fix is released, we'll publish a GitHub Security Advisory and credit you, unless you'd rather stay anonymous.

Please give us a reasonable amount of time to release a fix before you disclose anything publicly. We'll agree a date with you; 90 days is the usual upper limit.

## Scope

In scope: problems in this library's code, such as:

- Leaking a bot token or OAuth2 secret (in logs, errors, requests to the wrong host, and so on)
- Incorrect webhook signature verification
- Permission or role checks in the command framework that can be bypassed
- Path traversal or code execution through module or command loading
- Anything that lets a Yapin’ user make a bot do something its developer didn't intend

Out of scope:

- Vulnerabilities in Yapin’ itself. Report those to Yapin’.
- Bugs in a bot that uses yapin.js, unless the library caused them.
- A token that was leaked by committing it, pasting it, or similar. Reset it in **Settings → Developer** in Yapin’.
