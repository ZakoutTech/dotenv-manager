---
'dotenv-manager': patch
---

.env files no longer open in Dotenv Manager by default when an older version or Settings Sync wrote `workbench.editorAssociations` back. Those entries are now removed on every start and whenever they reappear, so Dotenv Manager opens only through **Open with Dotenv Manager**.
