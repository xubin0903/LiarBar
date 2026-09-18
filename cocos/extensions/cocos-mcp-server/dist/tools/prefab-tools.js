"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrefabTools = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class PrefabTools {
    getTools() {
        return [
            {
                name: 'get_prefab_list',
                description: 'Get all prefabs in the project',
                inputSchema: {
                    type: 'object',
                    properties: {
                        folder: {
                            type: 'string',
                            description: 'Folder path to search',
                            default: 'db://assets'
                        }
                    }
                }
            },
            {
                name: 'load_prefab',
                description: 'Resolve and parse a prefab asset',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prefabPath: { type: 'string', description: 'Prefab asset path' }
                    },
                    required: ['prefabPath']
                }
            },
            {
                name: 'instantiate_prefab',
                description: 'Instantiate a prefab in the scene and verify the created node',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prefabPath: { type: 'string', description: 'Prefab asset path' },
                        parentUuid: { type: 'string', description: 'Optional parent node UUID' },
                        position: {
                            type: 'object',
                            properties: {
                                x: { type: 'number' },
                                y: { type: 'number' },
                                z: { type: 'number' }
                            }
                        }
                    },
                    required: ['prefabPath']
                }
            },
            {
                name: 'revert_prefab',
                description: 'Restore a prefab instance to its asset state',
                inputSchema: {
                    type: 'object',
                    properties: {
                        nodeUuid: { type: 'string', description: 'Prefab instance node UUID' }
                    },
                    required: ['nodeUuid']
                }
            },
            {
                name: 'get_prefab_info',
                description: 'Get prefab asset and metadata information',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prefabPath: { type: 'string', description: 'Prefab asset path' }
                    },
                    required: ['prefabPath']
                }
            },
            {
                name: 'validate_prefab',
                description: 'Parse and validate the basic Cocos prefab JSON structure',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prefabPath: { type: 'string', description: 'Prefab asset path' }
                    },
                    required: ['prefabPath']
                }
            },
            {
                name: 'duplicate_prefab',
                description: 'Duplicate a prefab through the Cocos Asset Database',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sourcePrefabPath: { type: 'string', description: 'Source prefab path' },
                        targetPrefabPath: { type: 'string', description: 'Target prefab path or folder' },
                        newPrefabName: { type: 'string', description: 'Name used when target is a folder' }
                    },
                    required: ['sourcePrefabPath', 'targetPrefabPath']
                }
            },
            {
                name: 'restore_prefab_node',
                description: 'Restore the prefab link associated with a scene node',
                inputSchema: {
                    type: 'object',
                    properties: {
                        nodeUuid: { type: 'string', description: 'Prefab instance node UUID' }
                    },
                    required: ['nodeUuid']
                }
            }
        ];
    }
    async execute(toolName, args) {
        switch (toolName) {
            case 'get_prefab_list':
                return this.getPrefabList(args.folder);
            case 'load_prefab':
                return this.loadPrefab(args.prefabPath);
            case 'instantiate_prefab':
                return this.instantiatePrefab(args);
            case 'revert_prefab':
            case 'restore_prefab_node':
                return this.restorePrefab(args.nodeUuid);
            case 'get_prefab_info':
                return this.getPrefabInfo(args.prefabPath);
            case 'validate_prefab':
                return this.validatePrefab(args.prefabPath);
            case 'duplicate_prefab':
                return this.duplicatePrefab(args);
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }
    async getPrefabList(folder = 'db://assets') {
        try {
            const normalizedFolder = folder.replace(/\/+$/, '');
            const results = await Editor.Message.request('asset-db', 'query-assets', {
                pattern: `${normalizedFolder}/**/*.prefab`
            });
            const prefabs = results.map(asset => ({
                name: asset.name,
                path: asset.url,
                uuid: asset.uuid,
                folder: asset.url.substring(0, asset.url.lastIndexOf('/'))
            }));
            return { success: true, data: prefabs };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async loadPrefab(prefabPath) {
        try {
            const assetInfo = await this.queryPrefabAsset(prefabPath);
            const prefabData = await this.readPrefabFile(prefabPath, assetInfo);
            return {
                success: true,
                data: {
                    uuid: assetInfo.uuid,
                    name: assetInfo.name,
                    url: assetInfo.url,
                    objectCount: prefabData.length
                },
                verificationData: {
                    assetResolved: true,
                    jsonParsed: true
                }
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async instantiatePrefab(args) {
        var _a;
        try {
            const assetInfo = await this.queryPrefabAsset(args.prefabPath);
            const options = {
                assetUuid: assetInfo.uuid,
                type: assetInfo.type || 'cc.Prefab'
            };
            if (args.parentUuid)
                options.parent = args.parentUuid;
            if (args.position)
                options.position = args.position;
            const result = await Editor.Message.request('scene', 'create-node', options);
            const nodeUuid = Array.isArray(result) ? result[0] : result;
            const nodeData = nodeUuid
                ? await Editor.Message.request('scene', 'query-node', nodeUuid).catch(() => null)
                : null;
            if (!nodeUuid || !nodeData) {
                return {
                    success: false,
                    error: 'Cocos Creator did not verify the instantiated prefab node',
                    verificationData: { assetUuid: assetInfo.uuid, nodeExists: false }
                };
            }
            return {
                success: true,
                data: {
                    nodeUuid,
                    prefabPath: (_a = assetInfo.url) !== null && _a !== void 0 ? _a : args.prefabPath,
                    parentUuid: args.parentUuid,
                    position: args.position
                },
                message: 'Prefab instantiated successfully',
                verificationData: { assetUuid: assetInfo.uuid, nodeExists: true }
            };
        }
        catch (error) {
            return { success: false, error: `Prefab instantiation failed: ${error.message}` };
        }
    }
    async restorePrefab(nodeUuid) {
        try {
            const nodeData = await Editor.Message.request('scene', 'query-node', nodeUuid);
            const prefab = nodeData === null || nodeData === void 0 ? void 0 : nodeData.__prefab__;
            if (!(prefab === null || prefab === void 0 ? void 0 : prefab.rootUuid) || !(prefab === null || prefab === void 0 ? void 0 : prefab.uuid)) {
                return { success: false, error: 'Node is not linked to a prefab instance' };
            }
            await Editor.Message.request('scene', 'restore-prefab', prefab.rootUuid, prefab.uuid);
            return {
                success: true,
                data: {
                    nodeUuid,
                    rootUuid: prefab.rootUuid,
                    prefabUuid: prefab.uuid
                },
                message: 'Prefab instance restored successfully',
                verificationData: { nodeUuid, restored: true }
            };
        }
        catch (error) {
            return { success: false, error: `Prefab restore failed: ${error.message}` };
        }
    }
    async getPrefabInfo(prefabPath) {
        var _a;
        try {
            const assetInfo = await this.queryPrefabAsset(prefabPath);
            const metaInfo = await Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid).catch(() => null);
            const assetUrl = (_a = assetInfo.url) !== null && _a !== void 0 ? _a : prefabPath;
            const info = {
                name: assetInfo.name,
                uuid: assetInfo.uuid,
                path: assetUrl,
                folder: assetUrl.substring(0, assetUrl.lastIndexOf('/')),
                createTime: metaInfo === null || metaInfo === void 0 ? void 0 : metaInfo.createTime,
                modifyTime: metaInfo === null || metaInfo === void 0 ? void 0 : metaInfo.modifyTime,
                dependencies: (metaInfo === null || metaInfo === void 0 ? void 0 : metaInfo.depends) || []
            };
            return { success: true, data: info };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async validatePrefab(prefabPath) {
        try {
            const assetInfo = await this.queryPrefabAsset(prefabPath);
            const prefabData = await this.readPrefabFile(prefabPath, assetInfo);
            const nodeCount = prefabData.filter(item => (item === null || item === void 0 ? void 0 : item.__type__) === 'cc.Node').length;
            const componentCount = prefabData.filter(item => typeof (item === null || item === void 0 ? void 0 : item.__type__) === 'string'
                && item.__type__.startsWith('cc.')
                && item.__type__ !== 'cc.Node'
                && item.__type__ !== 'cc.Prefab'
                && item.__type__ !== 'cc.PrefabInfo').length;
            const hasPrefabAsset = prefabData.some(item => (item === null || item === void 0 ? void 0 : item.__type__) === 'cc.Prefab');
            const hasRootNode = prefabData.some(item => (item === null || item === void 0 ? void 0 : item.__type__) === 'cc.Node' && item._parent === null);
            const issues = [];
            if (!hasPrefabAsset)
                issues.push('Missing cc.Prefab asset object');
            if (!hasRootNode)
                issues.push('Missing root cc.Node object');
            return {
                success: true,
                data: {
                    isValid: issues.length === 0,
                    issues,
                    nodeCount,
                    componentCount
                },
                verificationData: { assetResolved: true, jsonParsed: true }
            };
        }
        catch (error) {
            return { success: false, error: `Failed to validate prefab: ${error.message}` };
        }
    }
    async duplicatePrefab(args) {
        var _a;
        try {
            const sourceInfo = await this.queryPrefabAsset(args.sourcePrefabPath);
            let targetPath = args.targetPrefabPath;
            if (!targetPath.endsWith('.prefab')) {
                const name = args.newPrefabName || `${sourceInfo.name || 'Prefab'}Copy`;
                targetPath = `${targetPath.replace(/\/$/, '')}/${name}.prefab`;
            }
            const copied = await Editor.Message.request('asset-db', 'copy-asset', args.sourcePrefabPath, targetPath, { overwrite: false, rename: false });
            if (!(copied === null || copied === void 0 ? void 0 : copied.uuid)) {
                return { success: false, error: 'Cocos Creator did not return the copied asset' };
            }
            return {
                success: true,
                data: {
                    sourcePrefabPath: args.sourcePrefabPath,
                    targetPrefabPath: (_a = copied.url) !== null && _a !== void 0 ? _a : targetPath,
                    uuid: copied.uuid
                },
                verificationData: { assetCopied: true, uuid: copied.uuid }
            };
        }
        catch (error) {
            return { success: false, error: `Failed to duplicate prefab: ${error.message}` };
        }
    }
    async queryPrefabAsset(prefabPath) {
        const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', prefabPath);
        if (!assetInfo)
            throw new Error(`Prefab not found: ${prefabPath}`);
        return assetInfo;
    }
    async readPrefabFile(prefabPath, assetInfo) {
        if (!assetInfo)
            await this.queryPrefabAsset(prefabPath);
        const sourcePath = this.resolveProjectAssetPath(prefabPath);
        this.assertInsideProject(sourcePath);
        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Prefab file does not exist: ${prefabPath}`);
        }
        const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        if (!Array.isArray(parsed))
            throw new Error('Prefab JSON root must be an array');
        return parsed;
    }
    resolveProjectAssetPath(assetPath) {
        if (!assetPath.startsWith('db://assets')) {
            throw new Error('Prefab path must use the db://assets scheme');
        }
        const relativePath = assetPath.slice('db://assets'.length).replace(/^[/\\]+/, '');
        return path.join(Editor.Project.path, 'assets', relativePath);
    }
    assertInsideProject(filePath) {
        const projectRoot = path.resolve(Editor.Project.path);
        const relative = path.relative(projectRoot, path.resolve(filePath));
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('Prefab source must be inside the current Cocos project');
        }
    }
}
exports.PrefabTools = PrefabTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmFiLXRvb2xzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc291cmNlL3Rvb2xzL3ByZWZhYi10b29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRzdCLE1BQWEsV0FBVztJQUNwQixRQUFRO1FBQ0osT0FBTztZQUNIO2dCQUNJLElBQUksRUFBRSxpQkFBaUI7Z0JBQ3ZCLFdBQVcsRUFBRSxnQ0FBZ0M7Z0JBQzdDLFdBQVcsRUFBRTtvQkFDVCxJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1IsTUFBTSxFQUFFOzRCQUNKLElBQUksRUFBRSxRQUFROzRCQUNkLFdBQVcsRUFBRSx1QkFBdUI7NEJBQ3BDLE9BQU8sRUFBRSxhQUFhO3lCQUN6QjtxQkFDSjtpQkFDSjthQUNKO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLGFBQWE7Z0JBQ25CLFdBQVcsRUFBRSxrQ0FBa0M7Z0JBQy9DLFdBQVcsRUFBRTtvQkFDVCxJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1IsVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsbUJBQW1CLEVBQUU7cUJBQ25FO29CQUNELFFBQVEsRUFBRSxDQUFDLFlBQVksQ0FBQztpQkFDM0I7YUFDSjtZQUNEO2dCQUNJLElBQUksRUFBRSxvQkFBb0I7Z0JBQzFCLFdBQVcsRUFBRSwrREFBK0Q7Z0JBQzVFLFdBQVcsRUFBRTtvQkFDVCxJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1IsVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsbUJBQW1CLEVBQUU7d0JBQ2hFLFVBQVUsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLDJCQUEyQixFQUFFO3dCQUN4RSxRQUFRLEVB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QUFJLEtBQUssQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO1FBQ25FLENBQUM7UUFDRCxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2xGLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVPLG1CQUFtQixDQUFDLFFBQWdCO1FBQ3hDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN0RCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDcEUsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUN6RCxNQUFNLElBQUksS0FBSyxDQUFDLHdEQUF3RCxDQUFDLENBQUM7UUFDOUUsQ0FBQztJQUNMLENBQUM7Q0FDSjtBQTNXRCxrQ0EyV0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcbmltcG9ydCB7IFByZWZhYkluZm8sIFRvb2xEZWZpbml0aW9uLCBUb29sRXhlY3V0b3IsIFRvb2xSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzJztcclxuXHJcbmV4cG9ydCBjbGFzcyBQcmVmYWJUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XHJcbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHtcclxuICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3ByZWZhYl9saXN0JyxcclxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnR2V0IGFsbCBwcmVmYWJzIGluIHRoZSBwcm9qZWN0JyxcclxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkZXI6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdGb2xkZXIgcGF0aCB0byBzZWFyY2gnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDogJ2RiOi8vYXNzZXRzJ1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiAnbG9hZF9wcmVmYWInLFxyXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZXNvbHZlIGFuZCBwYXJzZSBhIHByZWZhYiBhc3NldCcsXHJcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYToge1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxyXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmFiUGF0aDogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdQcmVmYWIgYXNzZXQgcGF0aCcgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgcmVxdWlyZWQ6IFsncHJlZmFiUGF0aCddXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG5hbWU6ICdpbnN0YW50aWF0ZV9wcmVmYWInLFxyXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdJbnN0YW50aWF0ZSBhIHByZWZhYiBpbiB0aGUgc2NlbmUgYW5kIHZlcmlmeSB0aGUgY3JlYXRlZCBub2RlJyxcclxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJQYXRoOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ1ByZWZhYiBhc3NldCBwYXRoJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnRVdWlkOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ09wdGlvbmFsIHBhcmVudCBub2RlIFVVSUQnIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiB7IHR5cGU6ICdudW1iZXInIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeTogeyB0eXBlOiAnbnVtYmVyJyB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHo6IHsgdHlwZTogJ251bWJlcicgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICByZXF1aXJlZDogWydwcmVmYWJQYXRoJ11cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbmFtZTogJ3JldmVydF9wcmVmYWInLFxyXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZXN0b3JlIGEgcHJlZmFiIGluc3RhbmNlIHRvIGl0cyBhc3NldCBzdGF0ZScsXHJcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYToge1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxyXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCcgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgcmVxdWlyZWQ6IFsnbm9kZVV1aWQnXVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3ByZWZhYl9pbmZvJyxcclxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnR2V0IHByZWZhYiBhc3NldCBhbmQgbWV0YWRhdGEgaW5mb3JtYXRpb24nLFxyXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcclxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnUHJlZmFiIGFzc2V0IHBhdGgnIH1cclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHJlcXVpcmVkOiBbJ3ByZWZhYlBhdGgnXVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiAndmFsaWRhdGVfcHJlZmFiJyxcclxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUGFyc2UgYW5kIHZhbGlkYXRlIHRoZSBiYXNpYyBDb2NvcyBwcmVmYWIgSlNPTiBzdHJ1Y3R1cmUnLFxyXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcclxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnUHJlZmFiIGFzc2V0IHBhdGgnIH1cclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHJlcXVpcmVkOiBbJ3ByZWZhYlBhdGgnXVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiAnZHVwbGljYXRlX3ByZWZhYicsXHJcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0R1cGxpY2F0ZSBhIHByZWZhYiB0aHJvdWdoIHRoZSBDb2NvcyBBc3NldCBEYXRhYmFzZScsXHJcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYToge1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxyXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlUHJlZmFiUGF0aDogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdTb3VyY2UgcHJlZmFiIHBhdGgnIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldFByZWZhYlBhdGg6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnVGFyZ2V0IHByZWZhYiBwYXRoIG9yIGZvbGRlcicgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmV3UHJlZmFiTmFtZTogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdOYW1lIHVzZWQgd2hlbiB0YXJnZXQgaXMgYSBmb2xkZXInIH1cclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHJlcXVpcmVkOiBbJ3NvdXJjZVByZWZhYlBhdGgnLCAndGFyZ2V0UHJlZmFiUGF0aCddXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIG5hbWU6ICdyZXN0b3JlX3ByZWZhYl9ub2RlJyxcclxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUmVzdG9yZSB0aGUgcHJlZmFiIGxpbmsgYXNzb2NpYXRlZCB3aXRoIGEgc2NlbmUgbm9kZScsXHJcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYToge1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxyXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVV1aWQ6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnUHJlZmFiIGluc3RhbmNlIG5vZGUgVVVJRCcgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgcmVxdWlyZWQ6IFsnbm9kZVV1aWQnXVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgXTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBleGVjdXRlKHRvb2xOYW1lOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgc3dpdGNoICh0b29sTmFtZSkge1xyXG4gICAgICAgICAgICBjYXNlICdnZXRfcHJlZmFiX2xpc3QnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0UHJlZmFiTGlzdChhcmdzLmZvbGRlcik7XHJcbiAgICAgICAgICAgIGNhc2UgJ2xvYWRfcHJlZmFiJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmxvYWRQcmVmYWIoYXJncy5wcmVmYWJQYXRoKTtcclxuICAgICAgICAgICAgY2FzZSAnaW5zdGFudGlhdGVfcHJlZmFiJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmluc3RhbnRpYXRlUHJlZmFiKGFyZ3MpO1xyXG4gICAgICAgICAgICBjYXNlICdyZXZlcnRfcHJlZmFiJzpcclxuICAgICAgICAgICAgY2FzZSAncmVzdG9yZV9wcmVmYWJfbm9kZSc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5yZXN0b3JlUHJlZmFiKGFyZ3Mubm9kZVV1aWQpO1xyXG4gICAgICAgICAgICBjYXNlICdnZXRfcHJlZmFiX2luZm8nOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0UHJlZmFiSW5mbyhhcmdzLnByZWZhYlBhdGgpO1xyXG4gICAgICAgICAgICBjYXNlICd2YWxpZGF0ZV9wcmVmYWInOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVQcmVmYWIoYXJncy5wcmVmYWJQYXRoKTtcclxuICAgICAgICAgICAgY2FzZSAnZHVwbGljYXRlX3ByZWZhYic6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5kdXBsaWNhdGVQcmVmYWIoYXJncyk7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG9vbDogJHt0b29sTmFtZX1gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRQcmVmYWJMaXN0KGZvbGRlciA9ICdkYjovL2Fzc2V0cycpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRGb2xkZXIgPSBmb2xkZXIucmVwbGFjZSgvXFwvKyQvLCAnJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdHM6IGFueVtdID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXRzJywge1xyXG4gICAgICAgICAgICAgICAgcGF0dGVybjogYCR7bm9ybWFsaXplZEZvbGRlcn0vKiovKi5wcmVmYWJgXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBjb25zdCBwcmVmYWJzOiBQcmVmYWJJbmZvW10gPSByZXN1bHRzLm1hcChhc3NldCA9PiAoe1xyXG4gICAgICAgICAgICAgICAgbmFtZTogYXNzZXQubmFtZSxcclxuICAgICAgICAgICAgICAgIHBhdGg6IGFzc2V0LnVybCxcclxuICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0LnV1aWQsXHJcbiAgICAgICAgICAgICAgICBmb2xkZXI6IGFzc2V0LnVybC5zdWJzdHJpbmcoMCwgYXNzZXQudXJsLmxhc3RJbmRleE9mKCcvJykpXHJcbiAgICAgICAgICAgIH0pKTtcclxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogcHJlZmFicyB9O1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZFByZWZhYihwcmVmYWJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IHRoaXMucXVlcnlQcmVmYWJBc3NldChwcmVmYWJQYXRoKTtcclxuICAgICAgICAgICAgY29uc3QgcHJlZmFiRGF0YSA9IGF3YWl0IHRoaXMucmVhZFByZWZhYkZpbGUocHJlZmFiUGF0aCwgYXNzZXRJbmZvKTtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBkYXRhOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogYXNzZXRJbmZvLnV1aWQsXHJcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogYXNzZXRJbmZvLm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgdXJsOiBhc3NldEluZm8udXJsLFxyXG4gICAgICAgICAgICAgICAgICAgIG9iamVjdENvdW50OiBwcmVmYWJEYXRhLmxlbmd0aFxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIHZlcmlmaWNhdGlvbkRhdGE6IHtcclxuICAgICAgICAgICAgICAgICAgICBhc3NldFJlc29sdmVkOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICAgIGpzb25QYXJzZWQ6IHRydWVcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGluc3RhbnRpYXRlUHJlZmFiKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgdGhpcy5xdWVyeVByZWZhYkFzc2V0KGFyZ3MucHJlZmFiUGF0aCk7XHJcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvbnM6IGFueSA9IHtcclxuICAgICAgICAgICAgICAgIGFzc2V0VXVpZDogYXNzZXRJbmZvLnV1aWQsXHJcbiAgICAgICAgICAgICAgICB0eXBlOiBhc3NldEluZm8udHlwZSB8fCAnY2MuUHJlZmFiJ1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBpZiAoYXJncy5wYXJlbnRVdWlkKSBvcHRpb25zLnBhcmVudCA9IGFyZ3MucGFyZW50VXVpZDtcclxuICAgICAgICAgICAgaWYgKGFyZ3MucG9zaXRpb24pIG9wdGlvbnMucG9zaXRpb24gPSBhcmdzLnBvc2l0aW9uO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnY3JlYXRlLW5vZGUnLCBvcHRpb25zKTtcclxuICAgICAgICAgICAgY29uc3Qgbm9kZVV1aWQgPSBBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHRbMF0gOiByZXN1bHQ7XHJcbiAgICAgICAgICAgIGNvbnN0IG5vZGVEYXRhID0gbm9kZVV1aWRcclxuICAgICAgICAgICAgICAgID8gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAncXVlcnktbm9kZScsIG5vZGVVdWlkKS5jYXRjaCgoKSA9PiBudWxsKVxyXG4gICAgICAgICAgICAgICAgOiBudWxsO1xyXG4gICAgICAgICAgICBpZiAoIW5vZGVVdWlkIHx8ICFub2RlRGF0YSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogJ0NvY29zIENyZWF0b3IgZGlkIG5vdCB2ZXJpZnkgdGhlIGluc3RhbnRpYXRlZCBwcmVmYWIgbm9kZScsXHJcbiAgICAgICAgICAgICAgICAgICAgdmVyaWZpY2F0aW9uRGF0YTogeyBhc3NldFV1aWQ6IGFzc2V0SW5mby51dWlkLCBub2RlRXhpc3RzOiBmYWxzZSB9XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZGF0YToge1xyXG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkLFxyXG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlBhdGg6IGFzc2V0SW5mby51cmwgPz8gYXJncy5wcmVmYWJQYXRoLFxyXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IGFyZ3MucGFyZW50VXVpZCxcclxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogYXJncy5wb3NpdGlvblxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdQcmVmYWIgaW5zdGFudGlhdGVkIHN1Y2Nlc3NmdWxseScsXHJcbiAgICAgICAgICAgICAgICB2ZXJpZmljYXRpb25EYXRhOiB7IGFzc2V0VXVpZDogYXNzZXRJbmZvLnV1aWQsIG5vZGVFeGlzdHM6IHRydWUgfVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgUHJlZmFiIGluc3RhbnRpYXRpb24gZmFpbGVkOiAke2Vycm9yLm1lc3NhZ2V9YCB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHJlc3RvcmVQcmVmYWIobm9kZVV1aWQ6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3Qgbm9kZURhdGE6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUnLCBub2RlVXVpZCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHByZWZhYiA9IG5vZGVEYXRhPy5fX3ByZWZhYl9fO1xyXG4gICAgICAgICAgICBpZiAoIXByZWZhYj8ucm9vdFV1aWQgfHwgIXByZWZhYj8udXVpZCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm9kZSBpcyBub3QgbGlua2VkIHRvIGEgcHJlZmFiIGluc3RhbmNlJyB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGF3YWl0IChFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0IGFzIGFueSkoXHJcbiAgICAgICAgICAgICAgICAnc2NlbmUnLFxyXG4gICAgICAgICAgICAgICAgJ3Jlc3RvcmUtcHJlZmFiJyxcclxuICAgICAgICAgICAgICAgIHByZWZhYi5yb290VXVpZCxcclxuICAgICAgICAgICAgICAgIHByZWZhYi51dWlkXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZGF0YToge1xyXG4gICAgICAgICAgICAgICAgICAgIG5vZGVVdWlkLFxyXG4gICAgICAgICAgICAgICAgICAgIHJvb3RVdWlkOiBwcmVmYWIucm9vdFV1aWQsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJlZmFiVXVpZDogcHJlZmFiLnV1aWRcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnUHJlZmFiIGluc3RhbmNlIHJlc3RvcmVkIHN1Y2Nlc3NmdWxseScsXHJcbiAgICAgICAgICAgICAgICB2ZXJpZmljYXRpb25EYXRhOiB7IG5vZGVVdWlkLCByZXN0b3JlZDogdHJ1ZSB9XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBQcmVmYWIgcmVzdG9yZSBmYWlsZWQ6ICR7ZXJyb3IubWVzc2FnZX1gIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgZ2V0UHJlZmFiSW5mbyhwcmVmYWJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IHRoaXMucXVlcnlQcmVmYWJBc3NldChwcmVmYWJQYXRoKTtcclxuICAgICAgICAgICAgY29uc3QgbWV0YUluZm86IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXHJcbiAgICAgICAgICAgICAgICAnYXNzZXQtZGInLFxyXG4gICAgICAgICAgICAgICAgJ3F1ZXJ5LWFzc2V0LW1ldGEnLFxyXG4gICAgICAgICAgICAgICAgYXNzZXRJbmZvLnV1aWRcclxuICAgICAgICAgICAgKS5jYXRjaCgoKSA9PiBudWxsKTtcclxuICAgICAgICAgICAgY29uc3QgYXNzZXRVcmwgPSBhc3NldEluZm8udXJsID8/IHByZWZhYlBhdGg7XHJcbiAgICAgICAgICAgIGNvbnN0IGluZm86IFByZWZhYkluZm8gPSB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiBhc3NldEluZm8ubmFtZSxcclxuICAgICAgICAgICAgICAgIHV1aWQ6IGFzc2V0SW5mby51dWlkLFxyXG4gICAgICAgICAgICAgICAgcGF0aDogYXNzZXRVcmwsXHJcbiAgICAgICAgICAgICAgICBmb2xkZXI6IGFzc2V0VXJsLnN1YnN0cmluZygwLCBhc3NldFVybC5sYXN0SW5kZXhPZignLycpKSxcclxuICAgICAgICAgICAgICAgIGNyZWF0ZVRpbWU6IG1ldGFJbmZvPy5jcmVhdGVUaW1lLFxyXG4gICAgICAgICAgICAgICAgbW9kaWZ5VGltZTogbWV0YUluZm8/Lm1vZGlmeVRpbWUsXHJcbiAgICAgICAgICAgICAgICBkZXBlbmRlbmNpZXM6IG1ldGFJbmZvPy5kZXBlbmRzIHx8IFtdXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IGluZm8gfTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlUHJlZmFiKHByZWZhYlBhdGg6IHN0cmluZyk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgYXNzZXRJbmZvID0gYXdhaXQgdGhpcy5xdWVyeVByZWZhYkFzc2V0KHByZWZhYlBhdGgpO1xyXG4gICAgICAgICAgICBjb25zdCBwcmVmYWJEYXRhID0gYXdhaXQgdGhpcy5yZWFkUHJlZmFiRmlsZShwcmVmYWJQYXRoLCBhc3NldEluZm8pO1xyXG4gICAgICAgICAgICBjb25zdCBub2RlQ291bnQgPSBwcmVmYWJEYXRhLmZpbHRlcihpdGVtID0+IGl0ZW0/Ll9fdHlwZV9fID09PSAnY2MuTm9kZScpLmxlbmd0aDtcclxuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50Q291bnQgPSBwcmVmYWJEYXRhLmZpbHRlcihpdGVtID0+XHJcbiAgICAgICAgICAgICAgICB0eXBlb2YgaXRlbT8uX190eXBlX18gPT09ICdzdHJpbmcnXHJcbiAgICAgICAgICAgICAgICAmJiBpdGVtLl9fdHlwZV9fLnN0YXJ0c1dpdGgoJ2NjLicpXHJcbiAgICAgICAgICAgICAgICAmJiBpdGVtLl9fdHlwZV9fICE9PSAnY2MuTm9kZSdcclxuICAgICAgICAgICAgICAgICYmIGl0ZW0uX190eXBlX18gIT09ICdjYy5QcmVmYWInXHJcbiAgICAgICAgICAgICAgICAmJiBpdGVtLl9fdHlwZV9fICE9PSAnY2MuUHJlZmFiSW5mbydcclxuICAgICAgICAgICAgKS5sZW5ndGg7XHJcbiAgICAgICAgICAgIGNvbnN0IGhhc1ByZWZhYkFzc2V0ID0gcHJlZmFiRGF0YS5zb21lKGl0ZW0gPT4gaXRlbT8uX190eXBlX18gPT09ICdjYy5QcmVmYWInKTtcclxuICAgICAgICAgICAgY29uc3QgaGFzUm9vdE5vZGUgPSBwcmVmYWJEYXRhLnNvbWUoaXRlbSA9PlxyXG4gICAgICAgICAgICAgICAgaXRlbT8uX190eXBlX18gPT09ICdjYy5Ob2RlJyAmJiBpdGVtLl9wYXJlbnQgPT09IG51bGxcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgY29uc3QgaXNzdWVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICAgICAgICBpZiAoIWhhc1ByZWZhYkFzc2V0KSBpc3N1ZXMucHVzaCgnTWlzc2luZyBjYy5QcmVmYWIgYXNzZXQgb2JqZWN0Jyk7XHJcbiAgICAgICAgICAgIGlmICghaGFzUm9vdE5vZGUpIGlzc3Vlcy5wdXNoKCdNaXNzaW5nIHJvb3QgY2MuTm9kZSBvYmplY3QnKTtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBkYXRhOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaXNWYWxpZDogaXNzdWVzLmxlbmd0aCA9PT0gMCxcclxuICAgICAgICAgICAgICAgICAgICBpc3N1ZXMsXHJcbiAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50LFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudENvdW50XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgdmVyaWZpY2F0aW9uRGF0YTogeyBhc3NldFJlc29sdmVkOiB0cnVlLCBqc29uUGFyc2VkOiB0cnVlIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYEZhaWxlZCB0byB2YWxpZGF0ZSBwcmVmYWI6ICR7ZXJyb3IubWVzc2FnZX1gIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgZHVwbGljYXRlUHJlZmFiKGFyZ3M6IGFueSk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3Qgc291cmNlSW5mbyA9IGF3YWl0IHRoaXMucXVlcnlQcmVmYWJBc3NldChhcmdzLnNvdXJjZVByZWZhYlBhdGgpO1xyXG4gICAgICAgICAgICBsZXQgdGFyZ2V0UGF0aCA9IGFyZ3MudGFyZ2V0UHJlZmFiUGF0aDtcclxuICAgICAgICAgICAgaWYgKCF0YXJnZXRQYXRoLmVuZHNXaXRoKCcucHJlZmFiJykpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5hbWUgPSBhcmdzLm5ld1ByZWZhYk5hbWUgfHwgYCR7c291cmNlSW5mby5uYW1lIHx8ICdQcmVmYWInfUNvcHlgO1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0UGF0aCA9IGAke3RhcmdldFBhdGgucmVwbGFjZSgvXFwvJC8sICcnKX0vJHtuYW1lfS5wcmVmYWJgO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IGNvcGllZDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcclxuICAgICAgICAgICAgICAgICdhc3NldC1kYicsXHJcbiAgICAgICAgICAgICAgICAnY29weS1hc3NldCcsXHJcbiAgICAgICAgICAgICAgICBhcmdzLnNvdXJjZVByZWZhYlBhdGgsXHJcbiAgICAgICAgICAgICAgICB0YXJnZXRQYXRoLFxyXG4gICAgICAgICAgICAgICAgeyBvdmVyd3JpdGU6IGZhbHNlLCByZW5hbWU6IGZhbHNlIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgaWYgKCFjb3BpZWQ/LnV1aWQpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0NvY29zIENyZWF0b3IgZGlkIG5vdCByZXR1cm4gdGhlIGNvcGllZCBhc3NldCcgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGRhdGE6IHtcclxuICAgICAgICAgICAgICAgICAgICBzb3VyY2VQcmVmYWJQYXRoOiBhcmdzLnNvdXJjZVByZWZhYlBhdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0UHJlZmFiUGF0aDogY29waWVkLnVybCA/PyB0YXJnZXRQYXRoLFxyXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IGNvcGllZC51dWlkXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgdmVyaWZpY2F0aW9uRGF0YTogeyBhc3NldENvcGllZDogdHJ1ZSwgdXVpZDogY29waWVkLnV1aWQgfVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgRmFpbGVkIHRvIGR1cGxpY2F0ZSBwcmVmYWI6ICR7ZXJyb3IubWVzc2FnZX1gIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgcXVlcnlQcmVmYWJBc3NldChwcmVmYWJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgICAgIGNvbnN0IGFzc2V0SW5mbzogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcclxuICAgICAgICAgICAgJ2Fzc2V0LWRiJyxcclxuICAgICAgICAgICAgJ3F1ZXJ5LWFzc2V0LWluZm8nLFxyXG4gICAgICAgICAgICBwcmVmYWJQYXRoXHJcbiAgICAgICAgKTtcclxuICAgICAgICBpZiAoIWFzc2V0SW5mbykgdGhyb3cgbmV3IEVycm9yKGBQcmVmYWIgbm90IGZvdW5kOiAke3ByZWZhYlBhdGh9YCk7XHJcbiAgICAgICAgcmV0dXJuIGFzc2V0SW5mbztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHJlYWRQcmVmYWJGaWxlKHByZWZhYlBhdGg6IHN0cmluZywgYXNzZXRJbmZvPzogYW55KTogUHJvbWlzZTxhbnlbXT4ge1xyXG4gICAgICAgIGlmICghYXNzZXRJbmZvKSBhd2FpdCB0aGlzLnF1ZXJ5UHJlZmFiQXNzZXQocHJlZmFiUGF0aCk7XHJcbiAgICAgICAgY29uc3Qgc291cmNlUGF0aCA9IHRoaXMucmVzb2x2ZVByb2plY3RBc3NldFBhdGgocHJlZmFiUGF0aCk7XHJcbiAgICAgICAgdGhpcy5hc3NlcnRJbnNpZGVQcm9qZWN0KHNvdXJjZVBhdGgpO1xyXG4gICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhzb3VyY2VQYXRoKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFByZWZhYiBmaWxlIGRvZXMgbm90IGV4aXN0OiAke3ByZWZhYlBhdGh9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHNvdXJjZVBhdGgsICd1dGY4JykpO1xyXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShwYXJzZWQpKSB0aHJvdyBuZXcgRXJyb3IoJ1ByZWZhYiBKU09OIHJvb3QgbXVzdCBiZSBhbiBhcnJheScpO1xyXG4gICAgICAgIHJldHVybiBwYXJzZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNvbHZlUHJvamVjdEFzc2V0UGF0aChhc3NldFBhdGg6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICAgICAgaWYgKCFhc3NldFBhdGguc3RhcnRzV2l0aCgnZGI6Ly9hc3NldHMnKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ByZWZhYiBwYXRoIG11c3QgdXNlIHRoZSBkYjovL2Fzc2V0cyBzY2hlbWUnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgcmVsYXRpdmVQYXRoID0gYXNzZXRQYXRoLnNsaWNlKCdkYjovL2Fzc2V0cycubGVuZ3RoKS5yZXBsYWNlKC9eWy9cXFxcXSsvLCAnJyk7XHJcbiAgICAgICAgcmV0dXJuIHBhdGguam9pbihFZGl0b3IuUHJvamVjdC5wYXRoLCAnYXNzZXRzJywgcmVsYXRpdmVQYXRoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzc2VydEluc2lkZVByb2plY3QoZmlsZVBhdGg6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHByb2plY3RSb290ID0gcGF0aC5yZXNvbHZlKEVkaXRvci5Qcm9qZWN0LnBhdGgpO1xyXG4gICAgICAgIGNvbnN0IHJlbGF0aXZlID0gcGF0aC5yZWxhdGl2ZShwcm9qZWN0Um9vdCwgcGF0aC5yZXNvbHZlKGZpbGVQYXRoKSk7XHJcbiAgICAgICAgaWYgKHJlbGF0aXZlLnN0YXJ0c1dpdGgoJy4uJykgfHwgcGF0aC5pc0Fic29sdXRlKHJlbGF0aXZlKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ByZWZhYiBzb3VyY2UgbXVzdCBiZSBpbnNpZGUgdGhlIGN1cnJlbnQgQ29jb3MgcHJvamVjdCcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG4iXX0=