---
description: Save an artifact (e.g., implementation plan) from .gemini to the repository
---

# Save Artifact to Repository

This workflow allows you to move specific markdown artifacts from the ephemeral `.gemini` folder to a permanent location in your repository.

1. **Identify Artifact**:
    List the artifacts in the current brain folder to find the one you want to save.

    ```bash
    ls -l /Users/rupali.b/.gemini/antigravity/brain/578e3df3-8552-42a6-9be6-35f4426fc1dc/
    ```

2. **Copy Artifact**:
    Use the `cp` command to copy the file. Replace `<ARTIFACT_NAME>` with the filename (e.g., `implementation_plan.md`) and `<DESTINATION_PATH>` with the relative path in the repo (e.g., `docs/archived_plans/`).

    Example:

    ```bash
    # Create destination if it doesn't exist
    mkdir -p docs/archived_plans
    
    # Copy the file
    cp /Users/rupali.b/.gemini/antigravity/brain/578e3df3-8552-42a6-9be6-35f4426fc1dc/implementation_plan.md docs/archived_plans/plan_$(date +%Y%m%d).md
    ```

3. **Verify**:
    Check that the file exists in the repo.

    ```bash
    ls -l docs/archived_plans/
    ```
