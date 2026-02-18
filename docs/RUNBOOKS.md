# 🚒 Disaster Recovery & Runbooks

> **Version**: 1.0 | **Status**: Draft | **SLA Targets**: RTO < 30min, RPO < 5min

## Runbook 1: MongoDB Region Failure (P0)
**Scenario**: Primary MongoDB Atlas region is unreachable.
**RTO**: < 30 mins | **RPO**: < 5 mins

### Steps
1. **Verify**: Run `mongosh --eval "rs.status()"` to confirm primary is down.
2. **Failover**: Trigger Atlas Auto-Failover or manual `rs.stepDown()`.
3. **Traffic**: Update Cloud DNS CNAME to secondary region.
4. **Validate**: Run `./deploy.sh production health` to confirm all services reconnect.
5. **Notify**: Post to `#ops-incidents` Slack channel with timeline.

### Post-Mortem Checklist
- [ ] Confirm replica resync completed
- [ ] Verify no data loss via oplog gap analysis
- [ ] Update status page

---

## Runbook 2: Single-Tenant Data Restore (P1)
**Scenario**: A client accidentally deletes their workspace data.
**Retention**: 30 days (Soft Delete) → 90 days (Backup).

### Steps
1. **Identify**: Get `workspaceId` from the audit log or client report.
2. **Check soft-delete**: Query `workspaces` collection for `status: "deleted"` entries.
3. **Locate Backup**:
   ```bash
   mongodump --uri=$BACKUP_URI --query='{"workspaceId": ObjectId("...")}' --out=./restore_dump
   ```
4. **Restore to Staging** first to verify data integrity:
   ```bash
   mongorestore --uri=$STAGING_URI --nsInclude="motherboard.*" ./restore_dump
   ```
5. **Merge to Production** using upsert mode:
   ```bash
   mongoimport --uri=$PROD_URI --mode=upsert --collection=<collection> ./restore_dump/motherboard/<collection>.bson
   ```
6. **Validate**: Confirm workspace loads correctly in the dashboard.

---

## Runbook 3: Secret Rotation
**Cadence**: Every 90 Days (or immediately upon suspected compromise).

### JWT Keys
1. Generate new key → set as `JWT_SECRET`
2. Set old key as `JWT_SECRET_PREVIOUS` (dual-key mode)
3. Rolling restart all services
4. Wait 24 hours (max session TTL)
5. Remove `JWT_SECRET_PREVIOUS`

### Database Credentials
1. Create new MongoDB Atlas user with same roles
2. Update `MONGODB_URI` in Google Secret Manager
3. Rolling restart all services (Cloud Run auto-picks new secret)
4. Delete old Atlas user after confirming no connections

### Payment Provider Keys
1. Rotate in provider dashboard (Stripe/Razorpay)
2. Update `STRIPE_WEBHOOK_SECRET` / `RAZORPAY_WEBHOOK_SECRET`
3. Update `STRIPE_SECRET_KEY` / `RAZORPAY_KEY_SECRET`
4. Validate webhook delivery on next event

---

## Runbook 4: Service Outage Escalation
**Trigger**: `/health` or `/heartbeat` returns non-200 for > 2 minutes.

| Severity | Response Time | Escalation Path |
|---|---|---|
| **P0** (All users affected) | 5 min | On-call → Engineering Lead → CTO |
| **P1** (Single tenant affected) | 15 min | On-call → Engineering Lead |
| **P2** (Degraded performance) | 30 min | On-call |
| **P3** (Non-critical feature) | Next business day | Backlog |

### Immediate Actions
1. Check Cloud Run service status: `gcloud run services describe <service>`
2. Check logs: `gcloud logging read "resource.type=cloud_run_revision"`
3. Check MongoDB health: `mongosh --eval "db.runCommand({ping:1})"`
4. Check Redis: `redis-cli ping`
