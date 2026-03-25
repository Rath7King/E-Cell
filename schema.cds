namespace finsight.mfu;

// =====================================================
// ENTITIES — physical HANA tables
// =====================================================

// Entity 1: MFU Templates — every template record
// INSERT here → KPI cards, module chart, donut update live
entity MFUTemplates {
  key ID           : UUID;
      moduleName   : String(50);   // ESG | FINCOST | ICON | NFRP | TREASURY
      templateName : String(200);
      status       : String(20);   // UPLOADED | APPROVED | PENDING | REJECTED
      loadType     : String(30);   // TRUNCATE | DELTA | FULL
      subModule    : String(100);
      createdAt    : DateTime;
      updatedAt    : DateTime;
}

// Entity 2: MFU Load Details — each load run record
// INSERT here → appears in the bottom MFU Details table
entity MFULoadDetails {
  key ID            : UUID;
      moduleName    : String(50);
      subModuleName : String(100);
      loadType      : String(30);
      loadTemplate  : String(200);
      loadCount     : Integer64;
      loadDate      : DateTime;
}

// Entity 3: MFU Usage Stats — template usage per period
// INSERT here → updates Top 3 Month/Quarter/Year charts
entity MFUUsageStats {
  key ID           : UUID;
      templateName : String(200);
      moduleName   : String(50);
      usageCount   : Integer;
      period       : String(10);   // MONTH | QUARTER | YEAR
      periodDate   : Date;
}

// =====================================================
// VIEWS — auto-computed from MFUTemplates (no inserts)
// =====================================================

// View 1: KPI Summary → 4 KPI cards
view MFUKPISummary as
  select
    count(*)                                           as totalUploaded : Integer,
    count( case when status = 'APPROVED' then 1 end )  as totalApproved : Integer,
    count( case when status = 'REJECTED' then 1 end )  as totalRejected : Integer
  from MFUTemplates;

// View 2: Module Stats → MFU Templates by Modules chart
view MFUModuleStats as
  select
    moduleName,
    count( case when status = 'APPROVED' then 1 end )  as approved : Integer,
    count( case when status = 'PENDING'  then 1 end )  as pending  : Integer,
    count( case when status = 'UPLOADED' then 1 end )  as uploaded : Integer
  from MFUTemplates
  group by moduleName;

// View 3: Onboarded Count → "MFU Template Onboarded" KPI card
view MFUOnboardedCount as
  select count(*) as totalOnboarded : Integer
  from MFUTemplates
  where status = 'APPROVED';
