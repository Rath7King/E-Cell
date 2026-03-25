# FinSight MFU Dashboard — Deployment Guide
## SAP CAP + HANA Cloud Backend Connection

---

## Prerequisites — Install these once

```bash
# 1. CAP toolkit (includes cds CLI)
npm install -g @sap/cds-dk

# 2. Cloud Foundry CLI
# Download from: https://github.com/cloudfoundry/cli/releases

# 3. SAP CF tools plugin
npm install -g @sap/cf-tools
```

---

## PART 1 — Run Locally (SQLite, no HANA needed)

### Step 1: Install dependencies
```bash
cd finsight-mfu-dashboard
npm install
```

### Step 2: Start local server
```bash
npm run dev
```

Your service is now running at **http://localhost:4004**

Test these URLs in your browser:
```
http://localhost:4004/odata/v4/mfu/KPISummary
http://localhost:4004/odata/v4/mfu/ModuleStats
http://localhost:4004/odata/v4/mfu/Templates
http://localhost:4004/odata/v4/mfu/LoadDetails
http://localhost:4004/odata/v4/mfu/UsageStats
```

### Step 3: Test a local insert
```bash
curl -X POST http://localhost:4004/odata/v4/mfu/Templates \
  -H "Content-Type: application/json" \
  -d '{
    "moduleName":   "ESG",
    "templateName": "TEST TEMPLATE",
    "status":       "APPROVED",
    "loadType":     "TRUNCATE",
    "subModule":    "MAPPING MASTER"
  }'
```
Refresh the dashboard — KPI numbers update immediately.

---

## PART 2 — Connect to HANA Cloud (BTP)

### Step 1: Log in to BTP Cloud Foundry
```bash
cf login -a https://api.cf.<your-region>.hana.ondemand.com
# Example regions:
#   eu10 → https://api.cf.eu10.hana.ondemand.com
#   us10 → https://api.cf.us10.hana.ondemand.com

cf target -o <your-org> -s <your-space>
```

### Step 2: Create a HANA Cloud HDI container
```bash
cf create-service hana hdi-shared finsight-hana-db
```
Wait 1-2 minutes for provisioning, then check:
```bash
cf service finsight-hana-db
# Status should show: "create succeeded"
```

### Step 3: Bind HANA credentials to local environment
```bash
# Creates .cdsrc-private.json with HANA credentials
cds bind -2 finsight-hana-db
```
This creates a file like:
```json
{
  "requires": {
    "db": {
      "binding": {
        "type": "cf",
        "apiEndpoint": "https://api.cf.eu10.hana.ondemand.com",
        "org": "your-org",
        "space": "your-space",
        "instance": "finsight-hana-db",
        "key": "finsight-hana-db-key"
      }
    }
  }
}
```

### Step 4: Deploy the schema to HANA
```bash
# Build CDS artifacts
cds build --production

# Deploy schema + seed data to HANA
cds deploy --to hana
```
This creates the physical tables in HANA:
- `FINSIGHT_MFU_MFUTEMPLATES`
- `FINSIGHT_MFU_MFULOADDETAILS`
- `FINSIGHT_MFU_MFUUSAGESTATS`

### Step 5: Run the CAP server against HANA
```bash
# Starts with HANA connection (not SQLite)
cds serve --with-mocks --profile hybrid
```
Your OData service now reads/writes directly from HANA Cloud.

---

## PART 3 — Deploy CAP Backend to Cloud Foundry

### Step 1: Build production artifacts
```bash
cds build --production
```

### Step 2: Create a manifest.yml for CF push
```yaml
# manifest.yml (create in project root)
applications:
  - name: finsight-srv
    path: gen/srv
    buildpack: nodejs_buildpack
    memory: 256M
    command: node node_modules/@sap/cds/bin/cds-serve
    services:
      - finsight-hana-db
    env:
      NODE_ENV: production
```

### Step 3: Push to Cloud Foundry
```bash
cf push
```

### Step 4: Get your backend URL
```bash
cf app finsight-srv
# Look for: routes: finsight-srv.cfapps.eu10.hana.ondemand.com
```

### Step 5: Update manifest.json in the UI5 app
Open `app/webapp/manifest.json` and update the OData URI:
```json
"dataSources": {
  "MFUService": {
    "uri": "https://finsight-srv.cfapps.eu10.hana.ondemand.com/odata/v4/mfu/",
    "type": "OData",
    "settings": { "odataVersion": "4.0" }
  }
}
```

---

## PART 4 — Test Live Connection

### Open HANA Database Explorer
1. Go to **SAP BTP Cockpit** → your subaccount
2. Click **SAP HANA Cloud** → **Open Database Explorer**
3. Connect to your HDI container instance

### Run the sample SQL from `sample-db-test.sql`

```sql
-- Quick smoke test
SELECT COUNT(*) FROM "FINSIGHT_MFU_MFUTEMPLATES";

-- Insert one row
INSERT INTO "FINSIGHT_MFU_MFUTEMPLATES"
    (ID, MODULENAME, TEMPLATENAME, STATUS, LOADTYPE, SUBMODULE, CREATEDAT, UPDATEDAT)
VALUES
    (SYSUUID, 'ESG', 'LIVE TEST TEMPLATE', 'APPROVED', 'TRUNCATE', 'MAPPING MASTER', NOW(), NOW());
```

Then click **Refresh** in the dashboard — the KPI numbers update immediately.

---

## Project File Structure

```
finsight-mfu-dashboard/
├── db/
│   ├── schema.cds                        ← HANA tables + views
│   └── data/
│       └── finsight.mfu-MFUTemplates.csv ← Seed data
├── srv/
│   └── cat-service.cds                   ← OData V4 service (single file)
├── app/
│   └── webapp/
│       ├── manifest.json                 ← OData model config
│       ├── view/View1.view.xml           ← Dashboard layout
│       ├── controller/View1.controller.js← Live data fetch
│       └── css/style.css                 ← SAP UI5 styles
├── package.json                          ← Dependencies + scripts
├── sample-db-test.sql                    ← Test SQL queries
└── DEPLOYMENT_GUIDE.md                   ← This file
```

---

## How Live Connection Works

```
INSERT INTO HANA table
      ↓
CDS views (MFUKPISummary, MFUModuleStats) recompute live
      ↓
UI5 controller calls /odata/v4/mfu/KPISummary every 30s
      ↓
Dashboard numbers update automatically
```

The **Refresh button** triggers an immediate re-fetch without waiting for the 30-second timer.

---

## Common Issues

| Problem | Fix |
|---|---|
| `cds watch` shows SQLite instead of HANA | Run `cds bind -2 finsight-hana-db` first |
| Tables not created in HANA | Run `cds deploy --to hana` again |
| OData returns 401 | Check CF login: `cf login` |
| Dashboard shows `...` forever | Check OData URI in `manifest.json` matches deployed URL |
| Charts empty after insert | Click Refresh button or wait 30 seconds |
