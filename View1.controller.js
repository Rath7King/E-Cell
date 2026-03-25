sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/viz/ui5/controls/VizFrame",
    "sap/viz/ui5/controls/common/feeds/FeedItem",
    "sap/viz/ui5/data/FlattenedDataset",
    "sap/m/MessageToast"
], function (Controller, JSONModel, VizFrame, FeedItem, FlattenedDataset, MessageToast) {
    "use strict";

    return Controller.extend("project1.controller.View1", {

        // ── Lifecycle ────────────────────────────────────────────
        onInit: function () {
            this._initDashboardModel();
            this._loadDashboardData();
            // Auto-refresh every 30 seconds
            this._refreshTimer = setInterval(
                this._loadDashboardData.bind(this), 30000
            );
        },

        onExit: function () {
            if (this._refreshTimer) { clearInterval(this._refreshTimer); }
        },

        onAfterRendering: function () {
            this._configureCharts();
        },

        // ── Local JSON model (holds chart + KPI data) ─────────────
        _initDashboardModel: function () {
            this.getView().setModel(new JSONModel({
                createdDate:    "",
                kpi: {
                    uploaded:  "...",
                    approved:  "...",
                    onboarded: "...",
                    rejected:  "-"
                },
                moduleData:     [],
                pieData:        [],
                topMonthData:   [],
                topQuarterData: [],
                topYearData:    [],
                tableData:      []
            }), "dashboard");
        },

        // ── Load all data from OData ──────────────────────────────
        _loadDashboardData: function () {
            var that   = this;
            var oModel = this.getView().getModel(); // OData V4 from manifest

            Promise.all([
                that._fetchKPI(oModel),
                that._fetchModuleStats(oModel),
                that._fetchUsageStats(oModel),
                that._fetchTableData(oModel)
            ]).then(function () {
                var now = new Date();
                that.getView().getModel("dashboard").setProperty(
                    "/createdDate",
                    "CREATEDDAY: " +
                    now.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) +
                    " " + now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0") + "..."
                );
                that._configureCharts();
            }).catch(function (err) {
                console.error("Dashboard load error:", err);
                MessageToast.show("Error loading data from HANA");
            });
        },

        // ── Fetch KPI counts ──────────────────────────────────────
        _fetchKPI: function (oModel) {
            var that = this;
            return new Promise(function (resolve, reject) {
                // Uploaded + Approved + Rejected
                oModel.bindList("/KPISummary").requestContexts(0, 1).then(function (aCtx) {
                    if (aCtx.length) {
                        var o = aCtx[0].getObject();
                        var dm = that.getView().getModel("dashboard");
                        dm.setProperty("/kpi/uploaded", String(o.totalUploaded || 0));
                        dm.setProperty("/kpi/approved", String(o.totalApproved || 0));
                        dm.setProperty("/kpi/rejected",
                            (o.totalRejected > 0) ? String(o.totalRejected) : "-");
                    }
                    resolve();
                }).catch(reject);

                // Onboarded (separate view)
                oModel.bindList("/OnboardedCount").requestContexts(0, 1).then(function (aCtx) {
                    if (aCtx.length) {
                        var o = aCtx[0].getObject();
                        that.getView().getModel("dashboard")
                            .setProperty("/kpi/onboarded", String(o.totalOnboarded || 0));
                    }
                }).catch(console.error);
            });
        },

        // ── Fetch module breakdown ────────────────────────────────
        _fetchModuleStats: function (oModel) {
            var that = this;
            return new Promise(function (resolve, reject) {
                oModel.bindList("/ModuleStats").requestContexts(0, 100).then(function (aCtx) {
                    var aModule = aCtx.map(function (c) {
                        var o = c.getObject();
                        return {
                            module:   o.moduleName,
                            approved: o.approved || 0,
                            pending:  o.pending  || 0,
                            uploaded: o.uploaded || 0
                        };
                    });
                    var aPie = aModule.map(function (m) {
                        return { module: m.module, count: m.approved + m.pending + m.uploaded };
                    });
                    var dm = that.getView().getModel("dashboard");
                    dm.setProperty("/moduleData", aModule);
                    dm.setProperty("/pieData",    aPie);
                    resolve();
                }).catch(reject);
            });
        },

        // ── Fetch Top 3 usage stats ───────────────────────────────
        _fetchUsageStats: function (oModel) {
            var that = this;
            return new Promise(function (resolve, reject) {
                oModel.bindList("/UsageStats", undefined, undefined, undefined, {
                    $orderby: "usageCount desc"
                }).requestContexts(0, 100).then(function (aCtx) {
                    var aAll = aCtx.map(function (c) { return c.getObject(); });

                    var fnTop3 = function (period) {
                        return aAll
                            .filter(function (r) { return r.period === period; })
                            .sort(function (a, b) { return b.usageCount - a.usageCount; })
                            .slice(0, 3)
                            .map(function (r) {
                                return { template: r.moduleName, usage: r.usageCount };
                            });
                    };

                    var dm = that.getView().getModel("dashboard");
                    dm.setProperty("/topMonthData",   fnTop3("MONTH"));
                    dm.setProperty("/topQuarterData", fnTop3("QUARTER"));
                    dm.setProperty("/topYearData",    fnTop3("YEAR"));
                    resolve();
                }).catch(reject);
            });
        },

        // ── Fetch load details table ──────────────────────────────
        _fetchTableData: function (oModel) {
            var that = this;
            return new Promise(function (resolve, reject) {
                oModel.bindList("/LoadDetails", undefined, undefined, undefined, {
                    $orderby: "loadDate desc"
                }).requestContexts(0, 50).then(function (aCtx) {
                    var aRows = aCtx.map(function (c) {
                        var o = c.getObject();
                        return {
                            moduleName:    o.moduleName    || "",
                            subModuleName: o.subModuleName || "",
                            loadType:      o.loadType      || "",
                            loadTemplate:  o.loadTemplate  || "",
                            loadCount:     o.loadCount ? o.loadCount.toLocaleString() : ""
                        };
                    });
                    that.getView().getModel("dashboard").setProperty("/tableData", aRows);
                    resolve();
                }).catch(reject);
            });
        },

        // ── Manual refresh handler ────────────────────────────────
        onRefresh: function () {
            MessageToast.show("Refreshing from HANA...");
            this._loadDashboardData();
        },

        // ── Chart setup ───────────────────────────────────────────
        _configureCharts: function () {
            this._setupModuleChart();
            this._setupPieChart();
            this._setupColumnChart("monthChart",   "topMonthData",   ["#2196a8", "#4db8a4", "#7ec8c8"]);
            this._setupColumnChart("quarterChart", "topQuarterData", ["#1f3d7a", "#4db8a4", "#7ec8c8"]);
            this._setupColumnChart("yearChart",    "topYearData",    ["#4db8a4", "#2196a8", "#1f3d7a"]);
        },

        _setupModuleChart: function () {
            var oChart = this.byId("moduleBarChart");
            if (!oChart) { return; }
            oChart.destroyFeeds();
            oChart.setVizType("column");
            oChart.setVizProperties({
                legend:       { visible: false },
                categoryAxis: { title: { visible: false } },
                valueAxis:    { title: { visible: false } },
                title:        { visible: false },
                plotArea: {
                    colorPalette: ["#1f3d7a", "#4db8a4", "#7ec8a0"],
                    dataLabel: { visible: true, formatString: "#", hideWhenOverlap: true }
                }
            });
            oChart.setDataset(new FlattenedDataset({
                dimensions: [{ name: "Module",   value: "{dashboard>module}"   }],
                measures:   [
                    { name: "Approved", value: "{dashboard>approved}" },
                    { name: "Pending",  value: "{dashboard>pending}"  },
                    { name: "Uploaded", value: "{dashboard>uploaded}" }
                ],
                data: { path: "dashboard>/moduleData" }
            }));
            oChart.addFeed(new FeedItem({ uid: "valueAxis",    type: "Measure",   values: ["Approved", "Pending", "Uploaded"] }));
            oChart.addFeed(new FeedItem({ uid: "categoryAxis", type: "Dimension", values: ["Module"] }));
        },

        _setupPieChart: function () {
            var oChart = this.byId("pieChart");
            if (!oChart) { return; }
            oChart.destroyFeeds();
            oChart.setVizProperties({
                legend: { visible: false },
                title:  { visible: false },
                plotArea: {
                    colorPalette: ["#2196a8", "#4db8a4", "#7ec8c8", "#1a5276", "#34495e"],
                    dataLabel: { visible: true, type: "percentage" }
                }
            });
            oChart.setDataset(new FlattenedDataset({
                dimensions: [{ name: "Module", value: "{dashboard>module}" }],
                measures:   [{ name: "Count",  value: "{dashboard>count}"  }],
                data: { path: "dashboard>/pieData" }
            }));
            oChart.addFeed(new FeedItem({ uid: "size",  type: "Measure",   values: ["Count"]  }));
            oChart.addFeed(new FeedItem({ uid: "color", type: "Dimension", values: ["Module"] }));
        },

        _setupColumnChart: function (sId, sDataPath, aColors) {
            var oChart = this.byId(sId);
            if (!oChart) { return; }
            oChart.destroyFeeds();
            oChart.setVizType("column");
            oChart.setVizProperties({
                legend:       { visible: false },
                categoryAxis: { title: { visible: false } },
                valueAxis:    { title: { visible: false } },
                title:        { visible: false },
                plotArea: { colorPalette: aColors, dataLabel: { visible: true } }
            });
            oChart.setDataset(new FlattenedDataset({
                dimensions: [{ name: "Template", value: "{dashboard>template}" }],
                measures:   [{ name: "Usage",    value: "{dashboard>usage}"    }],
                data: { path: "dashboard>/" + sDataPath }
            }));
            oChart.addFeed(new FeedItem({ uid: "valueAxis",    type: "Measure",   values: ["Usage"]    }));
            oChart.addFeed(new FeedItem({ uid: "categoryAxis", type: "Dimension", values: ["Template"] }));
        }
    });
});
