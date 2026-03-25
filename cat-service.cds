using finsight.mfu as db from '../db/schema';

// =====================================================
// MFU OData V4 Service
// Exposed at: /odata/v4/mfu
// =====================================================
service MFUService @(path: '/odata/v4/mfu') {

    // ── Writable entities (INSERT/UPDATE/DELETE allowed) ──
    entity Templates    as projection on db.MFUTemplates;
    entity LoadDetails  as projection on db.MFULoadDetails;
    entity UsageStats   as projection on db.MFUUsageStats;

    // ── Read-only computed views (reflect inserts instantly) ──
    @readonly entity KPISummary     as projection on db.MFUKPISummary;
    @readonly entity ModuleStats    as projection on db.MFUModuleStats;
    @readonly entity OnboardedCount as projection on db.MFUOnboardedCount;

    // ── Manual refresh action ──
    action refreshDashboard() returns String;
}

// =====================================================
// Service Behaviour (annotations)
// =====================================================
annotate MFUService.Templates with @(
    UI.LineItem: [
        { Value: moduleName   },
        { Value: templateName },
        { Value: status       },
        { Value: loadType     },
        { Value: subModule    }
    ]
);
