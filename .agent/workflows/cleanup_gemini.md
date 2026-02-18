---
description: Manually trigger .gemini cleanup or reinstall the daily scheduler
---

# Cleanup Gemini Folder

This workflow helps you clean up the `.gemini` folder or reinstall the daily cleanup job.

1. **Run Cleanup Now**:
    To run the cleanup script immediately:

    ```bash
    /Users/rupali.b/.gemini/antigravity/scripts/daily_cleanup.sh
    ```

2. **Reinstall Scheduler**:
    To reinstall or fix the daily scheduled job (runs at 10 AM):

    ```bash
    /Users/rupali.b/.gemini/antigravity/scripts/setup_cleanup_cron.sh
    ```
