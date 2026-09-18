"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolManager = exports.TOOL_CONFIGURATION_SCHEMA_VERSION = void 0;
const crypto_1 = require("crypto");
const settings_1 = require("../settings");
const scene_tools_1 = require("./scene-tools");
const node_tools_1 = require("./node-tools");
const component_tools_1 = require("./component-tools");
const prefab_tools_1 = require("./prefab-tools");
const project_tools_1 = require("./project-tools");
const debug_tools_1 = require("./debug-tools");
const preferences_tools_1 = require("./preferences-tools");
const server_tools_1 = require("./server-tools");
const broadcast_tools_1 = require("./broadcast-tools");
const scene_advanced_tools_1 = require("./scene-advanced-tools");
const scene_view_tools_1 = require("./scene-view-tools");
const reference_image_tools_1 = require("./reference-image-tools");
const asset_advanced_tools_1 = require("./asset-advanced-tools");
const validation_tools_1 = require("./validation-tools");
const tool_security_1 = require("./tool-security");
const logger_1 = require("../logger");
exports.TOOL_CONFIGURATION_SCHEMA_VERSION = 1;
function createToolInstances() {
    return {
        scene: new scene_tools_1.SceneTools(),
        node: new node_tools_1.NodeTools(),
        component: new component_tools_1.ComponentTools(),
        prefab: new prefab_tools_1.PrefabTools(),
        project: new project_tools_1.ProjectTools(),
        debug: new debug_tools_1.DebugTools(),
        preferences: new preferences_tools_1.PreferencesTools(),
        server: new server_tools_1.ServerTools(),
        broadcast: new broadcast_tools_1.BroadcastTools(),
        sceneAdvanced: new scene_advanced_tools_1.SceneAdvancedTools(),
        sceneView: new scene_view_tools_1.SceneViewTools(),
        referenceImage: new reference_image_tools_1.ReferenceImageTools(),
        assetAdvanced: new asset_advanced_tools_1.AssetAdvancedTools(),
        validation: new validation_tools_1.ValidationTools()
    };
}
class ToolManager {
    constructor() {
        this.availableTools = [];
        this.settings = (0, settings_1.readToolManagerSettings)();
        this.availableTools = this.discoverTools();
        const recordsSanitized = this.sanitizeConfigurationRecords();
        if (this.settings.configurations.length === 0) {
            const now = new Date().toISOString();
            const config = this.createConfigurationRecord('Default', 'Auto-created default tool configuration', now);
            this.settings.configurations.push(config);
            this.settings.currentConfigId = config.id;
        }
        const reconciled = this.reconcileConfigurations();
        const securityMigrated = this.applySecurityMigration();
        const changed = recordsSanitized || reconciled || securityMigrated;
        if (changed)
            this.saveSettings();
    }
    discoverTools() {
        try {
            const instances = createToolInstances();
            const tools = [];
            for (const [category, toolSet] of Object.entries(instances)) {
                for (const tool of toolSet.getTools()) {
                    tools.push({
                        category,
                        name: tool.name,
                        enabled: !(0, tool_security_1.isDangerousByDefault)(`${category}_${tool.name}`),
                        description: tool.description
                    });
                }
            }
            (0, tool_security_1.validateToolSecurityCoverage)(tools.map(tool => `${tool.category}_${tool.name}`));
            return tools;
        }
        catch (error) {
            (0, logger_1.errorLog)('ToolManager', 'Failed to discover tools', error);
            return [];
        }
    }
    getAvailableTools() {
        return [...this.availableTools];
    }
    getConfigurations() {
        return [...this.settings.configurations];
    }
    getCurrentConfiguration() {
        var _a;
        if (!this.settings.currentConfigId)
            return null;
        return (_a = this.settings.configurations.find(c => c.id === this.settings.currentConfigId)) !== null && _a !== void 0 ? _a : null;
    }
    createConfiguration(name, description) {
        if (this.settings.configurations.length >= this.settings.maxConfigSlots) {
            throw new Error(`Maximum configuration slots reached (${this.settings.maxConfigSlots})`);
        }
        const now = new Date().toISOString();
        const config = this.createConfigurationRecord(name, description, now);
        this.settings.configurations.push(config);
        this.settings.currentConfigId = config.id;
        this.saveSettings();
        return config;
    }
    updateConfiguration(configId, updates) {
        const idx = this.findConfigIndex(configId);
        const name = typeof updates.name === 'string'
            ? updates.name.trim()
            : this.settings.configurations[idx].name;
        if (!name)
            throw new Error('Configuration name is required');
        const updated = Object.assign(Object.assign({}, this.settings.configurations[idx]), { name, description: typeof updates.description === 'string'
                ? updates.description
                : this.settings.configurations[idx].description, updatedAt: new Date().toISOString() });
        this.settings.configurations[idx] = updated;
        this.saveSettings();
        return updated;
    }
    deleteConfiguration(configId) {
        var _a, _b;
        const idx = this.findConfigIndex(configId);
        this.settings.configurations.splice(idx, 1);
        if (this.settings.currentConfigId === configId) {
            this.settings.currentConfigId = (_b = (_a = this.settings.configurations[0]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : '';
        }
        this.saveSettings();
    }
    setCurrentConfiguration(configId) {
        this.findConfigIndex(configId); // validates existence
        this.settings.currentConfigId = configId;
        this.saveSettings();
    }
    updateToolStatus(configId, category, toolName, enabled) {
        const config = this.getConfig(configId);
        const tool = config.tools.find(t => t.category === category && t.name === toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${category}/${toolName}`);
        }
        tool.enabled = enabled;
        config.updatedAt = new Date().toISOString();
        this.saveSettings();
    }
    updateToolStatusBatch(configId, updates) {
        const config = this.getConfig(configId);
        for (const update of updates) {
            const tool = config.tools.find(t => t.category === update.category && t.name === update.name);
            if (!tool)
                throw new Error(`Tool not found: ${update.category}/${update.name}`);
            tool.enabled = update.enabled;
        }
        config.updatedAt = new Date().toISOString();
        this.saveSettings();
    }
    exportConfiguration(configId) {
        return (0, settings_1.exportToolConfiguration)(this.getConfig(configId));
    }
    importConfiguration(configJson) {
        const config = (0, settings_1.importToolConfiguration)(configJson);
        const importedTools = this.validateImportedTools(config.tools);
        const now = new Date().toISOString();
        const importedByName = new Map(importedTools.map(tool => [`${tool.category}_${tool.name}`, tool]));
        const normalized = {
            schemaVersion: exports.TOOL_CONFIGURATION_SCHEMA_VERSION,
            id: (0, crypto_1.randomUUID)(),
            name: config.name.trim(),
            description: typeof config.description === 'string' ? config.description : undefined,
            tools: this.availableTools.map(tool => {
                const imported = importedByName.get(`${tool.category}_${tool.name}`);
                return Object.assign(Object.assign({}, tool), { enabled: imported
                        ? imported.enabled && !(0, tool_security_1.isDangerousByDefault)(`${tool.category}_${tool.name}`)
                        : tool.enabled });
            }),
            createdAt: now,
            updatedAt: now
        };
        if (!normalized.name)
            throw new Error('Configuration name is required');
        if (this.settings.configurations.length >= this.settings.maxConfigSlots) {
            throw new Error(`Maximum configuration slots reached (${this.settings.maxConfigSlots})`);
        }
        this.settings.configurations.push(normalized);
        this.saveSettings();
        return normalized;
    }
    getEnabledTools() {
        const current = this.getCurrentConfiguration();
        const source = current ? current.tools : this.availableTools;
        return source.filter(t => t.enabled);
    }
    getToolManagerState() {
        const current = this.getCurrentConfiguration();
        return {
            success: true,
            availableTools: current ? current.tools : this.getAvailableTools(),
            selectedConfigId: this.settings.currentConfigId,
            configurations: this.getConfigurations(),
            maxConfigSlots: this.settings.maxConfigSlots
        };
    }
    getConfig(configId) {
        const config = this.settings.configurations.find(c => c.id === configId);
        if (!config)
            throw new Error(`Configuration not found: ${configId}`);
        return config;
    }
    findConfigIndex(configId) {
        const idx = this.settings.configurations.findIndex(c => c.id === configId);
        if (idx === -1)
            throw new Error(`Configuration not found: ${configId}`);
        return idx;
    }
    saveSettings() {
        (0, settings_1.saveToolManagerSettings)(this.settings);
    }
    createConfigurationRecord(name, description, now) {
        return {
            schemaVersion: exports.TOOL_CONFIGURATION_SCHEMA_VERSION,
            id: (0, crypto_1.randomUUID)(),
            name,
            description,
            tools: this.availableTools.map(tool => (Object.assign({}, tool))),
            createdAt: now,
            updatedAt: now
        };
    }
    sanitizeConfigurationRecords() {
        const seenIds = new Set();
        const sanitized = this.settings.configurations.filter((config) => {
            if (!config
                || typeof config !== 'object'
                || typeof config.id !== 'string'
                || !config.id
                || seenIds.has(config.id)
                || typeof config.name !== 'string'
                || !config.name.trim()
                || !Array.isArray(config.tools)) {
                return false;
            }
            seenIds.add(config.id);
            return true;
        });
        const changed = sanitized.length !== this.settings.configurations.length;
        this.settings.configurations = sanitized;
        return changed;
    }
    reconcileConfigurations() {
        var _a, _b;
        let changed = false;
        const availableNames = new Set(this.availableTools.map(tool => `${tool.category}_${tool.name}`));
        for (const config of this.settings.configurations) {
            const existing = new Map();
            for (const tool of Array.isArray(config.tools) ? config.tools : []) {
                if (tool
                    && typeof tool.category === 'string'
                    && typeof tool.name === 'string'
                    && typeof tool.enabled === 'boolean') {
                    const key = `${tool.category}_${tool.name}`;
                    if (availableNames.has(key) && !existing.has(key))
                        existing.set(key, tool);
                }
            }
            const reconciled = this.availableTools.map(tool => {
                const previous = existing.get(`${tool.category}_${tool.name}`);
                return Object.assign(Object.assign({}, tool), { enabled: previous ? previous.enabled : tool.enabled });
            });
            if (config.schemaVersion !== exports.TOOL_CONFIGURATION_SCHEMA_VERSION
                || JSON.stringify(config.tools) !== JSON.stringify(reconciled)) {
                config.schemaVersion = exports.TOOL_CONFIGURATION_SCHEMA_VERSION;
                config.tools = reconciled;
                config.updatedAt = new Date().toISOString();
                changed = true;
            }
        }
        if (!this.settings.configurations.some(config => config.id === this.settings.currentConfigId)) {
            this.settings.currentConfigId = (_b = (_a = this.settings.configurations[0]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : '';
            changed = true;
        }
        if (this.settings.configurationSchemaVersion !== exports.TOOL_CONFIGURATION_SCHEMA_VERSION) {
            this.settings.configurationSchemaVersion = exports.TOOL_CONFIGURATION_SCHEMA_VERSION;
            changed = true;
        }
        return changed;
    }
    validateImportedTools(tools) {
        const known = new Set(this.availableTools.map(tool => `${tool.category}_${tool.name}`));
        const seen = new Set();
        return tools.map((tool, index) => {
            if (!tool
                || typeof tool !== 'object'
                || typeof tool.category !== 'string'
                || typeof tool.name !== 'string'
                || typeof tool.enabled !== 'boolean') {
                throw new Error(`Invalid tool entry at index ${index}`);
            }
            const key = `${tool.category}_${tool.name}`;
            if (!known.has(key))
                throw new Error(`Unknown tool in configuration: ${key}`);
            if (seen.has(key))
                throw new Error(`Duplicate tool in configuration: ${key}`);
            seen.add(key);
            return tool;
        });
    }
    applySecurityMigration() {
        if (this.settings.securityMigrationVersion >= tool_security_1.SECURITY_POLICY_VERSION)
            return false;
        for (const config of this.settings.configurations) {
            for (const tool of config.tools) {
                if ((0, tool_security_1.isDangerousByDefault)(`${tool.category}_${tool.name}`)) {
                    tool.enabled = false;
                }
            }
            config.updatedAt = new Date().toISOString();
        }
        this.settings.securityMigrationVersion = tool_security_1.SECURITY_POLICY_VERSION;
        return true;
    }
}
exports.ToolManager = ToolManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbC1tYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3Rvb2wtbWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBb0M7QUFFcEMsMENBQWlJO0FBQ2pJLCtDQUEyQztBQUMzQyw2Q0FBeUM7QUFDekMsdURBQW1EO0FBQ25ELGlEQUE2QztBQUM3QyxtREFBK0M7QUFDL0MsK0NBQTJDO0FBQzNDLDJEQUF1RDtBQUN2RCxpREFBNkM7QUFDN0MsdURBQW1EO0FBQ25ELGlFQUE0RDtBQUM1RCx5REFBb0Q7QUFDcEQsbUVBQThEO0FBQzlELGlFQUE0RDtBQUM1RCx5REFBcUQ7QUFDckQsbURBSXlCO0FBQ3pCLHNDQUFxQztBQUV4QixRQUFBLGlDQUFpQyxHQUFHLENBQUMsQ0FBQztBQUVuRCxTQUFTLG1CQUFtQjtJQUN4QixPQUFPO1FBQ0gsS0FBSyxFQUFFLElBQUksd0JBQVUsRUFBRTtRQUN2QixJQUFJLEVBQUUsSUFBSSxzQkFBUyxFQUFFO1FBQ3JCLFNBQVMsRUFBRSxJQUFJLGdDQUFjLEVBQUU7UUFDL0IsTUFBTSxFQUFFLElBQUksMEJBQVcsRUFBRTtRQUN6QixPQUFPLEVBQUUsSUFBSSw0QkFBWSxFQUFFO1FBQzNCLEtBQUssRUFBRSxJQUFJLHdCQUFVLEVBQUU7UUFDdkIsV0FBVyxFQUFFLElBQUksb0NBQWdCLEVBQUU7UUFDbkMsTUFBTSxFQUFFLElBQUksMEJBQVcsRUFBRTtRQUN6QixTQUFTLEVBQUUsSUFBSSxnQ0FBYyxFQUFFO1FBQy9CLGFBQWEsRUFBRSxJQUFJLHlDQUFrQixFQUFFO1FBQ3ZDLFNBQVMsRUFBRSxJQUFJLGlDQUFjLEVBQUU7UUFDL0IsY0FBYyxFQUFFLElBQUksMkNBQW1CLEVBQUU7UUFDekMsYUFBYSxFQUFFLElBQUkseUNBQWtCLEVBQUU7UUFDdkMsVUFBVSxFQUFFLElBQUksa0NBQWUsRUFBRTtLQUNwQyxDQUFDO0FBQ04sQ0FBQztBQUVE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QyxvQ0FBb0MsR0FBRyxFQUFFLENBQUMsQ0FBQztZQUM5RSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsT0FBTyxJQUFJLENBQUM7UUFDaEIsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sc0JBQXNCO1FBQzFCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsSUFBSSx1Q0FBdUI7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUVwRixLQUFLLE1BQU0sTUFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDaEQsS0FBSyxNQUFNLElBQUksSUFBSSxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQzlCLElBQUksSUFBQSxvQ0FBb0IsRUFBQyxHQUFHLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQztvQkFDeEQsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7Z0JBQ3pCLENBQUM7WUFDTCxDQUFDO1lBQ0QsTUFBTSxDQUFDLFNBQVMsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ2hELENBQUM7UUFFRCxJQUFJLENBQUMsUUFBUSxDQUFDLHdCQUF3QixHQUFHLHVDQUF1QixDQUFDO1FBQ2pFLE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7Q0FDSjtBQTFVRCxrQ0EwVUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSAnY3J5cHRvJztcclxuaW1wb3J0IHsgVG9vbENvbmZpZywgVG9vbENvbmZpZ3VyYXRpb24sIFRvb2xNYW5hZ2VyU2V0dGluZ3MgfSBmcm9tICcuLi90eXBlcyc7XHJcbmltcG9ydCB7IHJlYWRUb29sTWFuYWdlclNldHRpbmdzLCBzYXZlVG9vbE1hbmFnZXJTZXR0aW5ncywgZXhwb3J0VG9vbENvbmZpZ3VyYXRpb24sIGltcG9ydFRvb2xDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vc2V0dGluZ3MnO1xyXG5pbXBvcnQgeyBTY2VuZVRvb2xzIH0gZnJvbSAnLi9zY2VuZS10b29scyc7XHJcbmltcG9ydCB7IE5vZGVUb29scyB9IGZyb20gJy4vbm9kZS10b29scyc7XHJcbmltcG9ydCB7IENvbXBvbmVudFRvb2xzIH0gZnJvbSAnLi9jb21wb25lbnQtdG9vbHMnO1xyXG5pbXBvcnQgeyBQcmVmYWJUb29scyB9IGZyb20gJy4vcHJlZmFiLXRvb2xzJztcclxuaW1wb3J0IHsgUHJvamVjdFRvb2xzIH0gZnJvbSAnLi9wcm9qZWN0LXRvb2xzJztcclxuaW1wb3J0IHsgRGVidWdUb29scyB9IGZyb20gJy4vZGVidWctdG9vbHMnO1xyXG5pbXBvcnQgeyBQcmVmZXJlbmNlc1Rvb2xzIH0gZnJvbSAnLi9wcmVmZXJlbmNlcy10b29scyc7XHJcbmltcG9ydCB7IFNlcnZlclRvb2xzIH0gZnJvbSAnLi9zZXJ2ZXItdG9vbHMnO1xyXG5pbXBvcnQgeyBCcm9hZGNhc3RUb29scyB9IGZyb20gJy4vYnJvYWRjYXN0LXRvb2xzJztcclxuaW1wb3J0IHsgU2NlbmVBZHZhbmNlZFRvb2xzIH0gZnJvbSAnLi9zY2VuZS1hZHZhbmNlZC10b29scyc7XHJcbmltcG9ydCB7IFNjZW5lVmlld1Rvb2xzIH0gZnJvbSAnLi9zY2VuZS12aWV3LXRvb2xzJztcclxuaW1wb3J0IHsgUmVmZXJlbmNlSW1hZ2VUb29scyB9IGZyb20gJy4vcmVmZXJlbmNlLWltYWdlLXRvb2xzJztcclxuaW1wb3J0IHsgQXNzZXRBZHZhbmNlZFRvb2xzIH0gZnJvbSAnLi9hc3NldC1hZHZhbmNlZC10b29scyc7XHJcbmltcG9ydCB7IFZhbGlkYXRpb25Ub29scyB9IGZyb20gJy4vdmFsaWRhdGlvbi10b29scyc7XHJcbmltcG9ydCB7XHJcbiAgICBpc0Rhbmdlcm91c0J5RGVmYXVsdCxcclxuICAgIFNFQ1VSSVRZX1BPTElDWV9WRVJTSU9OLFxyXG4gICAgdmFsaWRhdGVUb29sU2VjdXJpdHlDb3ZlcmFnZVxyXG59IGZyb20gJy4vdG9vbC1zZWN1cml0eSc7XHJcbmltcG9ydCB7IGVycm9yTG9nIH0gZnJvbSAnLi4vbG9nZ2VyJztcclxuXHJcbmV4cG9ydCBjb25zdCBUT09MX0NPTkZJR1VSQVRJT05fU0NIRU1BX1ZFUlNJT04gPSAxO1xyXG5cclxuZnVuY3Rpb24gY3JlYXRlVG9vbEluc3RhbmNlcygpOiBSZWNvcmQ8c3RyaW5nLCBhbnk+IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgc2NlbmU6IG5ldyBTY2VuZVRvb2xzKCksXHJcbiAgICAgICAgbm9kZTogbmV3IE5vZGVUb29scygpLFxyXG4gICAgICAgIGNvbXBvbmVudDogbmV3IENvbXBvbmVudFRvb2xzKCksXHJcbiAgICAgICAgcHJlZmFiOiBuZXcgUHJlZmFiVG9vbHMoKSxcclxuICAgICAgICBwcm9qZWN0OiBuZXcgUHJvamVjdFRvb2xzKCksXHJcbiAgICAgICAgZGVidWc6IG5ldyBEZWJ1Z1Rvb2xzKCksXHJcbiAgICAgICAgcHJlZmVyZW5jZXM6IG5ldyBQcmVmZXJlbmNlc1Rvb2xzKCksXHJcbiAgICAgICAgc2VydmVyOiBuZXcgU2VydmVyVG9vbHMoKSxcclxuICAgICAgICBicm9hZGNhc3Q6IG5ldyBCcm9hZGNhc3RUb29scygpLFxyXG4gICAgICAgIHNjZW5lQWR2YW5jZWQ6IG5ldyBTY2VuZUFkdmFuY2VkVG9vbHMoKSxcclxuICAgICAgICBzY2VuZVZpZXc6IG5ldyBTY2VuZVZpZXdUb29scygpLFxyXG4gICAgICAgIHJlZmVyZW5jZUltYWdlOiBuZXcgUmVmZXJlbmNlSW1hZ2VUb29scygpLFxyXG4gICAgICAgIGFzc2V0QWR2YW5jZWQ6IG5ldyBBc3NldEFkdmFuY2VkVG9vbHMoKSxcclxuICAgICAgICB2YWxpZGF0aW9uOiBuZXcgVmFsaWRhdGlvblRvb2xzKClcclxuICAgIH07XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBUb29sTWFuYWdlciB7XHJcbiAgICBwcml2YXRlIHNldHRpbmdzOiBUb29sTWFuYWdlclNldHRpbmdzO1xyXG4gICAgcHJpdmF0ZSBhdmFpbGFibGVUb29sczogVG9vbENvbmZpZ1tdID0gW107XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHJlYWRUb29sTWFuYWdlclNldHRpbmdzKCk7XHJcbiAgICAgICAgdGhpcy5hdmFpbGFibGVUb29scyA9IHRoaXMuZGlzY292ZXJUb29scygpO1xyXG4gICAgICAgIGNvbnN0IHJlY29yZHNTYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplQ29uZmlndXJhdGlvblJlY29yZHMoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICAgICAgICAgICAgY29uc3QgY29uZmlnID0gdGhpcy5jcmVhdGVDb25maWd1cmF0aW9uUmVjb3JkKFxyXG4gICAgICAgICAgICAgICAgJ0RlZmF1bHQnLFxyXG4gICAgICAgICAgICAgICAgJ0F1dG8tY3JlYXRlZCBkZWZhdWx0IHRvb2wgY29uZmlndXJhdGlvbicsXHJcbiAgICAgICAgICAgICAgICBub3dcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9ucy5wdXNoKGNvbmZpZyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuY3VycmVudENvbmZpZ0lkID0gY29uZmlnLmlkO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcmVjb25jaWxlZCA9IHRoaXMucmVjb25jaWxlQ29uZmlndXJhdGlvbnMoKTtcclxuICAgICAgICBjb25zdCBzZWN1cml0eU1pZ3JhdGVkID0gdGhpcy5hcHBseVNlY3VyaXR5TWlncmF0aW9uKCk7XHJcbiAgICAgICAgY29uc3QgY2hhbmdlZCA9IHJlY29yZHNTYW5pdGl6ZWQgfHwgcmVjb25jaWxlZCB8fCBzZWN1cml0eU1pZ3JhdGVkO1xyXG4gICAgICAgIGlmIChjaGFuZ2VkKSB0aGlzLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZGlzY292ZXJUb29scygpOiBUb29sQ29uZmlnW10ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGluc3RhbmNlcyA9IGNyZWF0ZVRvb2xJbnN0YW5jZXMoKTtcclxuICAgICAgICAgICAgY29uc3QgdG9vbHM6IFRvb2xDb25maWdbXSA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtjYXRlZ29yeSwgdG9vbFNldF0gb2YgT2JqZWN0LmVudHJpZXMoaW5zdGFuY2VzKSkge1xyXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCB0b29sIG9mIHRvb2xTZXQuZ2V0VG9vbHMoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRvb2xzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogdG9vbC5uYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiAhaXNEYW5nZXJvdXNCeURlZmF1bHQoYCR7Y2F0ZWdvcnl9XyR7dG9vbC5uYW1lfWApLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHZhbGlkYXRlVG9vbFNlY3VyaXR5Q292ZXJhZ2UodG9vbHMubWFwKHRvb2wgPT4gYCR7dG9vbC5jYXRlZ29yeX1fJHt0b29sLm5hbWV9YCkpO1xyXG4gICAgICAgICAgICByZXR1cm4gdG9vbHM7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgZXJyb3JMb2coJ1Rvb2xNYW5hZ2VyJywgJ0ZhaWxlZCB0byBkaXNjb3ZlciB0b29scycsIGVycm9yKTtcclxuICAgICAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZ2V0QXZhaWxhYmxlVG9vbHMoKTogVG9vbENvbmZpZ1tdIHtcclxuICAgICAgICByZXR1cm4gWy4uLnRoaXMuYXZhaWxhYmxlVG9vbHNdO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBnZXRDb25maWd1cmF0aW9ucygpOiBUb29sQ29uZmlndXJhdGlvbltdIHtcclxuICAgICAgICByZXR1cm4gWy4uLnRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnNdO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBnZXRDdXJyZW50Q29uZmlndXJhdGlvbigpOiBUb29sQ29uZmlndXJhdGlvbiB8IG51bGwge1xyXG4gICAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5jdXJyZW50Q29uZmlnSWQpIHJldHVybiBudWxsO1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zLmZpbmQoYyA9PiBjLmlkID09PSB0aGlzLnNldHRpbmdzLmN1cnJlbnRDb25maWdJZCkgPz8gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgY3JlYXRlQ29uZmlndXJhdGlvbihuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nKTogVG9vbENvbmZpZ3VyYXRpb24ge1xyXG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zLmxlbmd0aCA+PSB0aGlzLnNldHRpbmdzLm1heENvbmZpZ1Nsb3RzKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTWF4aW11bSBjb25maWd1cmF0aW9uIHNsb3RzIHJlYWNoZWQgKCR7dGhpcy5zZXR0aW5ncy5tYXhDb25maWdTbG90c30pYCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcbiAgICAgICAgY29uc3QgY29uZmlnID0gdGhpcy5jcmVhdGVDb25maWd1cmF0aW9uUmVjb3JkKG5hbWUsIGRlc2NyaXB0aW9uLCBub3cpO1xyXG5cclxuICAgICAgICB0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zLnB1c2goY29uZmlnKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzLmN1cnJlbnRDb25maWdJZCA9IGNvbmZpZy5pZDtcclxuICAgICAgICB0aGlzLnNhdmVTZXR0aW5ncygpO1xyXG5cclxuICAgICAgICByZXR1cm4gY29uZmlnO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyB1cGRhdGVDb25maWd1cmF0aW9uKGNvbmZpZ0lkOiBzdHJpbmcsIHVwZGF0ZXM6IFBhcnRpYWw8VG9vbENvbmZpZ3VyYXRpb24+KTogVG9vbENvbmZpZ3VyYXRpb24ge1xyXG4gICAgICAgIGNvbnN0IGlkeCA9IHRoaXMuZmluZENvbmZpZ0luZGV4KGNvbmZpZ0lkKTtcclxuICAgICAgICBjb25zdCBuYW1lID0gdHlwZW9mIHVwZGF0ZXMubmFtZSA9PT0gJ3N0cmluZydcclxuICAgICAgICAgICAgPyB1cGRhdGVzLm5hbWUudHJpbSgpXHJcbiAgICAgICAgICAgIDogdGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9uc1tpZHhdLm5hbWU7XHJcbiAgICAgICAgaWYgKCFuYW1lKSB0aHJvdyBuZXcgRXJyb3IoJ0NvbmZpZ3VyYXRpb24gbmFtZSBpcyByZXF1aXJlZCcpO1xyXG4gICAgICAgIGNvbnN0IHVwZGF0ZWQ6IFRvb2xDb25maWd1cmF0aW9uID0ge1xyXG4gICAgICAgICAgICAuLi50aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zW2lkeF0sXHJcbiAgICAgICAgICAgIG5hbWUsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiB0eXBlb2YgdXBkYXRlcy5kZXNjcmlwdGlvbiA9PT0gJ3N0cmluZydcclxuICAgICAgICAgICAgICAgID8gdXBkYXRlcy5kZXNjcmlwdGlvblxyXG4gICAgICAgICAgICAgICAgOiB0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zW2lkeF0uZGVzY3JpcHRpb24sXHJcbiAgICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXHJcbiAgICAgICAgfTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zW2lkeF0gPSB1cGRhdGVkO1xyXG4gICAgICAgIHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgcmV0dXJuIHVwZGF0ZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGRlbGV0ZUNvbmZpZ3VyYXRpb24oY29uZmlnSWQ6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGlkeCA9IHRoaXMuZmluZENvbmZpZ0luZGV4KGNvbmZpZ0lkKTtcclxuICAgICAgICB0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zLnNwbGljZShpZHgsIDEpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5jdXJyZW50Q29uZmlnSWQgPT09IGNvbmZpZ0lkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuY3VycmVudENvbmZpZ0lkID0gdGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9uc1swXT8uaWQgPz8gJyc7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldEN1cnJlbnRDb25maWd1cmF0aW9uKGNvbmZpZ0lkOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmZpbmRDb25maWdJbmRleChjb25maWdJZCk7IC8vIHZhbGlkYXRlcyBleGlzdGVuY2VcclxuICAgICAgICB0aGlzLnNldHRpbmdzLmN1cnJlbnRDb25maWdJZCA9IGNvbmZpZ0lkO1xyXG4gICAgICAgIHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHVwZGF0ZVRvb2xTdGF0dXMoY29uZmlnSWQ6IHN0cmluZywgY2F0ZWdvcnk6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuZ2V0Q29uZmlnKGNvbmZpZ0lkKTtcclxuICAgICAgICBjb25zdCB0b29sID0gY29uZmlnLnRvb2xzLmZpbmQodCA9PiB0LmNhdGVnb3J5ID09PSBjYXRlZ29yeSAmJiB0Lm5hbWUgPT09IHRvb2xOYW1lKTtcclxuICAgICAgICBpZiAoIXRvb2wpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb29sIG5vdCBmb3VuZDogJHtjYXRlZ29yeX0vJHt0b29sTmFtZX1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdG9vbC5lbmFibGVkID0gZW5hYmxlZDtcclxuICAgICAgICBjb25maWcudXBkYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG4gICAgICAgIHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHVwZGF0ZVRvb2xTdGF0dXNCYXRjaChjb25maWdJZDogc3RyaW5nLCB1cGRhdGVzOiB7IGNhdGVnb3J5OiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgZW5hYmxlZDogYm9vbGVhbiB9W10pOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBjb25maWcgPSB0aGlzLmdldENvbmZpZyhjb25maWdJZCk7XHJcbiAgICAgICAgZm9yIChjb25zdCB1cGRhdGUgb2YgdXBkYXRlcykge1xyXG4gICAgICAgICAgICBjb25zdCB0b29sID0gY29uZmlnLnRvb2xzLmZpbmQodCA9PiB0LmNhdGVnb3J5ID09PSB1cGRhdGUuY2F0ZWdvcnkgJiYgdC5uYW1lID09PSB1cGRhdGUubmFtZSk7XHJcbiAgICAgICAgICAgIGlmICghdG9vbCkgdGhyb3cgbmV3IEVycm9yKGBUb29sIG5vdCBmb3VuZDogJHt1cGRhdGUuY2F0ZWdvcnl9LyR7dXBkYXRlLm5hbWV9YCk7XHJcbiAgICAgICAgICAgIHRvb2wuZW5hYmxlZCA9IHVwZGF0ZS5lbmFibGVkO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25maWcudXBkYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG4gICAgICAgIHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGV4cG9ydENvbmZpZ3VyYXRpb24oY29uZmlnSWQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICAgICAgcmV0dXJuIGV4cG9ydFRvb2xDb25maWd1cmF0aW9uKHRoaXMuZ2V0Q29uZmlnKGNvbmZpZ0lkKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGltcG9ydENvbmZpZ3VyYXRpb24oY29uZmlnSnNvbjogc3RyaW5nKTogVG9vbENvbmZpZ3VyYXRpb24ge1xyXG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IGltcG9ydFRvb2xDb25maWd1cmF0aW9uKGNvbmZpZ0pzb24pO1xyXG4gICAgICAgIGNvbnN0IGltcG9ydGVkVG9vbHMgPSB0aGlzLnZhbGlkYXRlSW1wb3J0ZWRUb29scyhjb25maWcudG9vbHMpO1xyXG4gICAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICAgICAgICBjb25zdCBpbXBvcnRlZEJ5TmFtZSA9IG5ldyBNYXAoXHJcbiAgICAgICAgICAgIGltcG9ydGVkVG9vbHMubWFwKHRvb2wgPT4gW2Ake3Rvb2wuY2F0ZWdvcnl9XyR7dG9vbC5uYW1lfWAsIHRvb2xdKVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZDogVG9vbENvbmZpZ3VyYXRpb24gPSB7XHJcbiAgICAgICAgICAgIHNjaGVtYVZlcnNpb246IFRPT0xfQ09ORklHVVJBVElPTl9TQ0hFTUFfVkVSU0lPTixcclxuICAgICAgICAgICAgaWQ6IHJhbmRvbVVVSUQoKSxcclxuICAgICAgICAgICAgbmFtZTogY29uZmlnLm5hbWUudHJpbSgpLFxyXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogdHlwZW9mIGNvbmZpZy5kZXNjcmlwdGlvbiA9PT0gJ3N0cmluZycgPyBjb25maWcuZGVzY3JpcHRpb24gOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICAgIHRvb2xzOiB0aGlzLmF2YWlsYWJsZVRvb2xzLm1hcCh0b29sID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltcG9ydGVkID0gaW1wb3J0ZWRCeU5hbWUuZ2V0KGAke3Rvb2wuY2F0ZWdvcnl9XyR7dG9vbC5uYW1lfWApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgICAgICAuLi50b29sLFxyXG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGltcG9ydGVkXHJcbiAgICAgICAgICAgICAgICAgICAgICAgID8gaW1wb3J0ZWQuZW5hYmxlZCAmJiAhaXNEYW5nZXJvdXNCeURlZmF1bHQoYCR7dG9vbC5jYXRlZ29yeX1fJHt0b29sLm5hbWV9YClcclxuICAgICAgICAgICAgICAgICAgICAgICAgOiB0b29sLmVuYWJsZWRcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICBjcmVhdGVkQXQ6IG5vdyxcclxuICAgICAgICAgICAgdXBkYXRlZEF0OiBub3dcclxuICAgICAgICB9O1xyXG4gICAgICAgIGlmICghbm9ybWFsaXplZC5uYW1lKSB0aHJvdyBuZXcgRXJyb3IoJ0NvbmZpZ3VyYXRpb24gbmFtZSBpcyByZXF1aXJlZCcpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9ucy5sZW5ndGggPj0gdGhpcy5zZXR0aW5ncy5tYXhDb25maWdTbG90cykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1heGltdW0gY29uZmlndXJhdGlvbiBzbG90cyByZWFjaGVkICgke3RoaXMuc2V0dGluZ3MubWF4Q29uZmlnU2xvdHN9KWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zLnB1c2gobm9ybWFsaXplZCk7XHJcbiAgICAgICAgdGhpcy5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICByZXR1cm4gbm9ybWFsaXplZDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZ2V0RW5hYmxlZFRvb2xzKCk6IFRvb2xDb25maWdbXSB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudCA9IHRoaXMuZ2V0Q3VycmVudENvbmZpZ3VyYXRpb24oKTtcclxuICAgICAgICBjb25zdCBzb3VyY2UgPSBjdXJyZW50ID8gY3VycmVudC50b29scyA6IHRoaXMuYXZhaWxhYmxlVG9vbHM7XHJcbiAgICAgICAgcmV0dXJuIHNvdXJjZS5maWx0ZXIodCA9PiB0LmVuYWJsZWQpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBnZXRUb29sTWFuYWdlclN0YXRlKCkge1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLmdldEN1cnJlbnRDb25maWd1cmF0aW9uKCk7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgICAgICAgYXZhaWxhYmxlVG9vbHM6IGN1cnJlbnQgPyBjdXJyZW50LnRvb2xzIDogdGhpcy5nZXRBdmFpbGFibGVUb29scygpLFxyXG4gICAgICAgICAgICBzZWxlY3RlZENvbmZpZ0lkOiB0aGlzLnNldHRpbmdzLmN1cnJlbnRDb25maWdJZCxcclxuICAgICAgICAgICAgY29uZmlndXJhdGlvbnM6IHRoaXMuZ2V0Q29uZmlndXJhdGlvbnMoKSxcclxuICAgICAgICAgICAgbWF4Q29uZmlnU2xvdHM6IHRoaXMuc2V0dGluZ3MubWF4Q29uZmlnU2xvdHNcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0Q29uZmlnKGNvbmZpZ0lkOiBzdHJpbmcpOiBUb29sQ29uZmlndXJhdGlvbiB7XHJcbiAgICAgICAgY29uc3QgY29uZmlnID0gdGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9ucy5maW5kKGMgPT4gYy5pZCA9PT0gY29uZmlnSWQpO1xyXG4gICAgICAgIGlmICghY29uZmlnKSB0aHJvdyBuZXcgRXJyb3IoYENvbmZpZ3VyYXRpb24gbm90IGZvdW5kOiAke2NvbmZpZ0lkfWApO1xyXG4gICAgICAgIHJldHVybiBjb25maWc7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBmaW5kQ29uZmlnSW5kZXgoY29uZmlnSWQ6IHN0cmluZyk6IG51bWJlciB7XHJcbiAgICAgICAgY29uc3QgaWR4ID0gdGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9ucy5maW5kSW5kZXgoYyA9PiBjLmlkID09PSBjb25maWdJZCk7XHJcbiAgICAgICAgaWYgKGlkeCA9PT0gLTEpIHRocm93IG5ldyBFcnJvcihgQ29uZmlndXJhdGlvbiBub3QgZm91bmQ6ICR7Y29uZmlnSWR9YCk7XHJcbiAgICAgICAgcmV0dXJuIGlkeDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNhdmVTZXR0aW5ncygpOiB2b2lkIHtcclxuICAgICAgICBzYXZlVG9vbE1hbmFnZXJTZXR0aW5ncyh0aGlzLnNldHRpbmdzKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZUNvbmZpZ3VyYXRpb25SZWNvcmQoXHJcbiAgICAgICAgbmFtZTogc3RyaW5nLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsXHJcbiAgICAgICAgbm93OiBzdHJpbmdcclxuICAgICk6IFRvb2xDb25maWd1cmF0aW9uIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBzY2hlbWFWZXJzaW9uOiBUT09MX0NPTkZJR1VSQVRJT05fU0NIRU1BX1ZFUlNJT04sXHJcbiAgICAgICAgICAgIGlkOiByYW5kb21VVUlEKCksXHJcbiAgICAgICAgICAgIG5hbWUsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uLFxyXG4gICAgICAgICAgICB0b29sczogdGhpcy5hdmFpbGFibGVUb29scy5tYXAodG9vbCA9PiAoeyAuLi50b29sIH0pKSxcclxuICAgICAgICAgICAgY3JlYXRlZEF0OiBub3csXHJcbiAgICAgICAgICAgIHVwZGF0ZWRBdDogbm93XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNhbml0aXplQ29uZmlndXJhdGlvblJlY29yZHMoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3Qgc2VlbklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xyXG4gICAgICAgIGNvbnN0IHNhbml0aXplZCA9IHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMuZmlsdGVyKChjb25maWc6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICAhY29uZmlnXHJcbiAgICAgICAgICAgICAgICB8fCB0eXBlb2YgY29uZmlnICE9PSAnb2JqZWN0J1xyXG4gICAgICAgICAgICAgICAgfHwgdHlwZW9mIGNvbmZpZy5pZCAhPT0gJ3N0cmluZydcclxuICAgICAgICAgICAgICAgIHx8ICFjb25maWcuaWRcclxuICAgICAgICAgICAgICAgIHx8IHNlZW5JZHMuaGFzKGNvbmZpZy5pZClcclxuICAgICAgICAgICAgICAgIHx8IHR5cGVvZiBjb25maWcubmFtZSAhPT0gJ3N0cmluZydcclxuICAgICAgICAgICAgICAgIHx8ICFjb25maWcubmFtZS50cmltKClcclxuICAgICAgICAgICAgICAgIHx8ICFBcnJheS5pc0FycmF5KGNvbmZpZy50b29scylcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc2Vlbklkcy5hZGQoY29uZmlnLmlkKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgY2hhbmdlZCA9IHNhbml0aXplZC5sZW5ndGggIT09IHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMubGVuZ3RoO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMgPSBzYW5pdGl6ZWQ7XHJcbiAgICAgICAgcmV0dXJuIGNoYW5nZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZWNvbmNpbGVDb25maWd1cmF0aW9ucygpOiBib29sZWFuIHtcclxuICAgICAgICBsZXQgY2hhbmdlZCA9IGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IGF2YWlsYWJsZU5hbWVzID0gbmV3IFNldChcclxuICAgICAgICAgICAgdGhpcy5hdmFpbGFibGVUb29scy5tYXAodG9vbCA9PiBgJHt0b29sLmNhdGVnb3J5fV8ke3Rvb2wubmFtZX1gKVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgY29uZmlnIG9mIHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvbnMpIHtcclxuICAgICAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBuZXcgTWFwPHN0cmluZywgVG9vbENvbmZpZz4oKTtcclxuICAgICAgICAgICAgZm9yIChjb25zdCB0b29sIG9mIEFycmF5LmlzQXJyYXkoY29uZmlnLnRvb2xzKSA/IGNvbmZpZy50b29scyA6IFtdKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICAgICAgdG9vbFxyXG4gICAgICAgICAgICAgICAgICAgICYmIHR5cGVvZiB0b29sLmNhdGVnb3J5ID09PSAnc3RyaW5nJ1xyXG4gICAgICAgICAgICAgICAgICAgICYmIHR5cGVvZiB0b29sLm5hbWUgPT09ICdzdHJpbmcnXHJcbiAgICAgICAgICAgICAgICAgICAgJiYgdHlwZW9mIHRvb2wuZW5hYmxlZCA9PT0gJ2Jvb2xlYW4nXHJcbiAgICAgICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBgJHt0b29sLmNhdGVnb3J5fV8ke3Rvb2wubmFtZX1gO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChhdmFpbGFibGVOYW1lcy5oYXMoa2V5KSAmJiAhZXhpc3RpbmcuaGFzKGtleSkpIGV4aXN0aW5nLnNldChrZXksIHRvb2wpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZWNvbmNpbGVkID0gdGhpcy5hdmFpbGFibGVUb29scy5tYXAodG9vbCA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwcmV2aW91cyA9IGV4aXN0aW5nLmdldChgJHt0b29sLmNhdGVnb3J5fV8ke3Rvb2wubmFtZX1gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICAgICAgLi4udG9vbCxcclxuICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBwcmV2aW91cyA/IHByZXZpb3VzLmVuYWJsZWQgOiB0b29sLmVuYWJsZWRcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICBjb25maWcuc2NoZW1hVmVyc2lvbiAhPT0gVE9PTF9DT05GSUdVUkFUSU9OX1NDSEVNQV9WRVJTSU9OXHJcbiAgICAgICAgICAgICAgICB8fCBKU09OLnN0cmluZ2lmeShjb25maWcudG9vbHMpICE9PSBKU09OLnN0cmluZ2lmeShyZWNvbmNpbGVkKVxyXG4gICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgIGNvbmZpZy5zY2hlbWFWZXJzaW9uID0gVE9PTF9DT05GSUdVUkFUSU9OX1NDSEVNQV9WRVJTSU9OO1xyXG4gICAgICAgICAgICAgICAgY29uZmlnLnRvb2xzID0gcmVjb25jaWxlZDtcclxuICAgICAgICAgICAgICAgIGNvbmZpZy51cGRhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcbiAgICAgICAgICAgICAgICBjaGFuZ2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zLnNvbWUoY29uZmlnID0+IGNvbmZpZy5pZCA9PT0gdGhpcy5zZXR0aW5ncy5jdXJyZW50Q29uZmlnSWQpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuY3VycmVudENvbmZpZ0lkID0gdGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9uc1swXT8uaWQgPz8gJyc7XHJcbiAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5jb25maWd1cmF0aW9uU2NoZW1hVmVyc2lvbiAhPT0gVE9PTF9DT05GSUdVUkFUSU9OX1NDSEVNQV9WRVJTSU9OKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuY29uZmlndXJhdGlvblNjaGVtYVZlcnNpb24gPSBUT09MX0NPTkZJR1VSQVRJT05fU0NIRU1BX1ZFUlNJT047XHJcbiAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY2hhbmdlZDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHZhbGlkYXRlSW1wb3J0ZWRUb29scyh0b29sczogVG9vbENvbmZpZ1tdKTogVG9vbENvbmZpZ1tdIHtcclxuICAgICAgICBjb25zdCBrbm93biA9IG5ldyBTZXQoXHJcbiAgICAgICAgICAgIHRoaXMuYXZhaWxhYmxlVG9vbHMubWFwKHRvb2wgPT4gYCR7dG9vbC5jYXRlZ29yeX1fJHt0b29sLm5hbWV9YClcclxuICAgICAgICApO1xyXG4gICAgICAgIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuICAgICAgICByZXR1cm4gdG9vbHMubWFwKCh0b29sLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICAhdG9vbFxyXG4gICAgICAgICAgICAgICAgfHwgdHlwZW9mIHRvb2wgIT09ICdvYmplY3QnXHJcbiAgICAgICAgICAgICAgICB8fCB0eXBlb2YgdG9vbC5jYXRlZ29yeSAhPT0gJ3N0cmluZydcclxuICAgICAgICAgICAgICAgIHx8IHR5cGVvZiB0b29sLm5hbWUgIT09ICdzdHJpbmcnXHJcbiAgICAgICAgICAgICAgICB8fCB0eXBlb2YgdG9vbC5lbmFibGVkICE9PSAnYm9vbGVhbidcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgdG9vbCBlbnRyeSBhdCBpbmRleCAke2luZGV4fWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGAke3Rvb2wuY2F0ZWdvcnl9XyR7dG9vbC5uYW1lfWA7XHJcbiAgICAgICAgICAgIGlmICgha25vd24uaGFzKGtleSkpIHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b29sIGluIGNvbmZpZ3VyYXRpb246ICR7a2V5fWApO1xyXG4gICAgICAgICAgICBpZiAoc2Vlbi5oYXMoa2V5KSkgdGhyb3cgbmV3IEVycm9yKGBEdXBsaWNhdGUgdG9vbCBpbiBjb25maWd1cmF0aW9uOiAke2tleX1gKTtcclxuICAgICAgICAgICAgc2Vlbi5hZGQoa2V5KTtcclxuICAgICAgICAgICAgcmV0dXJuIHRvb2w7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhcHBseVNlY3VyaXR5TWlncmF0aW9uKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLnNlY3VyaXR5TWlncmF0aW9uVmVyc2lvbiA+PSBTRUNVUklUWV9QT0xJQ1lfVkVSU0lPTikgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGNvbmZpZyBvZiB0aGlzLnNldHRpbmdzLmNvbmZpZ3VyYXRpb25zKSB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgdG9vbCBvZiBjb25maWcudG9vbHMpIHtcclxuICAgICAgICAgICAgICAgIGlmIChpc0Rhbmdlcm91c0J5RGVmYXVsdChgJHt0b29sLmNhdGVnb3J5fV8ke3Rvb2wubmFtZX1gKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRvb2wuZW5hYmxlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbmZpZy51cGRhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnNldHRpbmdzLnNlY3VyaXR5TWlncmF0aW9uVmVyc2lvbiA9IFNFQ1VSSVRZX1BPTElDWV9WRVJTSU9OO1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG59XHJcbiJdfQ==