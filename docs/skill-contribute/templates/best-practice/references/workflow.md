# Workflow (edit for your scenario)

Describe the step-by-step Bailian usage for this business scenario.

1. Clarify the user goal and whether Bailian is required.
2. Ensure `bailian-protocol` (and this skill) are installed:

   ```sh
   bl skill add --name bailian-protocol,your-skill-name
   ```

3. Follow protocol rules (consent, auth, call attribution) when running `bl`.
4. For domain work (media, fine-tune, …), hand off by **skill name** to the matching `bailian-*` skill if installed; otherwise use `bl … --help`.
5. Record outcomes the user cares about; do not invent flags—use `--help` or an installed skill's docs.
