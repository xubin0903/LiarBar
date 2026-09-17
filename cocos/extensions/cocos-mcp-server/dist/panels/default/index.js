"use strict";
/* eslint-disable vue/one-component-per-file */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const vue_1 = require("vue");
const logger_1 = require("../../logger");
const panelDataMap = new WeakMap();
const CATEGORY_DISPLAY_NAMES = {
    scene: 'Scene Tools',
    node: 'Node Tools',
    component: 'Component Tools',
    prefab: 'Prefab Tools',
    project: 'Project Tools',
    debug: 'Debug Tools',
    preferences: 'Preferences Tools',
    server: 'Server Tools',
    broadcast: 'Broadcast Tools',
    sceneAdvanced: 'Advanced Scene Tools',
    sceneView: 'Scene View Tools',
    referenceImage: 'Reference Image Tools',
    assetAdvanced: 'Advanced Asset Tools',
    validation: 'Validation Tools'
};
module.exports = Editor.Panel.define({
    listeners: {
        show() { },
        hide() { },
    },
    template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
        panelTitle: '#panelTitle',
    },
    ready() {
        if (!this.$.app)
            return;
        const app = (0, vue_1.createApp)({});
        app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
        app.component('McpServerApp', (0, vue_1.defineComponent)({
            setup() {
                const activeTab = (0, vue_1.ref)('server');
                const serverRunning = (0, vue_1.ref)(false);
                const serverStatusText = (0, vue_1.ref)('Stopped');
                const connectedClients = (0, vue_1.ref)(0);
                const httpUrl = (0, vue_1.ref)('');
                const isProcessing = (0, vue_1.ref)(false);
                const settingsChanged = (0, vue_1.ref)(false);
                const settings = (0, vue_1.ref)({
                    port: 3000,
                    autoStart: false,
                    debugLog: false,
                    maxConnections: 10,
                    maxSessions: 10,
                    sessionIdleTimeoutMs: 30 * 60 * 1000,
                    authToken: '',
                    allowedOrigins: '',
                    requestBodyLimitBytes: 1024 * 1024,
                    toolExecutionTimeoutMs: 30000,
                    enableRestApi: false
                });
                const availableTools = (0, vue_1.ref)([]);
                const toolCategories = (0, vue_1.ref)([]);
                const statusClass = (0, vue_1.computed)(() => ({
                    running: serverRunning.value,
                    stopped: !serverRunning.value
                }));
                const totalTools = (0, vue_1.computed)(() => availableTools.value.length);
                const enabledToolCount = (0, vue_1.computed)(() => availableTools.value.filter(t => t.enabled).length);
                const disabledToolCount = (0, vue_1.computed)(() => totalTools.value - enabledToolCount.value);
                const switchTab = (tabName) => {
                    activeTab.value = tabName;
                    if (tabName === 'tools') {
                        loadToolManagerState();
                    }
                };
                const applyServerStatus = (status) => {
                    var _a;
                    if (!status)
                        return;
                    serverRunning.value = Boolean(status.running);
                    serverStatusText.value = status.running ? 'Running' : 'Stopped';
                    connectedClients.value = (_a = status.clients) !== null && _a !== void 0 ? _a : 0;
                    httpUrl.value = status.running
                        ? `http://127.0.0.1:${status.port}/mcp`
                        : '';
                };
                const refreshServerStatus = async () => {
                    const status = await Editor.Message.request('cocos-mcp-server', 'get-server-status');
                    applyServerStatus(status);
                    return status;
                };
                const toggleServer = async () => {
                    if (isProcessing.value)
                        return;
                    isProcessing.value = true;
                    try {
                        if (serverRunning.value) {
                            await Editor.Message.request('cocos-mcp-server', 'stop-server');
                        }
                        else {
                            const currentSettings = {
                                port: settings.value.port,
                                autoStart: settings.value.autoStart,
                                enableDebugLog: settings.value.debugLog,
                                maxConnections: settings.value.maxConnections,
                                maxSessions: settings.value.maxSessions,
                                sessionIdleTimeoutMs: settings.value.sessionIdleTimeoutMs,
                                authToken: settings.value.authToken,
                                allowedOrigins: parseAllowedOrigins(settings.value.allowedOrigins),
                                requestBodyLimitBytes: settings.value.requestBodyLimitBytes,
                                toolExecutionTimeoutMs: settings.value.toolExecutionTimeoutMs,
                                enableRestApi: settings.value.enableRestApi
                            };
                            await Editor.Message.request('cocos-mcp-server', 'update-settings', currentSettings);
                            await Editor.Message.request('cocos-mcp-server', 'start-server');
                        }
                        await refreshServerStatus();
                    }
                    catch (error) {
                        (0, logger_1.errorLog)('MCP Panel', 'Failed to toggle server', error);
                    }
                    finally {
                        isProcessing.value = false;
                    }
                };
                const saveSettings = async () => {
                    if (isProcessing.value)
                        return;
                    isProcessing.value = true;
                    try {
                        const settingsData = {
                            port: settings.value.port,
                            autoStart: settings.value.autoStart,
                            enableDebugLog: settings.value.debugLog,
                            maxConnections: settings.value.maxConnections,
                            maxSessions: settings.value.maxSessions,
                            sessionIdleTimeoutMs: settings.value.sessionIdleTimeoutMs,
                            authToken: settings.value.authToken,
                            allowedOrigins: parseAllowedOrigins(settings.value.allowedOrigins),
                            requestBodyLimitBytes: settings.value.requestBodyLimitBytes,
                            toolExecutionTimeoutMs: settings.value.toolExecutionTimeoutMs,
                            enableRestApi: settings.value.enableRestApi
                        };
                        await Editor.Message.request('cocos-mcp-server', 'update-settings', settingsData);
                        await refreshServerStatus();
                        settingsChanged.value = false;
                    }
                    catch (error) {
                        (0, logger_1.errorLog)('MCP Panel', 'Failed to save settings', error);
                    }
                    finally {
                        isProcessing.value = false;
                    }
                };
                const copyUrl = async () => {
                    try {
                        await navigator.clipboard.writeText(httpUrl.value);
                    }
                    catch (error) {
                        (0, logger_1.errorLog)('MCP Panel', 'Failed to copy URL', error);
                    }
                };
                const copyToken = async () => {
                    try {
                        await navigator.clipboard.writeText(settings.value.authToken);
                    }
                    catch (error) {
                        (0, logger_1.errorLog)('MCP Panel', 'Failed to copy auth token', error);
                    }
                };
                const parseAllowedOrigins = (value) => {
                    return value
                        .split(',')
                        .map(origin => origin.trim())
                        .filter(Boolean);
                };
                const loadToolManagerState = async () => {
                    var _a;
                    try {
                        const result = await Editor.Message.request('cocos-mcp-server', 'getToolManagerState');
                        if (result === null || result === void 0 ? void 0 : result.success) {
                            availableTools.value = (_a = result.availableTools) !== null && _a !== void 0 ? _a : [];
                            const categories = new Set(availableTools.value.map(t => t.category));
                            toolCategories.value = Array.from(categories);
                        }
                    }
                    catch (error) {
                        (0, logger_1.errorLog)('MCP Panel', 'Failed to load tool manager state', error);
                    }
                };
                const updateToolStatus = async (category, name, enabled) => {
                    // Optimistic update
                    const toolIndex = availableTools.value.findIndex(t => t.category === category && t.name === name);
                    if (toolIndex !== -1) {
                        availableTools.value[toolIndex].enabled = enabled;
                        availableTools.value = [...availableTools.value];
                    }
                    try {
                        const result = await Editor.Message.request('cocos-mcp-server', 'updateToolStatus', category, name, enabled);
                        if (!(result === null || result === void 0 ? void 0 : result.success) && toolIndex !== -1) {
                            // Roll back on failure
                            availableTools.value[toolIndex].enabled = !enabled;
                            availableTools.value = [...availableTools.value];
                        }
                    }
                    catch (error) {
                        // Roll back on error
                        if (toolIndex !== -1) {
                            availableTools.value[toolIndex].enabled = !enabled;
                            availableTools.value = [...availableTools.value];
                        }
                        (0, logger_1.errorLog)('MCP Panel', 'Failed to update tool status', error);
                    }
                };
                const saveChanges = async () => {
                    try {
                        const updates = availableTools.value.map(tool => ({
                            category: String(tool.category),
                            name: String(tool.name),
                            enabled: Boolean(tool.enabled)
                        }));
                        await Editor.Message.request('cocos-mcp-server', 'updateToolStatusBatch', updates);
                    }
                    catch (error) {
                        (0, logger_1.errorLog)('MCP Panel', 'Failed to save tool changes', error);
                    }
                };
                const selectAllTools = async () => {
                    availableTools.value.forEach(t => { t.enabled = true; });
                    await saveChanges();
                };
                const deselectAllTools = async () => {
                    availableTools.value.forEach(t => { t.enabled = false; });
                    await saveChanges();
                };
                const toggleCategoryTools = async (category, enabled) => {
                    availableTools.value.forEach(t => {
                        if (t.category === category)
                            t.enabled = enabled;
                    });
                    await saveChanges();
                };
                const getToolsByCategory = (category) => {
                    return availableTools.value.filter(t => t.category === category);
                };
                const getCategoryDisplayName = (category) => {
                    var _a;
                    return (_a = CATEGORY_DISPLAY_NAMES[category]) !== null && _a !== void 0 ? _a : category;
                };
                (0, vue_1.watch)(settings, () => { settingsChanged.value = true; }, { deep: true, flush: 'sync' });
                let statusPollTimer;
                (0, vue_1.onMounted)(async () => {
                    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
                    await loadToolManagerState();
                    try {
                        const status = await refreshServerStatus();
                        if (status === null || status === void 0 ? void 0 : status.settings) {
                            settings.value = {
                                port: (_a = status.settings.port) !== null && _a !== void 0 ? _a : 3000,
                                autoStart: (_b = status.settings.autoStart) !== null && _b !== void 0 ? _b : false,
                                debugLog: (_c = status.settings.enableDebugLog) !== null && _c !== void 0 ? _c : false,
                                maxConnections: (_d = status.settings.maxConnections) !== null && _d !== void 0 ? _d : 10,
                                maxSessions: (_e = status.settings.maxSessions) !== null && _e !== void 0 ? _e : 10,
                                sessionIdleTimeoutMs: (_f = status.settings.sessionIdleTimeoutMs) !== null && _f !== void 0 ? _f : 30 * 60 * 1000,
                                authToken: (_g = status.settings.authToken) !== null && _g !== void 0 ? _g : '',
                                allowedOrigins: ((_h = status.settings.allowedOrigins) !== null && _h !== void 0 ? _h : []).join(', '),
                                requestBodyLimitBytes: (_j = status.settings.requestBodyLimitBytes) !== null && _j !== void 0 ? _j : 1024 * 1024,
                                toolExecutionTimeoutMs: (_k = status.settings.toolExecutionTimeoutMs) !== null && _k !== void 0 ? _k : 30000,
                                enableRestApi: (_l = status.settings.enableRestApi) !== null && _l !== void 0 ? _l : false
                            };
                            settingsChanged.value = false;
                        }
                    }
                    catch (error) {
                        (0, logger_1.errorLog)('MCP Panel', 'Failed to load server settings', error);
                    }
                    statusPollTimer = setInterval(async () => {
                        try {
                            await refreshServerStatus();
                        }
                        catch (error) {
                            (0, logger_1.errorLog)('MCP Panel', 'Failed to poll server status', error);
                        }
                    }, 2000);
                });
                (0, vue_1.onUnmounted)(() => {
                    if (statusPollTimer)
                        clearInterval(statusPollTimer);
                });
                return {
                    activeTab,
                    serverRunning,
                    serverStatusText,
                    connectedClients,
                    httpUrl,
                    isProcessing,
                    settings,
                    availableTools,
                    toolCategories,
                    settingsChanged,
                    statusClass,
                    totalTools,
                    enabledToolCount,
                    disabledToolCount,
                    switchTab,
                    toggleServer,
                    saveSettings,
                    copyUrl,
                    copyToken,
                    loadToolManagerState,
                    updateToolStatus,
                    selectAllTools,
                    deselectAllTools,
                    saveChanges,
                    toggleCategoryTools,
                    getToolsByCategory,
                    getCategoryDisplayName
                };
            },
            template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/vue/mcp-server-app.html'), 'utf-8'),
        }));
        app.mount(this.$.app);
        panelDataMap.set(this, app);
    },
    beforeClose() { },
    close() {
        var _a;
        (_a = panelDataMap.get(this)) === null || _a === void 0 ? void 0 : _a.unmount();
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zb3VyY2UvcGFuZWxzL2RlZmF1bHQvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLCtDQUErQzs7QUFFL0MsdUNBQXdDO0FBQ3hDLCtCQUE0QjtBQUM1Qiw2QkFTYTtBQUNiLHlDQUF3QztBQUV4QyxNQUFNLFlBQVksR0FBRyxJQUFJLE9BQU8sRUFBWSxDQUFDO0FBdUI3QyxNQUFNLHNCQUFzQixHQUEyQjtJQUNuRCxLQUFLLEVBQUUsYUFBYTtJQUNwQixJQUFJLEVBQUUsWUFBWTtJQUNsQixTQUFTLEVBQUUsaUJBQWlCO0lBQzVCLE1BQU0sRUFBRSxjQUFjO0lBQ3RCLE9BQU8sRUFBRSxlQUFlO0lBQ3hCLEtBQUssRUFBRSxhQUFhO0lBQ3BCLFdBQVcsRUFBRSxtQkFBbUI7SUFDaEMsTUFBTSxFQUFFLGNBQWM7SUFDdEIsU0FBUyxFQUFFLGlCQUFpQjtJQUM1QixhQUFhLEVBQUUsc0JBQXNCO0lBQ3JDLFNBQVMsRUFBRSxrQkFBa0I7SUFDN0IsY0FBYyxFQUFFLHVCQUF1QjtJQUN2QyxhQUFhLEVBQUUsc0JBQXNCO0lBQ3JDLFVBQVUsRUFBRSxrQkFBa0I7Q0FDakMsQ0FBQztBQUVGLE1BQU0sQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUM7SUFDakMsU0FBUyxFQUFFO1FBQ1AsSUFBSSxLQUFLLENBQUM7UUFDVixJQUFJLEtBQUssQ0FBQztLQUNiO0lBQ0QsUUFBUSxFQUFFLElBQUEsdUJBQVksRUFBQyxJQUFBLFdBQUksRUFBQyxTQUFTLEVBQUUsNkNBQTZDLENBQUMsRUFBRSxPQUFPLENBQUM7SUFDL0YsS0FBSyxFQUFFLElBQUEsdUJBQVksRUFBQyxJQUFBLFdBQUksRUFBQyxTQUFTLEVBQUUseUNBQXlDLENBQUMsRUFBRSxPQUFPLENBQUM7SUFDeEYsQ0FBQyxFQUFFO1FBQ0MsR0FBRyxFQUFFLE1BQU07UUFDWCxVQUFVLEVBQUUsYUFBYTtLQUM1QjtJQUNELEtBQUs7UUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHO1lBQUUsT0FBTztRQUV4QixNQUFNLEdBQUcsR0FBRyxJQUFBLGVBQVMsRUFBQyxFQUFFLENBQUMsQ0FBQztRQUMxQixHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFNUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUUsSUFBQSxxQkFBZSxFQUFDO1lBQzFDLEtBQUs7Z0JBQ0QsTUFBTSxTQUFTLEdBQUcsSUFBQSxTQUFHLEVBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ2hDLE1BQU0sYUFBYSxHQUFHLElBQUEsU0FBRyxFQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNqQyxNQUFNLGdCQUFnQixHQUFHLElBQUEsU0FBRyxFQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN4QyxNQUFNLGdCQUFnQixHQUFHLElBQUEsU0FBRyxFQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNoQyxNQUFNLE9BQU8sR0FBRyxJQUFBLFNBQUcsRUFBQyxFQUFFLENBQUMsQ0FBQztnQkFDeEIsTUFBTSxZQUFZLEdBQUcsSUFBQSxTQUFHLEVBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2hDLE1BQU0sZUFBZSxHQUFHLElBQUEsU0FBRyxFQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUVuQyxNQUFNLFFBQVEsR0FBRyxJQUFBLFNBQUcsRUFBaUI7b0JBQ2pDLElBQUksRUFBRSxJQUFJO29CQUNWLFNBQVMsRUFBRSxLQUFLO29CQUNoQixRQUFRLEVBQUUsS0FBSztvQkFDZixjQUFjLEVBQUUsRUFBRTtvQkFDbEIsV0FBVyxFQUFFLEVBQUU7b0JBQ2Ysb0JBQW9CLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJO29CQUNwQyxTQUFTLEVBQUUsRUFBRTtvQkFDYixjQUFjLEVBQUUsRUFBRTtvQkFDbEIscUJBQXFCLEVBQUUsSUFBSSxHQUFHLElBQUk7b0JBQ2xDLHNCQUFzQixFQUFFLEtBQUs7b0JBQzdCLGFBQWEsRUFBRSxLQUFLO2lCQUN2QixDQUFDLENBQUM7Z0JBRUgsTUFBTSxjQUFjLEdBQUcsSUFBQSxTQUFHLEVBQWUsRUFBRSxDQUFDLENBQUM7Z0JBQzdDLE1BQU0sY0FBYyxHQUFHLElBQUEsU0FBRyxFQUFXLEVBQUUsQ0FBQyxDQUFDO2dCQUV6QyxNQUFNLFdBQVcsR0FBRyxJQUFBLGNBQVEsRUFBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO29CQUNoQyxPQUFPLEVBQUUsYUFBYSxDQUFDLEtBQUs7b0JBQzVCLE9BQU8sRUFBRSxDQUFDLGFBQWEsQ0FBQyxLQUFLO2lCQUNoQyxDQUFDLENBQUMsQ0FBQztnQkFFSixNQUFNLFVBQVUsR0FBRyxJQUFBLGNBQVEsRUFBQyxHQUFHLEVBQUUsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMvRCxNQUFNLGdCQUFnQixHQUFHLElBQUEsY0FBUSxFQUFDLEdBQUcsRUFBRSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUM1RixNQUFNLGlCQUFpQixHQUFHLElBQUEsY0FBUSxFQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBRXBGLE1BQU0sU0FBUyxHQUFHLENBQUMsT0FBZSxFQUFFLEVBQUU7b0JBQ2xDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDO29CQUMxQixJQUFJLE9BQU8sS0FBSyxPQUFPLEVBQUUsQ0FBQzt3QkFDdEIsb0JBQW9CLEVBQUUsQ0FBQztvQkFDM0IsQ0FBQztnQkFDTCxDQUFDLENBQUM7Z0JBRUYsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLE1BQVcsRUFBRSxFQUFFOztvQkFDdEMsSUFBSSxDQUFDLE1BQU07d0JBQUUsT0FBTztvQkFDcEIsYUFBYSxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUM5QyxnQkFBZ0IsQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7b0JBQ2hFLGdCQUFnQixDQUFDLEtBQUssR0FBRyxNQUFBLE1BQU0sQ0FBQyxPQUFPLG1DQUFJLENBQUMsQ0FBQztvQkFDN0MsT0FBTyxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsT0FBTzt3QkFDMUIsQ0FBQyxDQUFDLG9CQUFvQixNQUFNLENBQUMsSUFBSSxNQUFNO3dCQUN2QyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNiLENBQUMsQ0FBQztnQkFFRixNQUFNLG1CQUFtQixHQUFHLEtBQUssSUFBSSxFQUFFO29CQUNuQyxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUN2QyxrQkFBa0IsRUFDbEIsbUJBQW1CLENBQ3RCLENBQUM7b0JBQ0YsaUJBQWlCLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQzFCLE9BQU8sTUFBTSxDQUFDO2dCQUNsQixDQUFDLENBQUM7Z0JBRUYsTUFBTSxZQUFZLEdBQUcsS0FBSyxJQUFJLEVBQUU7b0JBQzVCLElBQUksWUFBWSxDQUFDLEtBQUs7d0JBQUUsT0FBTztvQkFDL0IsWUFBWSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7b0JBQzFCLElBQUksQ0FBQzt3QkFDRCxJQUFJLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQzs0QkFDdEIsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxhQUFhLENBQUMsQ0FBQzt3QkFDcEUsQ0FBQzs2QkFBTSxDQUFDOzRCQUNKLE1BQU0sZUFBZSxHQUFHO2dDQUNwQixJQUFJLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJO2dDQUN6QixTQUFTLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxTQUFTO2dDQUNuQyxjQUFjLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxRQUFRO2dDQUN2QyxjQUFjLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxjQUFjO2dDQUM3QyxXQUFXLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxXQUFXO2dDQUN2QyxvQkFBb0IsRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLG9CQUFvQjtnQ0FDekQsU0FBUyxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsU0FBUztnQ0FDbkMsY0FBYyxFQUFFLG1CQUFtQixDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDO2dDQUNsRSxxQkFBcUIsRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLHFCQUFxQjtnQ0FDM0Qsc0JBQXNCLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxzQkFBc0I7Z0NBQzdELGFBQWEsRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLGFBQWE7NkJBQzlDLENBQUM7NEJBQ0YsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxpQkFBaUIsRUFBRSxlQUFlLENBQUMsQ0FBQzs0QkFDckYsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxjQUFjLENBQUMsQ0FBQzt3QkFDckUsQ0FBQzt3QkFDRCxNQUFNLG1CQUFtQixFQUFFLENBQUM7b0JBQ2hDLENBQUM7b0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzt3QkFDYixJQUFBLGlCQUFRLEVBQUMsV0FBVyxFQUFFLHlCQUF5QixFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUM1RCxDQUFDOzRCQUFTLENBQUM7d0JBQ1AsWUFBWSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7b0JBQy9CLENBQUM7Z0JBQ0wsQ0FBQyxDQUFDO2dCQUVGLE1BQU0sWUFBWSxHQUFHLEtBQUssSUFBSSxFQUFFO29CQUM1QixJQUFJLFlBQVksQ0FBQyxLQUFLO3dCQUFFLE9BQU87b0JBQy9CLFlBQVksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO29CQUMxQixJQUFJLENBQUM7d0JBQ0QsTUFBTSxZQUFZLEdBQUc7NEJBQ2pCLElBQUksRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUk7NEJBQ3pCLFNBQVMsRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLFNBQVM7NEJBQ25DLGNBQWMsRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVE7NEJBQ3ZDLGNBQWMsRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLGNBQWM7NEJBQzdDLFdBQVcsRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLFdBQVc7NEJBQ3ZDLG9CQUFvQixFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsb0JBQW9COzRCQUN6RCxTQUFTLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxTQUFTOzRCQUNuQyxjQUFjLEVBQUUsbUJBQW1CLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUM7NEJBQ2xFLHFCQUFxQixFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMscUJBQXFCOzRCQUMzRCxzQkFBc0IsRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLHNCQUFzQjs0QkFDN0QsYUFBYSxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsYUFBYTt5QkFDOUMsQ0FBQzt3QkFDRixNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFLGlCQUFpQixFQUFFLFlBQVksQ0FBQyxDQUFDO3dCQUNsRixNQUFNLG1CQUFtQixFQUFFLENBQUM7d0JBQzVCLGVBQWUsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO29CQUNsQyxDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2IsSUFBQSxpQkFBUSxFQUFDLFdBQVcsRUFBRSx5QkFBeUIsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDNUQsQ0FBQzs0QkFBUyxDQUFDO3dCQUNQLFlBQVksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO29CQUMvQixDQUFDO2dCQUNMLENBQUMsQ0FBQztnQkFFRixNQUFNLE9BQU8sR0FBRyxLQUFLLElBQUksRUFBRTtvQkFDdkIsSUFBSSxDQUFDO3dCQUNELE1BQU0sU0FBUyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUN2RCxDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2IsSUFBQSxpQkFBUSxFQUFDLFdBQVcsRUFBRSxvQkFBb0IsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDdkQsQ0FBQztnQkFDTCxDQUFDLENBQUM7Z0JBRUYsTUFBTSxTQUFTLEdBQUcsS0FBSyxJQUFJLEVBQUU7b0JBQ3pCLElBQUksQ0FBQzt3QkFDRCxNQUFNLFNBQVMsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQ2xFLENBQUM7b0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzt3QkFDYixJQUFBLGlCQUFRLEVBQUMsV0FBVyxFQUFFLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUM5RCxDQUFDO2dCQUNMLENBQUMsQ0FBQztnQkFFRixNQUFNLG1CQUFtQixHQUFHLENBQUMsS0FBYSxFQUFZLEVBQUU7b0JBQ3BELE9BQU8sS0FBSzt5QkFDUCxLQUFLLENBQUMsR0FBRyxDQUFDO3lCQUNWLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQzt5QkFDNUIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN6QixDQUFDLENBQUM7Z0JBRUYsTUFBTSxvQkFBb0IsR0FBRyxLQUFLLElBQUksRUFBRTs7b0JBQ3BDLElBQUksQ0FBQzt3QkFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFLHFCQUFxQixDQUFDLENBQUM7d0JBQ3ZGLElBQUksTUFBTSxhQUFOLE1BQU0sdUJBQU4sTUFBTSxDQUFFLE9BQU8sRUFBRSxDQUFDOzRCQUNsQixjQUFjLENBQUMsS0FBSyxHQUFHLE1BQUEsTUFBTSxDQUFDLGNBQWMsbUNBQUksRUFBRSxDQUFDOzRCQUNuRCxNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDOzRCQUN0RSxjQUFjLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7d0JBQ2xELENBQUM7b0JBQ0wsQ0FBQztvQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO3dCQUNiLElBQUEsaUJBQVEsRUFBQyxXQUFXLEVBQUUsbUNBQW1DLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQ3RFLENBQUM7Z0JBQ0wsQ0FBQyxDQUFDO2dCQUVGLE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxFQUFFLFFBQWdCLEVBQUUsSUFBWSxFQUFFLE9BQWdCLEVBQUUsRUFBRTtvQkFDaEYsb0JBQW9CO29CQUNwQixNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEtBQUssUUFBUSxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUM7b0JBQ2xHLElBQUksU0FBUyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQ25CLGNBQWMsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQzt3QkFDbEQsY0FBYyxDQUFDLEtBQUssR0FBRyxDQUFDLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUNyRCxDQUFDO29CQUNELElBQUksQ0FBQzt3QkFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7d0JBQzdHLElBQUksQ0FBQyxDQUFBLE1BQU0sYUFBTixNQUFNLHVCQUFOLE1BQU0sQ0FBRSxPQUFPLENBQUEsSUFBSSxTQUFTLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQzs0QkFDdkMsdUJBQXVCOzRCQUN2QixjQUFjLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLE9BQU8sQ0FBQzs0QkFDbkQsY0FBYyxDQUFDLEtBQUssR0FBRyxDQUFDLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO3dCQUNyRCxDQUFDO29CQUNMLENBQUM7b0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzt3QkFDYixxQkFBcUI7d0JBQ3JCLElBQUksU0FBUyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7NEJBQ25CLGNBQWMsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsT0FBTyxDQUFDOzRCQUNuRCxjQUFjLENBQUMsS0FBSyxHQUFHLENBQUMsR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQ3JELENBQUM7d0JBQ0QsSUFBQSxpQkFBUSxFQUFDLFdBQVcsRUFBRSw4QkFBOEIsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDakUsQ0FBQztnQkFDTCxDQUFDLENBQUM7Z0JBRUYsTUFBTSxXQUFXLEdBQUcsS0FBSyxJQUFJLEVBQUU7b0JBQzNCLElBQUksQ0FBQzt3QkFDRCxNQUFNLE9BQU8sR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7NEJBQzlDLFFBQVEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQzs0QkFDL0IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDOzRCQUN2QixPQUFPLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7eUJBQ2pDLENBQUMsQ0FBQyxDQUFDO3dCQUNKLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsdUJBQXVCLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQ3ZGLENBQUM7b0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzt3QkFDYixJQUFBLGlCQUFRLEVBQUMsV0FBVyxFQUFFLDZCQUE2QixFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUNoRSxDQUFDO2dCQUNMLENBQUMsQ0FBQztnQkFFRixNQUFNLGNBQWMsR0FBRyxLQUFLLElBQUksRUFBRTtvQkFDOUIsY0FBYyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN6RCxNQUFNLFdBQVcsRUFBRSxDQUFDO2dCQUN4QixDQUFDLENBQUM7Z0JBRUYsTUFBTSxnQkFBZ0IsR0FBRyxLQUFLLElBQUksRUFBRTtvQkFDaEMsY0FBYyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMxRCxNQUFNLFdBQVcsRUFBRSxDQUFDO2dCQUN4QixDQUFDLENBQUM7Z0JBRUYsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLEVBQUUsUUFBZ0IsRUFBRSxPQUFnQixFQUFFLEVBQUU7b0JBQ3JFLGNBQWMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFO3dCQUM3QixJQUFJLENBQUMsQ0FBQyxRQUFRLEtBQUssUUFBUTs0QkFBRSxDQUFDLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztvQkFDckQsQ0FBQyxDQUFDLENBQUM7b0JBQ0gsTUFBTSxXQUFXLEVBQUUsQ0FBQztnQkFDeEIsQ0FBQyxDQUFDO2dCQUVGLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxRQUFnQixFQUFFLEVBQUU7b0JBQzVDLE9BQU8sY0FBYyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxDQUFDO2dCQUNyRSxDQUFDLENBQUM7Z0JBRUYsTUFBTSxzQkFBc0IsR0FBRyxDQUFDLFFBQWdCLEVBQVUsRUFBRTs7b0JBQ3hELE9BQU8sTUFBQSxzQkFBc0IsQ0FBQyxRQUFRLENBQUMsbUNBQUksUUFBUSxDQUFDO2dCQUN4RCxDQUFDLENBQUM7Z0JBRUYsSUFBQSxXQUFLLEVBQ0QsUUFBUSxFQUNSLEdBQUcsRUFBRSxHQUFHLGVBQWUsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUN2QyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUNoQyxDQUFDO2dCQUVGLElBQUksZUFBMkQsQ0FBQztnQkFFaEUsSUFBQSxlQUFTLEVBQUMsS0FBSyxJQUFJLEVBQUU7O29CQUNqQixNQUFNLG9CQUFvQixFQUFFLENBQUM7b0JBRTdCLElBQUksQ0FBQzt3QkFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLG1CQUFtQixFQUFFLENBQUM7d0JBQzNDLElBQUksTUFBTSxhQUFOLE1BQU0sdUJBQU4sTUFBTSxDQUFFLFFBQVEsRUFBRSxDQUFDOzRCQUNuQixRQUFRLENBQUMsS0FBSyxHQUFHO2dDQUNiLElBQUksRUFBRSxNQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxtQ0FBSSxJQUFJO2dDQUNsQyxTQUFTLEVBQUUsTUFBQSxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQVMsbUNBQUksS0FBSztnQ0FDN0MsUUFBUSxFQUFFLE1BQUEsTUFBTSxDQUFDLFFBQVEsQ0FBQyxjQUFjLG1DQUFJLEtBQUs7Z0NBQ2pELGNBQWMsRUFBRSxNQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxtQ0FBSSxFQUFFO2dDQUNwRCxXQUFXLEVBQUUsTUFBQSxNQUFNLENBQUMsUUFBUSxDQUFDLFdBQVcsbUNBQUksRUFBRTtnQ0FDOUMsb0JBQW9CLEVBQUUsTUFBQSxNQUFNLENBQUMsUUFBUSxDQUFDLG9CQUFvQixtQ0FBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUk7Z0NBQzVFLFNBQVMsRUFBRSxNQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsU0FBUyxtQ0FBSSxFQUFFO2dDQUMxQyxjQUFjLEVBQUUsQ0FBQyxNQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxtQ0FBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO2dDQUNqRSxxQkFBcUIsRUFBRSxNQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMscUJBQXFCLG1DQUFJLElBQUksR0FBRyxJQUFJO2dDQUMzRSxzQkFBc0IsRUFBRSxNQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsc0JBQXNCLG1DQUFJLEtBQUs7Z0NBQ3ZFLGFBQWEsRUFBRSxNQUFBLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxtQ0FBSSxLQUFLOzZCQUN4RCxDQUFDOzRCQUNGLGVBQWUsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO3dCQUNsQyxDQUFDO29CQUNMLENBQUM7b0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzt3QkFDYixJQUFBLGlCQUFRLEVBQUMsV0FBVyxFQUFFLGdDQUFnQyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUNuRSxDQUFDO29CQUVELGVBQWUsR0FBRyxXQUFXLENBQUMsS0FBSyxJQUFJLEVBQUU7d0JBQ3JDLElBQUksQ0FBQzs0QkFDRCxNQUFNLG1CQUFtQixFQUFFLENBQUM7d0JBQ2hDLENBQUM7d0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzs0QkFDYixJQUFBLGlCQUFRLEVBQUMsV0FBVyxFQUFFLDhCQUE4QixFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUNqRSxDQUFDO29CQUNMLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDYixDQUFDLENBQUMsQ0FBQztnQkFFSCxJQUFBLGlCQUFXLEVBQUMsR0FBRyxFQUFFO29CQUNiLElBQUksZUFBZTt3QkFBRSxhQUFhLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ3hELENBQUMsQ0FBQyxDQUFDO2dCQUVILE9BQU87b0JBQ0gsU0FBUztvQkFDVCxhQUFhO29CQUNiLGdCQUFnQjtvQkFDaEIsZ0JBQWdCO29CQUNoQixPQUFPO29CQUNQLFlBQVk7b0JBQ1osUUFBUTtvQkFDUixjQUFjO29CQUNkLGNBQWM7b0JBQ2QsZUFBZTtvQkFDZixXQUFXO29CQUNYLFVBQVU7b0JBQ1YsZ0JBQWdCO29CQUNoQixpQkFBaUI7b0JBQ2pCLFNBQVM7b0JBQ1QsWUFBWTtvQkFDWixZQUFZO29CQUNaLE9BQU87b0JBQ1AsU0FBUztvQkFDVCxvQkFBb0I7b0JBQ3BCLGdCQUFnQjtvQkFDaEIsY0FBYztvQkFDZCxnQkFBZ0I7b0JBQ2hCLFdBQVc7b0JBQ1gsbUJBQW1CO29CQUNuQixrQkFBa0I7b0JBQ2xCLHNCQUFzQjtpQkFDekIsQ0FBQztZQUNOLENBQUM7WUFDRCxRQUFRLEVBQUUsSUFBQSx1QkFBWSxFQUFDLElBQUEsV0FBSSxFQUFDLFNBQVMsRUFBRSxrREFBa0QsQ0FBQyxFQUFFLE9BQU8sQ0FBQztTQUN2RyxDQUFDLENBQUMsQ0FBQztRQUVKLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0QixZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNoQyxDQUFDO0lBQ0QsV0FBVyxLQUFLLENBQUM7SUFDakIsS0FBSzs7UUFDRCxNQUFBLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDBDQUFFLE9BQU8sRUFBRSxDQUFDO0lBQ3RDLENBQUM7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSB2dWUvb25lLWNvbXBvbmVudC1wZXItZmlsZSAqL1xyXG5cclxuaW1wb3J0IHsgcmVhZEZpbGVTeW5jIH0gZnJvbSAnZnMtZXh0cmEnO1xyXG5pbXBvcnQgeyBqb2luIH0gZnJvbSAncGF0aCc7XHJcbmltcG9ydCB7XHJcbiAgICBjcmVhdGVBcHAsXHJcbiAgICBBcHAsXHJcbiAgICBkZWZpbmVDb21wb25lbnQsXHJcbiAgICByZWYsXHJcbiAgICBjb21wdXRlZCxcclxuICAgIG9uTW91bnRlZCxcclxuICAgIG9uVW5tb3VudGVkLFxyXG4gICAgd2F0Y2hcclxufSBmcm9tICd2dWUnO1xyXG5pbXBvcnQgeyBlcnJvckxvZyB9IGZyb20gJy4uLy4uL2xvZ2dlcic7XHJcblxyXG5jb25zdCBwYW5lbERhdGFNYXAgPSBuZXcgV2Vha01hcDxhbnksIEFwcD4oKTtcclxuXHJcbmludGVyZmFjZSBUb29sQ29uZmlnIHtcclxuICAgIGNhdGVnb3J5OiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBlbmFibGVkOiBib29sZWFuO1xyXG4gICAgZGVzY3JpcHRpb246IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFNlcnZlclNldHRpbmdzIHtcclxuICAgIHBvcnQ6IG51bWJlcjtcclxuICAgIGF1dG9TdGFydDogYm9vbGVhbjtcclxuICAgIGRlYnVnTG9nOiBib29sZWFuO1xyXG4gICAgbWF4Q29ubmVjdGlvbnM6IG51bWJlcjtcclxuICAgIG1heFNlc3Npb25zOiBudW1iZXI7XHJcbiAgICBzZXNzaW9uSWRsZVRpbWVvdXRNczogbnVtYmVyO1xyXG4gICAgYXV0aFRva2VuOiBzdHJpbmc7XHJcbiAgICBhbGxvd2VkT3JpZ2luczogc3RyaW5nO1xyXG4gICAgcmVxdWVzdEJvZHlMaW1pdEJ5dGVzOiBudW1iZXI7XHJcbiAgICB0b29sRXhlY3V0aW9uVGltZW91dE1zOiBudW1iZXI7XHJcbiAgICBlbmFibGVSZXN0QXBpOiBib29sZWFuO1xyXG59XHJcblxyXG5jb25zdCBDQVRFR09SWV9ESVNQTEFZX05BTUVTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gICAgc2NlbmU6ICdTY2VuZSBUb29scycsXHJcbiAgICBub2RlOiAnTm9kZSBUb29scycsXHJcbiAgICBjb21wb25lbnQ6ICdDb21wb25lbnQgVG9vbHMnLFxyXG4gICAgcHJlZmFiOiAnUHJlZmFiIFRvb2xzJyxcclxuICAgIHByb2plY3Q6ICdQcm9qZWN0IFRvb2xzJyxcclxuICAgIGRlYnVnOiAnRGVidWcgVG9vbHMnLFxyXG4gICAgcHJlZmVyZW5jZXM6ICdQcmVmZXJlbmNlcyBUb29scycsXHJcbiAgICBzZXJ2ZXI6ICdTZXJ2ZXIgVG9vbHMnLFxyXG4gICAgYnJvYWRjYXN0OiAnQnJvYWRjYXN0IFRvb2xzJyxcclxuICAgIHNjZW5lQWR2YW5jZWQ6ICdBZHZhbmNlZCBTY2VuZSBUb29scycsXHJcbiAgICBzY2VuZVZpZXc6ICdTY2VuZSBWaWV3IFRvb2xzJyxcclxuICAgIHJlZmVyZW5jZUltYWdlOiAnUmVmZXJlbmNlIEltYWdlIFRvb2xzJyxcclxuICAgIGFzc2V0QWR2YW5jZWQ6ICdBZHZhbmNlZCBBc3NldCBUb29scycsXHJcbiAgICB2YWxpZGF0aW9uOiAnVmFsaWRhdGlvbiBUb29scydcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRWRpdG9yLlBhbmVsLmRlZmluZSh7XHJcbiAgICBsaXN0ZW5lcnM6IHtcclxuICAgICAgICBzaG93KCkgeyB9LFxyXG4gICAgICAgIGhpZGUoKSB7IH0sXHJcbiAgICB9LFxyXG4gICAgdGVtcGxhdGU6IHJlYWRGaWxlU3luYyhqb2luKF9fZGlybmFtZSwgJy4uLy4uLy4uL3N0YXRpYy90ZW1wbGF0ZS9kZWZhdWx0L2luZGV4Lmh0bWwnKSwgJ3V0Zi04JyksXHJcbiAgICBzdHlsZTogcmVhZEZpbGVTeW5jKGpvaW4oX19kaXJuYW1lLCAnLi4vLi4vLi4vc3RhdGljL3N0eWxlL2RlZmF1bHQvaW5kZXguY3NzJyksICd1dGYtOCcpLFxyXG4gICAgJDoge1xyXG4gICAgICAgIGFwcDogJyNhcHAnLFxyXG4gICAgICAgIHBhbmVsVGl0bGU6ICcjcGFuZWxUaXRsZScsXHJcbiAgICB9LFxyXG4gICAgcmVhZHkoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLiQuYXBwKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGFwcCA9IGNyZWF0ZUFwcCh7fSk7XHJcbiAgICAgICAgYXBwLmNvbmZpZy5jb21waWxlck9wdGlvbnMuaXNDdXN0b21FbGVtZW50ID0gKHRhZykgPT4gdGFnLnN0YXJ0c1dpdGgoJ3VpLScpO1xyXG5cclxuICAgICAgICBhcHAuY29tcG9uZW50KCdNY3BTZXJ2ZXJBcHAnLCBkZWZpbmVDb21wb25lbnQoe1xyXG4gICAgICAgICAgICBzZXR1cCgpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVRhYiA9IHJlZignc2VydmVyJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzZXJ2ZXJSdW5uaW5nID0gcmVmKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHNlcnZlclN0YXR1c1RleHQgPSByZWYoJ1N0b3BwZWQnKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbm5lY3RlZENsaWVudHMgPSByZWYoMCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBodHRwVXJsID0gcmVmKCcnKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGlzUHJvY2Vzc2luZyA9IHJlZihmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzZXR0aW5nc0NoYW5nZWQgPSByZWYoZmFsc2UpO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzID0gcmVmPFNlcnZlclNldHRpbmdzPih7XHJcbiAgICAgICAgICAgICAgICAgICAgcG9ydDogMzAwMCxcclxuICAgICAgICAgICAgICAgICAgICBhdXRvU3RhcnQ6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgICAgIGRlYnVnTG9nOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgICAgICBtYXhDb25uZWN0aW9uczogMTAsXHJcbiAgICAgICAgICAgICAgICAgICAgbWF4U2Vzc2lvbnM6IDEwLFxyXG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb25JZGxlVGltZW91dE1zOiAzMCAqIDYwICogMTAwMCxcclxuICAgICAgICAgICAgICAgICAgICBhdXRoVG9rZW46ICcnLFxyXG4gICAgICAgICAgICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiAnJyxcclxuICAgICAgICAgICAgICAgICAgICByZXF1ZXN0Qm9keUxpbWl0Qnl0ZXM6IDEwMjQgKiAxMDI0LFxyXG4gICAgICAgICAgICAgICAgICAgIHRvb2xFeGVjdXRpb25UaW1lb3V0TXM6IDMwMDAwLFxyXG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZVJlc3RBcGk6IGZhbHNlXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdmFpbGFibGVUb29scyA9IHJlZjxUb29sQ29uZmlnW10+KFtdKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRvb2xDYXRlZ29yaWVzID0gcmVmPHN0cmluZ1tdPihbXSk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhdHVzQ2xhc3MgPSBjb21wdXRlZCgoKSA9PiAoe1xyXG4gICAgICAgICAgICAgICAgICAgIHJ1bm5pbmc6IHNlcnZlclJ1bm5pbmcudmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgc3RvcHBlZDogIXNlcnZlclJ1bm5pbmcudmFsdWVcclxuICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCB0b3RhbFRvb2xzID0gY29tcHV0ZWQoKCkgPT4gYXZhaWxhYmxlVG9vbHMudmFsdWUubGVuZ3RoKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVuYWJsZWRUb29sQ291bnQgPSBjb21wdXRlZCgoKSA9PiBhdmFpbGFibGVUb29scy52YWx1ZS5maWx0ZXIodCA9PiB0LmVuYWJsZWQpLmxlbmd0aCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkaXNhYmxlZFRvb2xDb3VudCA9IGNvbXB1dGVkKCgpID0+IHRvdGFsVG9vbHMudmFsdWUgLSBlbmFibGVkVG9vbENvdW50LnZhbHVlKTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzd2l0Y2hUYWIgPSAodGFiTmFtZTogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlVGFiLnZhbHVlID0gdGFiTmFtZTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGFiTmFtZSA9PT0gJ3Rvb2xzJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2FkVG9vbE1hbmFnZXJTdGF0ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgYXBwbHlTZXJ2ZXJTdGF0dXMgPSAoc3RhdHVzOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXR1cykgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIHNlcnZlclJ1bm5pbmcudmFsdWUgPSBCb29sZWFuKHN0YXR1cy5ydW5uaW5nKTtcclxuICAgICAgICAgICAgICAgICAgICBzZXJ2ZXJTdGF0dXNUZXh0LnZhbHVlID0gc3RhdHVzLnJ1bm5pbmcgPyAnUnVubmluZycgOiAnU3RvcHBlZCc7XHJcbiAgICAgICAgICAgICAgICAgICAgY29ubmVjdGVkQ2xpZW50cy52YWx1ZSA9IHN0YXR1cy5jbGllbnRzID8/IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgaHR0cFVybC52YWx1ZSA9IHN0YXR1cy5ydW5uaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgICAgID8gYGh0dHA6Ly8xMjcuMC4wLjE6JHtzdGF0dXMucG9ydH0vbWNwYFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA6ICcnO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCByZWZyZXNoU2VydmVyU3RhdHVzID0gYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0YXR1cyA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdjb2Nvcy1tY3Atc2VydmVyJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2dldC1zZXJ2ZXItc3RhdHVzJ1xyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlTZXJ2ZXJTdGF0dXMoc3RhdHVzKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RhdHVzO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCB0b2dnbGVTZXJ2ZXIgPSBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzUHJvY2Vzc2luZy52YWx1ZSkgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIGlzUHJvY2Vzc2luZy52YWx1ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNlcnZlclJ1bm5pbmcudmFsdWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2NvY29zLW1jcC1zZXJ2ZXInLCAnc3RvcC1zZXJ2ZXInKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRTZXR0aW5ncyA9IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb3J0OiBzZXR0aW5ncy52YWx1ZS5wb3J0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF1dG9TdGFydDogc2V0dGluZ3MudmFsdWUuYXV0b1N0YXJ0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZURlYnVnTG9nOiBzZXR0aW5ncy52YWx1ZS5kZWJ1Z0xvZyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhDb25uZWN0aW9uczogc2V0dGluZ3MudmFsdWUubWF4Q29ubmVjdGlvbnMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4U2Vzc2lvbnM6IHNldHRpbmdzLnZhbHVlLm1heFNlc3Npb25zLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlc3Npb25JZGxlVGltZW91dE1zOiBzZXR0aW5ncy52YWx1ZS5zZXNzaW9uSWRsZVRpbWVvdXRNcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdXRoVG9rZW46IHNldHRpbmdzLnZhbHVlLmF1dGhUb2tlbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbGxvd2VkT3JpZ2luczogcGFyc2VBbGxvd2VkT3JpZ2lucyhzZXR0aW5ncy52YWx1ZS5hbGxvd2VkT3JpZ2lucyksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVxdWVzdEJvZHlMaW1pdEJ5dGVzOiBzZXR0aW5ncy52YWx1ZS5yZXF1ZXN0Qm9keUxpbWl0Qnl0ZXMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9vbEV4ZWN1dGlvblRpbWVvdXRNczogc2V0dGluZ3MudmFsdWUudG9vbEV4ZWN1dGlvblRpbWVvdXRNcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVSZXN0QXBpOiBzZXR0aW5ncy52YWx1ZS5lbmFibGVSZXN0QXBpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnY29jb3MtbWNwLXNlcnZlcicsICd1cGRhdGUtc2V0dGluZ3MnLCBjdXJyZW50U2V0dGluZ3MpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnY29jb3MtbWNwLXNlcnZlcicsICdzdGFydC1zZXJ2ZXInKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCByZWZyZXNoU2VydmVyU3RhdHVzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JMb2coJ01DUCBQYW5lbCcsICdGYWlsZWQgdG8gdG9nZ2xlIHNlcnZlcicsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1Byb2Nlc3NpbmcudmFsdWUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHNhdmVTZXR0aW5ncyA9IGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNQcm9jZXNzaW5nLnZhbHVlKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgaXNQcm9jZXNzaW5nLnZhbHVlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzZXR0aW5nc0RhdGEgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb3J0OiBzZXR0aW5ncy52YWx1ZS5wb3J0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXV0b1N0YXJ0OiBzZXR0aW5ncy52YWx1ZS5hdXRvU3RhcnQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVEZWJ1Z0xvZzogc2V0dGluZ3MudmFsdWUuZGVidWdMb2csXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhDb25uZWN0aW9uczogc2V0dGluZ3MudmFsdWUubWF4Q29ubmVjdGlvbnMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhTZXNzaW9uczogc2V0dGluZ3MudmFsdWUubWF4U2Vzc2lvbnMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXNzaW9uSWRsZVRpbWVvdXRNczogc2V0dGluZ3MudmFsdWUuc2Vzc2lvbklkbGVUaW1lb3V0TXMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdXRoVG9rZW46IHNldHRpbmdzLnZhbHVlLmF1dGhUb2tlbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBwYXJzZUFsbG93ZWRPcmlnaW5zKHNldHRpbmdzLnZhbHVlLmFsbG93ZWRPcmlnaW5zKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcXVlc3RCb2R5TGltaXRCeXRlczogc2V0dGluZ3MudmFsdWUucmVxdWVzdEJvZHlMaW1pdEJ5dGVzLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9vbEV4ZWN1dGlvblRpbWVvdXRNczogc2V0dGluZ3MudmFsdWUudG9vbEV4ZWN1dGlvblRpbWVvdXRNcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZVJlc3RBcGk6IHNldHRpbmdzLnZhbHVlLmVuYWJsZVJlc3RBcGlcclxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnY29jb3MtbWNwLXNlcnZlcicsICd1cGRhdGUtc2V0dGluZ3MnLCBzZXR0aW5nc0RhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCByZWZyZXNoU2VydmVyU3RhdHVzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldHRpbmdzQ2hhbmdlZC52YWx1ZSA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yTG9nKCdNQ1AgUGFuZWwnLCAnRmFpbGVkIHRvIHNhdmUgc2V0dGluZ3MnLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXNQcm9jZXNzaW5nLnZhbHVlID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb3B5VXJsID0gYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KGh0dHBVcmwudmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yTG9nKCdNQ1AgUGFuZWwnLCAnRmFpbGVkIHRvIGNvcHkgVVJMJywgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgY29weVRva2VuID0gYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHNldHRpbmdzLnZhbHVlLmF1dGhUb2tlbik7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JMb2coJ01DUCBQYW5lbCcsICdGYWlsZWQgdG8gY29weSBhdXRoIHRva2VuJywgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VBbGxvd2VkT3JpZ2lucyA9ICh2YWx1ZTogc3RyaW5nKTogc3RyaW5nW10gPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuc3BsaXQoJywnKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAubWFwKG9yaWdpbiA9PiBvcmlnaW4udHJpbSgpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBsb2FkVG9vbE1hbmFnZXJTdGF0ZSA9IGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdjb2Nvcy1tY3Atc2VydmVyJywgJ2dldFRvb2xNYW5hZ2VyU3RhdGUnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdD8uc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlVG9vbHMudmFsdWUgPSByZXN1bHQuYXZhaWxhYmxlVG9vbHMgPz8gW107XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjYXRlZ29yaWVzID0gbmV3IFNldChhdmFpbGFibGVUb29scy52YWx1ZS5tYXAodCA9PiB0LmNhdGVnb3J5KSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b29sQ2F0ZWdvcmllcy52YWx1ZSA9IEFycmF5LmZyb20oY2F0ZWdvcmllcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvckxvZygnTUNQIFBhbmVsJywgJ0ZhaWxlZCB0byBsb2FkIHRvb2wgbWFuYWdlciBzdGF0ZScsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHVwZGF0ZVRvb2xTdGF0dXMgPSBhc3luYyAoY2F0ZWdvcnk6IHN0cmluZywgbmFtZTogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gT3B0aW1pc3RpYyB1cGRhdGVcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0b29sSW5kZXggPSBhdmFpbGFibGVUb29scy52YWx1ZS5maW5kSW5kZXgodCA9PiB0LmNhdGVnb3J5ID09PSBjYXRlZ29yeSAmJiB0Lm5hbWUgPT09IG5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b29sSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVRvb2xzLnZhbHVlW3Rvb2xJbmRleF0uZW5hYmxlZCA9IGVuYWJsZWQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVRvb2xzLnZhbHVlID0gWy4uLmF2YWlsYWJsZVRvb2xzLnZhbHVlXTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnY29jb3MtbWNwLXNlcnZlcicsICd1cGRhdGVUb29sU3RhdHVzJywgY2F0ZWdvcnksIG5hbWUsIGVuYWJsZWQpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdD8uc3VjY2VzcyAmJiB0b29sSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBSb2xsIGJhY2sgb24gZmFpbHVyZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlVG9vbHMudmFsdWVbdG9vbEluZGV4XS5lbmFibGVkID0gIWVuYWJsZWQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdmFpbGFibGVUb29scy52YWx1ZSA9IFsuLi5hdmFpbGFibGVUb29scy52YWx1ZV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBSb2xsIGJhY2sgb24gZXJyb3JcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRvb2xJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVRvb2xzLnZhbHVlW3Rvb2xJbmRleF0uZW5hYmxlZCA9ICFlbmFibGVkO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlVG9vbHMudmFsdWUgPSBbLi4uYXZhaWxhYmxlVG9vbHMudmFsdWVdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yTG9nKCdNQ1AgUGFuZWwnLCAnRmFpbGVkIHRvIHVwZGF0ZSB0b29sIHN0YXR1cycsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHNhdmVDaGFuZ2VzID0gYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHVwZGF0ZXMgPSBhdmFpbGFibGVUb29scy52YWx1ZS5tYXAodG9vbCA9PiAoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcnk6IFN0cmluZyh0b29sLmNhdGVnb3J5KSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IFN0cmluZyh0b29sLm5hbWUpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogQm9vbGVhbih0b29sLmVuYWJsZWQpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnY29jb3MtbWNwLXNlcnZlcicsICd1cGRhdGVUb29sU3RhdHVzQmF0Y2gnLCB1cGRhdGVzKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvckxvZygnTUNQIFBhbmVsJywgJ0ZhaWxlZCB0byBzYXZlIHRvb2wgY2hhbmdlcycsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHNlbGVjdEFsbFRvb2xzID0gYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVRvb2xzLnZhbHVlLmZvckVhY2godCA9PiB7IHQuZW5hYmxlZCA9IHRydWU7IH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNhdmVDaGFuZ2VzKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGRlc2VsZWN0QWxsVG9vbHMgPSBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgYXZhaWxhYmxlVG9vbHMudmFsdWUuZm9yRWFjaCh0ID0+IHsgdC5lbmFibGVkID0gZmFsc2U7IH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHNhdmVDaGFuZ2VzKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHRvZ2dsZUNhdGVnb3J5VG9vbHMgPSBhc3luYyAoY2F0ZWdvcnk6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVRvb2xzLnZhbHVlLmZvckVhY2godCA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0LmNhdGVnb3J5ID09PSBjYXRlZ29yeSkgdC5lbmFibGVkID0gZW5hYmxlZDtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBzYXZlQ2hhbmdlcygpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBnZXRUb29sc0J5Q2F0ZWdvcnkgPSAoY2F0ZWdvcnk6IHN0cmluZykgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhdmFpbGFibGVUb29scy52YWx1ZS5maWx0ZXIodCA9PiB0LmNhdGVnb3J5ID09PSBjYXRlZ29yeSk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGdldENhdGVnb3J5RGlzcGxheU5hbWUgPSAoY2F0ZWdvcnk6IHN0cmluZyk6IHN0cmluZyA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIENBVEVHT1JZX0RJU1BMQVlfTkFNRVNbY2F0ZWdvcnldID8/IGNhdGVnb3J5O1xyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICB3YXRjaChcclxuICAgICAgICAgICAgICAgICAgICBzZXR0aW5ncyxcclxuICAgICAgICAgICAgICAgICAgICAoKSA9PiB7IHNldHRpbmdzQ2hhbmdlZC52YWx1ZSA9IHRydWU7IH0sXHJcbiAgICAgICAgICAgICAgICAgICAgeyBkZWVwOiB0cnVlLCBmbHVzaDogJ3N5bmMnIH1cclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgbGV0IHN0YXR1c1BvbGxUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0SW50ZXJ2YWw+IHwgdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICAgICAgICAgIG9uTW91bnRlZChhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbG9hZFRvb2xNYW5hZ2VyU3RhdGUoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gYXdhaXQgcmVmcmVzaFNlcnZlclN0YXR1cygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdHVzPy5zZXR0aW5ncykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0dGluZ3MudmFsdWUgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9ydDogc3RhdHVzLnNldHRpbmdzLnBvcnQgPz8gMzAwMCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdXRvU3RhcnQ6IHN0YXR1cy5zZXR0aW5ncy5hdXRvU3RhcnQgPz8gZmFsc2UsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVidWdMb2c6IHN0YXR1cy5zZXR0aW5ncy5lbmFibGVEZWJ1Z0xvZyA/PyBmYWxzZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhDb25uZWN0aW9uczogc3RhdHVzLnNldHRpbmdzLm1heENvbm5lY3Rpb25zID8/IDEwLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heFNlc3Npb25zOiBzdGF0dXMuc2V0dGluZ3MubWF4U2Vzc2lvbnMgPz8gMTAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2Vzc2lvbklkbGVUaW1lb3V0TXM6IHN0YXR1cy5zZXR0aW5ncy5zZXNzaW9uSWRsZVRpbWVvdXRNcyA/PyAzMCAqIDYwICogMTAwMCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdXRoVG9rZW46IHN0YXR1cy5zZXR0aW5ncy5hdXRoVG9rZW4gPz8gJycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IChzdGF0dXMuc2V0dGluZ3MuYWxsb3dlZE9yaWdpbnMgPz8gW10pLmpvaW4oJywgJyksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVxdWVzdEJvZHlMaW1pdEJ5dGVzOiBzdGF0dXMuc2V0dGluZ3MucmVxdWVzdEJvZHlMaW1pdEJ5dGVzID8/IDEwMjQgKiAxMDI0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvb2xFeGVjdXRpb25UaW1lb3V0TXM6IHN0YXR1cy5zZXR0aW5ncy50b29sRXhlY3V0aW9uVGltZW91dE1zID8/IDMwMDAwLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuYWJsZVJlc3RBcGk6IHN0YXR1cy5zZXR0aW5ncy5lbmFibGVSZXN0QXBpID8/IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0dGluZ3NDaGFuZ2VkLnZhbHVlID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvckxvZygnTUNQIFBhbmVsJywgJ0ZhaWxlZCB0byBsb2FkIHNlcnZlciBzZXR0aW5ncycsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHN0YXR1c1BvbGxUaW1lciA9IHNldEludGVydmFsKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHJlZnJlc2hTZXJ2ZXJTdGF0dXMoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yTG9nKCdNQ1AgUGFuZWwnLCAnRmFpbGVkIHRvIHBvbGwgc2VydmVyIHN0YXR1cycsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0sIDIwMDApO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgb25Vbm1vdW50ZWQoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0dXNQb2xsVGltZXIpIGNsZWFySW50ZXJ2YWwoc3RhdHVzUG9sbFRpbWVyKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlVGFiLFxyXG4gICAgICAgICAgICAgICAgICAgIHNlcnZlclJ1bm5pbmcsXHJcbiAgICAgICAgICAgICAgICAgICAgc2VydmVyU3RhdHVzVGV4dCxcclxuICAgICAgICAgICAgICAgICAgICBjb25uZWN0ZWRDbGllbnRzLFxyXG4gICAgICAgICAgICAgICAgICAgIGh0dHBVcmwsXHJcbiAgICAgICAgICAgICAgICAgICAgaXNQcm9jZXNzaW5nLFxyXG4gICAgICAgICAgICAgICAgICAgIHNldHRpbmdzLFxyXG4gICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVRvb2xzLFxyXG4gICAgICAgICAgICAgICAgICAgIHRvb2xDYXRlZ29yaWVzLFxyXG4gICAgICAgICAgICAgICAgICAgIHNldHRpbmdzQ2hhbmdlZCxcclxuICAgICAgICAgICAgICAgICAgICBzdGF0dXNDbGFzcyxcclxuICAgICAgICAgICAgICAgICAgICB0b3RhbFRvb2xzLFxyXG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWRUb29sQ291bnQsXHJcbiAgICAgICAgICAgICAgICAgICAgZGlzYWJsZWRUb29sQ291bnQsXHJcbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoVGFiLFxyXG4gICAgICAgICAgICAgICAgICAgIHRvZ2dsZVNlcnZlcixcclxuICAgICAgICAgICAgICAgICAgICBzYXZlU2V0dGluZ3MsXHJcbiAgICAgICAgICAgICAgICAgICAgY29weVVybCxcclxuICAgICAgICAgICAgICAgICAgICBjb3B5VG9rZW4sXHJcbiAgICAgICAgICAgICAgICAgICAgbG9hZFRvb2xNYW5hZ2VyU3RhdGUsXHJcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlVG9vbFN0YXR1cyxcclxuICAgICAgICAgICAgICAgICAgICBzZWxlY3RBbGxUb29scyxcclxuICAgICAgICAgICAgICAgICAgICBkZXNlbGVjdEFsbFRvb2xzLFxyXG4gICAgICAgICAgICAgICAgICAgIHNhdmVDaGFuZ2VzLFxyXG4gICAgICAgICAgICAgICAgICAgIHRvZ2dsZUNhdGVnb3J5VG9vbHMsXHJcbiAgICAgICAgICAgICAgICAgICAgZ2V0VG9vbHNCeUNhdGVnb3J5LFxyXG4gICAgICAgICAgICAgICAgICAgIGdldENhdGVnb3J5RGlzcGxheU5hbWVcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHRlbXBsYXRlOiByZWFkRmlsZVN5bmMoam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9zdGF0aWMvdGVtcGxhdGUvdnVlL21jcC1zZXJ2ZXItYXBwLmh0bWwnKSwgJ3V0Zi04JyksXHJcbiAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICBhcHAubW91bnQodGhpcy4kLmFwcCk7XHJcbiAgICAgICAgcGFuZWxEYXRhTWFwLnNldCh0aGlzLCBhcHApO1xyXG4gICAgfSxcclxuICAgIGJlZm9yZUNsb3NlKCkgeyB9LFxyXG4gICAgY2xvc2UoKSB7XHJcbiAgICAgICAgcGFuZWxEYXRhTWFwLmdldCh0aGlzKT8udW5tb3VudCgpO1xyXG4gICAgfSxcclxufSk7XHJcbiJdfQ==