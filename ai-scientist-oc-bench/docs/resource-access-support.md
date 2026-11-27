# Resource access assistance v1
New benchmark launches and repair passes receive the playbook. The chief and execution workers get early dependency inventory and first-failure support. resource-access performs bounded HEAD diagnostics and returns resource-specific recovery routes. It does not download full assets or establish experiment completion.
No shared cache, proxy, download node, mirror or credential is silently configured. Those routes require existing explicit authorization/configuration. No hidden task requirements or target scores are embedded. reference-only-v3 is unchanged. Existing sessions may retain old tools; new launcher processes load deployed config.
Validation: node --test tests/test-resource-access.mjs; bash tests/test-clawbenchmark.sh.

## Deployment verification
- Five resource-access tests passed.
- Existing test-clawbenchmark.sh passed: 34 checks plus launcher/output validation fixtures.
- opencode debug agent ai-scientist-benchmark loaded resource-access=true and the new assistance instructions.
- Live host probes of official Hugging Face config and GitHub repository endpoints both returned curl exit 28 / HTTP 000; correctly classified network_timeout rather than permission_blocked. This does not establish the cause or rule out other worker network paths. No full model download or scientific rerun was performed.
- The separate legacy validate-ai-scientist.sh could not execute due to existing CRLF (pipefail); that script was not changed.
- Backup: /home/songz/ai-scientist-oc-bench-backups/resource-support-20261105T130820 (manifest lists prior/new files).
