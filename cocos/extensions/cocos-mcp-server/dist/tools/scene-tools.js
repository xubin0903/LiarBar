"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneTools = void 0;
class SceneTools {
    getTools() {
        return [
            {
                name: 'get_current_scene',
                description: 'Get current scene information',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'get_scene_list',
                description: 'Get all scenes in the project',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'open_scene',
                description: 'Open a scene by path',
                inputSchema: {
                    type: 'object',
                    properties: {
                        scenePath: { type: 'string', description: 'The scene file path' }
                    },
                    required: ['scenePath']
                }
            },
            {
                name: 'save_scene',
                description: 'Save current scene',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'create_scene',
                description: 'Create a new scene asset',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sceneName: { type: 'string', description: 'Name of the new scene' },
                        savePath: {
                            type: 'string',
                            description: 'Path to save the scene (e.g., db://assets/scenes/NewScene.scene)'
                        }
                    },
                    required: ['sceneName', 'savePath']
                }
            },
            {
                name: 'save_scene_as',
                description: 'Open the Cocos Creator Save Scene As dialog',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'close_scene',
                description: 'Close current scene',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'get_scene_hierarchy',
                description: 'Get the complete hierarchy of current scene',
                inputSchema: {
                    type: 'object',
                    properties: {
                        includeComponents: {
                            type: 'boolean',
                            description: 'Include component information',
                            default: false
                        }
                    }
                }
            }
        ];
    }
    async execute(toolName, args) {
        switch (toolName) {
            case 'get_current_scene': return this.getCurrentScene();
            case 'get_scene_list': return this.getSceneList();
            case 'open_scene': return this.openScene(args.scenePath);
            case 'save_scene': return this.saveScene();
            case 'create_scene': return this.createScene(args.sceneName, args.savePath);
            case 'save_scene_as': return this.saveSceneAs();
            case 'close_scene': return this.closeScene();
            case 'get_scene_hierarchy': return this.getSceneHierarchy(args.includeComponents);
            default: throw new Error(`Unknown tool: ${toolName}`);
        }
    }
    async getCurrentScene() {
        var _a, _b, _c, _d, _e;
        try {
            const tree = await Editor.Message.request('scene', 'query-node-tree');
            if (tree === null || tree === void 0 ? void 0 : tree.uuid) {
                return {
                    success: true,
                    data: {
                        name: (_a = tree.name) !== null && _a !== void 0 ? _a : 'Current Scene',
                        uuid: tree.uuid,
                        type: (_b = tree.type) !== null && _b !== void 0 ? _b : 'cc.Scene',
                        active: (_c = tree.active) !== null && _c !== void 0 ? _c : true,
                        nodeCount: (_e = (_d = tree.children) === null || _d === void 0 ? void 0 : _d.length) !== null && _e !== void 0 ? _e : 0
                    }
                };
            }
            return { success: false, error: 'No scene data available' };
        }
        catch (err) {
            // Fallback: query via scene script
            try {
                const result = await Editor.Message.request('scene', 'execute-scene-script', {
                    name: 'cocos-mcp-server',
                    method: 'getCurrentSceneInfo',
                    args: []
                });
                return result;
            }
            catch (err2) {
                return { success: false, error: `Editor API failed: ${err.message}; Scene script failed: ${err2.message}` };
            }
        }
    }
    async getSceneList() {
        try {
            const results = await Editor.Message.request('asset-db', 'query-assets', {
                pattern: 'db://assets/**/*.scene'
            });
            const scenes = results.map(asset => ({
                name: asset.name,
                path: asset.url,
                uuid: asset.uuid
            }));
            return { success: true, data: scenes };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async openScene(scenePath) {
        try {
            const uuid = await Editor.Message.request('asset-db', 'query-uuid', scenePath);
            if (!uuid)
                throw new Error('Scene not found');
            void Editor.Message.request('scene', 'open-scene', uuid).catch(() => undefined);
            return {
                success: true,
                message: `Scene open command dispatched: ${scenePath}`,
                verificationData: {
                    sceneAssetUuid: uuid,
                    openDispatched: true
                },
                warning: 'Cocos Creator opens scenes asynchronously'
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async saveScene() {
        try {
            void Editor.Message.request('scene', 'save-scene').catch(() => undefined);
            return {
                success: true,
                message: 'Scene save command dispatched',
                verificationData: { saveDispatched: true },
                warning: 'Cocos Creator processes scene saving asynchronously'
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async createScene(sceneName, savePath) {
        var _a;
        const fullPath = savePath.endsWith('.scene') ? savePath : `${savePath}/${sceneName}.scene`;
        const sceneContent = JSON.stringify(this.buildSceneTemplate(sceneName), null, 2);
        try {
            const result = await Editor.Message.request('asset-db', 'create-asset', fullPath, sceneContent);
            const sceneList = await this.getSceneList();
            const created = (_a = sceneList.data) === null || _a === void 0 ? void 0 : _a.find((s) => s.uuid === result.uuid);
            return {
                success: true,
                data: {
                    uuid: result.uuid,
                    url: result.url,
                    name: sceneName,
                    message: `Scene '${sceneName}' created successfully`,
                    sceneVerified: !!created
                },
                verificationData: created
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async getSceneHierarchy(includeComponents = false) {
        try {
            const tree = await Editor.Message.request('scene', 'query-node-tree');
            if (tree) {
                return { success: true, data: this.buildHierarchy(tree, includeComponents) };
            }
            return { success: false, error: 'No scene hierarchy available' };
        }
        catch (err) {
            // Fallback: query via scene script
            try {
                const result = await Editor.Message.request('scene', 'execute-scene-script', {
                    name: 'cocos-mcp-server',
                    method: 'getSceneHierarchy',
                    args: [includeComponents]
                });
                return result;
            }
            catch (err2) {
                return { success: false, error: `Editor API failed: ${err.message}; Scene script failed: ${err2.message}` };
            }
        }
    }
    buildHierarchy(node, includeComponents) {
        var _a, _b;
        const result = {
            uuid: node.uuid,
            name: node.name,
            type: node.type,
            active: node.active,
            children: (_b = (_a = node.children) === null || _a === void 0 ? void 0 : _a.map((child) => this.buildHierarchy(child, includeComponents))) !== null && _b !== void 0 ? _b : []
        };
        if (includeComponents && node.__comps__) {
            result.components = node.__comps__.map((comp) => {
                var _a, _b;
                return ({
                    type: (_a = comp.__type__) !== null && _a !== void 0 ? _a : 'Unknown',
                    enabled: (_b = comp.enabled) !== null && _b !== void 0 ? _b : true
                });
            });
        }
        return result;
    }
    async saveSceneAs() {
        try {
            await Editor.Message.request('scene', 'save-as-scene');
            return {
                success: true,
                data: { dialogOpened: true },
                message: 'Scene save-as dialog opened',
                verificationData: { dialogOpened: true }
            };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    async closeScene() {
        try {
            await Editor.Message.request('scene', 'close-scene');
            return { success: true, message: 'Scene closed successfully' };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    buildSceneTemplate(sceneName) {
        return [
            {
                '__type__': 'cc.SceneAsset', '_name': sceneName, '_objFlags': 0,
                '__editorExtras__': {}, '_native': '', 'scene': { '__id__': 1 }
            },
            {
                '__type__': 'cc.Scene', '_name': sceneName, '_objFlags': 0,
                '__editorExtras__': {}, '_parent': null, '_children': [],
                '_active': true, '_components': [], '_prefab': null,
                '_lpos': { '__type__': 'cc.Vec3', 'x': 0, 'y': 0, 'z': 0 },
                '_lrot': { '__type__': 'cc.Quat', 'x': 0, 'y': 0, 'z': 0, 'w': 1 },
                '_lscale': { '__type__': 'cc.Vec3', 'x': 1, 'y': 1, 'z': 1 },
                '_mobility': 0, '_layer': 1073741824,
                '_euler': { '__type__': 'cc.Vec3', 'x': 0, 'y': 0, 'z': 0 },
                'autoReleaseAssets': false, '_globals': { '__id__': 2 }, '_id': 'scene'
            },
            {
                '__type__': 'cc.SceneGlobals',
                'ambient': { '__id__': 3 }, 'skybox': { '__id__': 4 },
                'fog': { '__id__': 5 }, 'octree': { '__id__': 6 }
            },
            {
                '__type__': 'cc.AmbientInfo',
                '_skyColorHDR': { '__type__': 'cc.Vec4', 'x': 0.2, 'y': 0.5, 'z': 0.8, 'w': 0.520833 },
                '_skyColor': { '__type__': 'cc.Vec4', 'x': 0.2, 'y': 0.5, 'z': 0.8, 'w': 0.520833 },
                '_skyIllumHDR': 20000, '_skyIllum': 20000,
                '_groundAlbedoHDR': { '__type__': 'cc.Vec4', 'x': 0.2, 'y': 0.2, 'z': 0.2, 'w': 1 },
                '_groundAlbedo': { '__type__': 'cc.Vec4', 'x': 0.2, 'y': 0.2, 'z': 0.2, 'w': 1 }
            },
            {
                '__type__': 'cc.SkyboxInfo',
                '_envLightingType': 0, '_envmapHDR': null, '_envmap': null,
                '_envmapLodCount': 0, '_diffuseMapHDR': null, '_diffuseMap': null,
                '_enabled': false, '_useHDR': true, '_editableMaterial': null,
                '_reflectionHDR': null, '_reflectionMap': null, '_rotationAngle': 0
            },
            {
                '__type__': 'cc.FogInfo', '_type': 0,
                '_fogColor': { '__type__': 'cc.Color', 'r': 200, 'g': 200, 'b': 200, 'a': 255 },
                '_enabled': false, '_fogDensity': 0.3, '_fogStart': 0.5, '_fogEnd': 300,
                '_fogAtten': 5, '_fogTop': 1.5, '_fogRange': 1.2, '_accurate': false
            },
            {
                '__type__': 'cc.OctreeInfo', '_enabled': false,
                '_minPos': { '__type__': 'cc.Vec3', 'x': -1024, 'y': -1024, 'z': -1024 },
                '_maxPos': { '__type__': 'cc.Vec3', 'x': 1024, 'y': 1024, 'z': 1024 },
                '_depth': 8
            }
        ];
    }
}
exports.SceneTools = SceneTools;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUtdG9vbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvdG9vbHMvc2NlbmUtdG9vbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBRUEsTUFBYSxVQUFVO0lBQ25CLFFBQVE7UUFDSixPQUFPO1lBQ0g7Z0JBQ0ksSUFBSSxFQUFFLG1CQUFtQjtnQkFDekIsV0FBVyxFQUFFLCtCQUErQjtnQkFDNUMsV0FBVyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFO2FBQ2xEO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLGdCQUFnQjtnQkFDdEIsV0FBVyxFQUFFLCtCQUErQjtnQkFDNUMsV0FBVyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFO2FBQ2xEO1lBQ0Q7Z0JBQ0ksSUFBSSxFQUFFLFlBQVk7Z0JBQ2xCLFdBQVcsRUFBRSxzQkFBc0I7Z0JBQ25DLFdBQVcsRUFBRTtvQkFDVCxJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1IsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUscUJBQXFCLEVBQUU7cUJBQ3BFO29CQUNELFFBQVEsRUFBRSxDQUFDLFdBQVcsQ0FBQztpQkFDMUI7YUFDSjtZQUNEO2dCQUNJLElBQUksRUFBRSxZQUFZO2dCQUNsQixXQUFXLEVBQUUsb0JBQW9CO2dCQUNqQyxXQUFXLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxFQUFFLEVBQUU7YUFDbEQ7WUFDRDtnQkFDSSxJQUFJLEVBQUUsY0FBYztnQkFDcEIsV0FBVyxFQUFFLDBCQUEwQjtnQkFDdkMsV0FBVyxFQUFFO29CQUNULElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRTt3QkFDUixTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSx1QkFBdUIs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QUFhLEVBQUUsR0FBRyxFQUFFLFdBQVcsRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLEdBQUc7Z0JBQ3ZFLFdBQVcsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxXQUFXLEVBQUUsR0FBRyxFQUFFLFdBQVcsRUFBRSxLQUFLO2FBQ3ZFO1lBQ0Q7Z0JBQ0ksVUFBVSxFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQUUsS0FBSztnQkFDOUMsU0FBUyxFQUFFLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRTtnQkFDeEUsU0FBUyxFQUFFLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRTtnQkFDckUsUUFBUSxFQUFFLENBQUM7YUFDZDtTQUNKLENBQUM7SUFDTixDQUFDO0NBQ0o7QUE3U0QsZ0NBNlNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgVG9vbERlZmluaXRpb24sIFRvb2xSZXNwb25zZSwgVG9vbEV4ZWN1dG9yLCBTY2VuZUluZm8gfSBmcm9tICcuLi90eXBlcyc7XHJcblxyXG5leHBvcnQgY2xhc3MgU2NlbmVUb29scyBpbXBsZW1lbnRzIFRvb2xFeGVjdXRvciB7XHJcbiAgICBnZXRUb29scygpOiBUb29sRGVmaW5pdGlvbltdIHtcclxuICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X2N1cnJlbnRfc2NlbmUnLFxyXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdHZXQgY3VycmVudCBzY2VuZSBpbmZvcm1hdGlvbicsXHJcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3NjZW5lX2xpc3QnLFxyXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdHZXQgYWxsIHNjZW5lcyBpbiB0aGUgcHJvamVjdCcsXHJcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiAnb3Blbl9zY2VuZScsXHJcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ09wZW4gYSBzY2VuZSBieSBwYXRoJyxcclxuICAgICAgICAgICAgICAgIGlucHV0U2NoZW1hOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXHJcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzY2VuZVBhdGg6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnVGhlIHNjZW5lIGZpbGUgcGF0aCcgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgcmVxdWlyZWQ6IFsnc2NlbmVQYXRoJ11cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbmFtZTogJ3NhdmVfc2NlbmUnLFxyXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdTYXZlIGN1cnJlbnQgc2NlbmUnLFxyXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbmFtZTogJ2NyZWF0ZV9zY2VuZScsXHJcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NyZWF0ZSBhIG5ldyBzY2VuZSBhc3NldCcsXHJcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYToge1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxyXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2NlbmVOYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIG5ldyBzY2VuZScgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2F2ZVBhdGg6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdQYXRoIHRvIHNhdmUgdGhlIHNjZW5lIChlLmcuLCBkYjovL2Fzc2V0cy9zY2VuZXMvTmV3U2NlbmUuc2NlbmUpJ1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICByZXF1aXJlZDogWydzY2VuZU5hbWUnLCAnc2F2ZVBhdGgnXVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiAnc2F2ZV9zY2VuZV9hcycsXHJcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ09wZW4gdGhlIENvY29zIENyZWF0b3IgU2F2ZSBTY2VuZSBBcyBkaWFsb2cnLFxyXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgbmFtZTogJ2Nsb3NlX3NjZW5lJyxcclxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvc2UgY3VycmVudCBzY2VuZScsXHJcbiAgICAgICAgICAgICAgICBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiAnZ2V0X3NjZW5lX2hpZXJhcmNoeScsXHJcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0dldCB0aGUgY29tcGxldGUgaGllcmFyY2h5IG9mIGN1cnJlbnQgc2NlbmUnLFxyXG4gICAgICAgICAgICAgICAgaW5wdXRTY2hlbWE6IHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcclxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1ZGVDb21wb25lbnRzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnYm9vbGVhbicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0luY2x1ZGUgY29tcG9uZW50IGluZm9ybWF0aW9uJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICBdO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGV4ZWN1dGUodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcclxuICAgICAgICBzd2l0Y2ggKHRvb2xOYW1lKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2dldF9jdXJyZW50X3NjZW5lJzogICByZXR1cm4gdGhpcy5nZXRDdXJyZW50U2NlbmUoKTtcclxuICAgICAgICAgICAgY2FzZSAnZ2V0X3NjZW5lX2xpc3QnOiAgICAgIHJldHVybiB0aGlzLmdldFNjZW5lTGlzdCgpO1xyXG4gICAgICAgICAgICBjYXNlICdvcGVuX3NjZW5lJzogICAgICAgICAgcmV0dXJuIHRoaXMub3BlblNjZW5lKGFyZ3Muc2NlbmVQYXRoKTtcclxuICAgICAgICAgICAgY2FzZSAnc2F2ZV9zY2VuZSc6ICAgICAgICAgIHJldHVybiB0aGlzLnNhdmVTY2VuZSgpO1xyXG4gICAgICAgICAgICBjYXNlICdjcmVhdGVfc2NlbmUnOiAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlU2NlbmUoYXJncy5zY2VuZU5hbWUsIGFyZ3Muc2F2ZVBhdGgpO1xyXG4gICAgICAgICAgICBjYXNlICdzYXZlX3NjZW5lX2FzJzogICAgICAgcmV0dXJuIHRoaXMuc2F2ZVNjZW5lQXMoKTtcclxuICAgICAgICAgICAgY2FzZSAnY2xvc2Vfc2NlbmUnOiAgICAgICAgIHJldHVybiB0aGlzLmNsb3NlU2NlbmUoKTtcclxuICAgICAgICAgICAgY2FzZSAnZ2V0X3NjZW5lX2hpZXJhcmNoeSc6IHJldHVybiB0aGlzLmdldFNjZW5lSGllcmFyY2h5KGFyZ3MuaW5jbHVkZUNvbXBvbmVudHMpO1xyXG4gICAgICAgICAgICBkZWZhdWx0OiB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG9vbDogJHt0b29sTmFtZX1gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRDdXJyZW50U2NlbmUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCB0cmVlOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1ub2RlLXRyZWUnKTtcclxuICAgICAgICAgICAgaWYgKHRyZWU/LnV1aWQpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHRyZWUubmFtZSA/PyAnQ3VycmVudCBTY2VuZScsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IHRyZWUudXVpZCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogdHJlZS50eXBlID8/ICdjYy5TY2VuZScsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGl2ZTogdHJlZS5hY3RpdmUgPz8gdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZUNvdW50OiB0cmVlLmNoaWxkcmVuPy5sZW5ndGggPz8gMFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gc2NlbmUgZGF0YSBhdmFpbGFibGUnIH07XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcclxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IHF1ZXJ5IHZpYSBzY2VuZSBzY3JpcHRcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZXhlY3V0ZS1zY2VuZS1zY3JpcHQnLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogJ2NvY29zLW1jcC1zZXJ2ZXInLFxyXG4gICAgICAgICAgICAgICAgICAgIG1ldGhvZDogJ2dldEN1cnJlbnRTY2VuZUluZm8nLFxyXG4gICAgICAgICAgICAgICAgICAgIGFyZ3M6IFtdXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycjI6IGFueSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgRWRpdG9yIEFQSSBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9OyBTY2VuZSBzY3JpcHQgZmFpbGVkOiAke2VycjIubWVzc2FnZX1gIH07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRTY2VuZUxpc3QoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHRzOiBhbnlbXSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0cycsIHtcclxuICAgICAgICAgICAgICAgIHBhdHRlcm46ICdkYjovL2Fzc2V0cy8qKi8qLnNjZW5lJ1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgY29uc3Qgc2NlbmVzOiBTY2VuZUluZm9bXSA9IHJlc3VsdHMubWFwKGFzc2V0ID0+ICh7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiBhc3NldC5uYW1lLFxyXG4gICAgICAgICAgICAgICAgcGF0aDogYXNzZXQudXJsLFxyXG4gICAgICAgICAgICAgICAgdXVpZDogYXNzZXQudXVpZFxyXG4gICAgICAgICAgICB9KSk7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHNjZW5lcyB9O1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBvcGVuU2NlbmUoc2NlbmVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHV1aWQ6IHN0cmluZyB8IG51bGwgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS11dWlkJywgc2NlbmVQYXRoKTtcclxuICAgICAgICAgICAgaWYgKCF1dWlkKSB0aHJvdyBuZXcgRXJyb3IoJ1NjZW5lIG5vdCBmb3VuZCcpO1xyXG4gICAgICAgICAgICB2b2lkIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ29wZW4tc2NlbmUnLCB1dWlkKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGBTY2VuZSBvcGVuIGNvbW1hbmQgZGlzcGF0Y2hlZDogJHtzY2VuZVBhdGh9YCxcclxuICAgICAgICAgICAgICAgIHZlcmlmaWNhdGlvbkRhdGE6IHtcclxuICAgICAgICAgICAgICAgICAgICBzY2VuZUFzc2V0VXVpZDogdXVpZCxcclxuICAgICAgICAgICAgICAgICAgICBvcGVuRGlzcGF0Y2hlZDogdHJ1ZVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIHdhcm5pbmc6ICdDb2NvcyBDcmVhdG9yIG9wZW5zIHNjZW5lcyBhc3luY2hyb25vdXNseSdcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgc2F2ZVNjZW5lKCk6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgdm9pZCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzYXZlLXNjZW5lJykuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnU2NlbmUgc2F2ZSBjb21tYW5kIGRpc3BhdGNoZWQnLFxyXG4gICAgICAgICAgICAgICAgdmVyaWZpY2F0aW9uRGF0YTogeyBzYXZlRGlzcGF0Y2hlZDogdHJ1ZSB9LFxyXG4gICAgICAgICAgICAgICAgd2FybmluZzogJ0NvY29zIENyZWF0b3IgcHJvY2Vzc2VzIHNjZW5lIHNhdmluZyBhc3luY2hyb25vdXNseSdcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgY3JlYXRlU2NlbmUoc2NlbmVOYW1lOiBzdHJpbmcsIHNhdmVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xyXG4gICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gc2F2ZVBhdGguZW5kc1dpdGgoJy5zY2VuZScpID8gc2F2ZVBhdGggOiBgJHtzYXZlUGF0aH0vJHtzY2VuZU5hbWV9LnNjZW5lYDtcclxuICAgICAgICBjb25zdCBzY2VuZUNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh0aGlzLmJ1aWxkU2NlbmVUZW1wbGF0ZShzY2VuZU5hbWUpLCBudWxsLCAyKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQ6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ2NyZWF0ZS1hc3NldCcsIGZ1bGxQYXRoLCBzY2VuZUNvbnRlbnQpO1xyXG4gICAgICAgICAgICBjb25zdCBzY2VuZUxpc3QgPSBhd2FpdCB0aGlzLmdldFNjZW5lTGlzdCgpO1xyXG4gICAgICAgICAgICBjb25zdCBjcmVhdGVkID0gc2NlbmVMaXN0LmRhdGE/LmZpbmQoKHM6IGFueSkgPT4gcy51dWlkID09PSByZXN1bHQudXVpZCk7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgZGF0YToge1xyXG4gICAgICAgICAgICAgICAgICAgIHV1aWQ6IHJlc3VsdC51dWlkLFxyXG4gICAgICAgICAgICAgICAgICAgIHVybDogcmVzdWx0LnVybCxcclxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBzY2VuZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogYFNjZW5lICcke3NjZW5lTmFtZX0nIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5YCxcclxuICAgICAgICAgICAgICAgICAgICBzY2VuZVZlcmlmaWVkOiAhIWNyZWF0ZWRcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICB2ZXJpZmljYXRpb25EYXRhOiBjcmVhdGVkXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGdldFNjZW5lSGllcmFyY2h5KGluY2x1ZGVDb21wb25lbnRzOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRyZWU6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3F1ZXJ5LW5vZGUtdHJlZScpO1xyXG4gICAgICAgICAgICBpZiAodHJlZSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogdGhpcy5idWlsZEhpZXJhcmNoeSh0cmVlLCBpbmNsdWRlQ29tcG9uZW50cykgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBzY2VuZSBoaWVyYXJjaHkgYXZhaWxhYmxlJyB9O1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XHJcbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBxdWVyeSB2aWEgc2NlbmUgc2NyaXB0XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQ6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0Jywge1xyXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6ICdjb2Nvcy1tY3Atc2VydmVyJyxcclxuICAgICAgICAgICAgICAgICAgICBtZXRob2Q6ICdnZXRTY2VuZUhpZXJhcmNoeScsXHJcbiAgICAgICAgICAgICAgICAgICAgYXJnczogW2luY2x1ZGVDb21wb25lbnRzXVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnIyOiBhbnkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYEVkaXRvciBBUEkgZmFpbGVkOiAke2Vyci5tZXNzYWdlfTsgU2NlbmUgc2NyaXB0IGZhaWxlZDogJHtlcnIyLm1lc3NhZ2V9YCB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYnVpbGRIaWVyYXJjaHkobm9kZTogYW55LCBpbmNsdWRlQ29tcG9uZW50czogYm9vbGVhbik6IGFueSB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0OiBhbnkgPSB7XHJcbiAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcclxuICAgICAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxyXG4gICAgICAgICAgICB0eXBlOiBub2RlLnR5cGUsXHJcbiAgICAgICAgICAgIGFjdGl2ZTogbm9kZS5hY3RpdmUsXHJcbiAgICAgICAgICAgIGNoaWxkcmVuOiBub2RlLmNoaWxkcmVuPy5tYXAoKGNoaWxkOiBhbnkpID0+IHRoaXMuYnVpbGRIaWVyYXJjaHkoY2hpbGQsIGluY2x1ZGVDb21wb25lbnRzKSkgPz8gW11cclxuICAgICAgICB9O1xyXG4gICAgICAgIGlmIChpbmNsdWRlQ29tcG9uZW50cyAmJiBub2RlLl9fY29tcHNfXykge1xyXG4gICAgICAgICAgICByZXN1bHQuY29tcG9uZW50cyA9IG5vZGUuX19jb21wc19fLm1hcCgoY29tcDogYW55KSA9PiAoe1xyXG4gICAgICAgICAgICAgICAgdHlwZTogY29tcC5fX3R5cGVfXyA/PyAnVW5rbm93bicsXHJcbiAgICAgICAgICAgICAgICBlbmFibGVkOiBjb21wLmVuYWJsZWQgPz8gdHJ1ZVxyXG4gICAgICAgICAgICB9KSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBzYXZlU2NlbmVBcygpOiBQcm9taXNlPFRvb2xSZXNwb25zZT4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGF3YWl0IChFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0IGFzIGFueSkoJ3NjZW5lJywgJ3NhdmUtYXMtc2NlbmUnKTtcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBkYXRhOiB7IGRpYWxvZ09wZW5lZDogdHJ1ZSB9LFxyXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1NjZW5lIHNhdmUtYXMgZGlhbG9nIG9wZW5lZCcsXHJcbiAgICAgICAgICAgICAgICB2ZXJpZmljYXRpb25EYXRhOiB7IGRpYWxvZ09wZW5lZDogdHJ1ZSB9XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGNsb3NlU2NlbmUoKTogUHJvbWlzZTxUb29sUmVzcG9uc2U+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdjbG9zZS1zY2VuZScpO1xyXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnU2NlbmUgY2xvc2VkIHN1Y2Nlc3NmdWxseScgfTtcclxuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYnVpbGRTY2VuZVRlbXBsYXRlKHNjZW5lTmFtZTogc3RyaW5nKTogYW55W10ge1xyXG4gICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICdfX3R5cGVfXyc6ICdjYy5TY2VuZUFzc2V0JywgJ19uYW1lJzogc2NlbmVOYW1lLCAnX29iakZsYWdzJzogMCxcclxuICAgICAgICAgICAgICAgICdfX2VkaXRvckV4dHJhc19fJzoge30sICdfbmF0aXZlJzogJycsICdzY2VuZSc6IHsgJ19faWRfXyc6IDEgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAnX190eXBlX18nOiAnY2MuU2NlbmUnLCAnX25hbWUnOiBzY2VuZU5hbWUsICdfb2JqRmxhZ3MnOiAwLFxyXG4gICAgICAgICAgICAgICAgJ19fZWRpdG9yRXh0cmFzX18nOiB7fSwgJ19wYXJlbnQnOiBudWxsLCAnX2NoaWxkcmVuJzogW10sXHJcbiAgICAgICAgICAgICAgICAnX2FjdGl2ZSc6IHRydWUsICdfY29tcG9uZW50cyc6IFtdLCAnX3ByZWZhYic6IG51bGwsXHJcbiAgICAgICAgICAgICAgICAnX2xwb3MnOiB7ICdfX3R5cGVfXyc6ICdjYy5WZWMzJywgJ3gnOiAwLCAneSc6IDAsICd6JzogMCB9LFxyXG4gICAgICAgICAgICAgICAgJ19scm90JzogeyAnX190eXBlX18nOiAnY2MuUXVhdCcsICd4JzogMCwgJ3knOiAwLCAneic6IDAsICd3JzogMSB9LFxyXG4gICAgICAgICAgICAgICAgJ19sc2NhbGUnOiB7ICdfX3R5cGVfXyc6ICdjYy5WZWMzJywgJ3gnOiAxLCAneSc6IDEsICd6JzogMSB9LFxyXG4gICAgICAgICAgICAgICAgJ19tb2JpbGl0eSc6IDAsICdfbGF5ZXInOiAxMDczNzQxODI0LFxyXG4gICAgICAgICAgICAgICAgJ19ldWxlcic6IHsgJ19fdHlwZV9fJzogJ2NjLlZlYzMnLCAneCc6IDAsICd5JzogMCwgJ3onOiAwIH0sXHJcbiAgICAgICAgICAgICAgICAnYXV0b1JlbGVhc2VBc3NldHMnOiBmYWxzZSwgJ19nbG9iYWxzJzogeyAnX19pZF9fJzogMiB9LCAnX2lkJzogJ3NjZW5lJ1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAnX190eXBlX18nOiAnY2MuU2NlbmVHbG9iYWxzJyxcclxuICAgICAgICAgICAgICAgICdhbWJpZW50JzogeyAnX19pZF9fJzogMyB9LCAnc2t5Ym94JzogeyAnX19pZF9fJzogNCB9LFxyXG4gICAgICAgICAgICAgICAgJ2ZvZyc6IHsgJ19faWRfXyc6IDUgfSwgJ29jdHJlZSc6IHsgJ19faWRfXyc6IDYgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAnX190eXBlX18nOiAnY2MuQW1iaWVudEluZm8nLFxyXG4gICAgICAgICAgICAgICAgJ19za3lDb2xvckhEUic6IHsgJ19fdHlwZV9fJzogJ2NjLlZlYzQnLCAneCc6IDAuMiwgJ3knOiAwLjUsICd6JzogMC44LCAndyc6IDAuNTIwODMzIH0sXHJcbiAgICAgICAgICAgICAgICAnX3NreUNvbG9yJzogeyAnX190eXBlX18nOiAnY2MuVmVjNCcsICd4JzogMC4yLCAneSc6IDAuNSwgJ3onOiAwLjgsICd3JzogMC41MjA4MzMgfSxcclxuICAgICAgICAgICAgICAgICdfc2t5SWxsdW1IRFInOiAyMDAwMCwgJ19za3lJbGx1bSc6IDIwMDAwLFxyXG4gICAgICAgICAgICAgICAgJ19ncm91bmRBbGJlZG9IRFInOiB7ICdfX3R5cGVfXyc6ICdjYy5WZWM0JywgJ3gnOiAwLjIsICd5JzogMC4yLCAneic6IDAuMiwgJ3cnOiAxIH0sXHJcbiAgICAgICAgICAgICAgICAnX2dyb3VuZEFsYmVkbyc6IHsgJ19fdHlwZV9fJzogJ2NjLlZlYzQnLCAneCc6IDAuMiwgJ3knOiAwLjIsICd6JzogMC4yLCAndyc6IDEgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAnX190eXBlX18nOiAnY2MuU2t5Ym94SW5mbycsXHJcbiAgICAgICAgICAgICAgICAnX2VudkxpZ2h0aW5nVHlwZSc6IDAsICdfZW52bWFwSERSJzogbnVsbCwgJ19lbnZtYXAnOiBudWxsLFxyXG4gICAgICAgICAgICAgICAgJ19lbnZtYXBMb2RDb3VudCc6IDAsICdfZGlmZnVzZU1hcEhEUic6IG51bGwsICdfZGlmZnVzZU1hcCc6IG51bGwsXHJcbiAgICAgICAgICAgICAgICAnX2VuYWJsZWQnOiBmYWxzZSwgJ191c2VIRFInOiB0cnVlLCAnX2VkaXRhYmxlTWF0ZXJpYWwnOiBudWxsLFxyXG4gICAgICAgICAgICAgICAgJ19yZWZsZWN0aW9uSERSJzogbnVsbCwgJ19yZWZsZWN0aW9uTWFwJzogbnVsbCwgJ19yb3RhdGlvbkFuZ2xlJzogMFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAnX190eXBlX18nOiAnY2MuRm9nSW5mbycsICdfdHlwZSc6IDAsXHJcbiAgICAgICAgICAgICAgICAnX2ZvZ0NvbG9yJzogeyAnX190eXBlX18nOiAnY2MuQ29sb3InLCAncic6IDIwMCwgJ2cnOiAyMDAsICdiJzogMjAwLCAnYSc6IDI1NSB9LFxyXG4gICAgICAgICAgICAgICAgJ19lbmFibGVkJzogZmFsc2UsICdfZm9nRGVuc2l0eSc6IDAuMywgJ19mb2dTdGFydCc6IDAuNSwgJ19mb2dFbmQnOiAzMDAsXHJcbiAgICAgICAgICAgICAgICAnX2ZvZ0F0dGVuJzogNSwgJ19mb2dUb3AnOiAxLjUsICdfZm9nUmFuZ2UnOiAxLjIsICdfYWNjdXJhdGUnOiBmYWxzZVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAnX190eXBlX18nOiAnY2MuT2N0cmVlSW5mbycsICdfZW5hYmxlZCc6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgJ19taW5Qb3MnOiB7ICdfX3R5cGVfXyc6ICdjYy5WZWMzJywgJ3gnOiAtMTAyNCwgJ3knOiAtMTAyNCwgJ3onOiAtMTAyNCB9LFxyXG4gICAgICAgICAgICAgICAgJ19tYXhQb3MnOiB7ICdfX3R5cGVfXyc6ICdjYy5WZWMzJywgJ3gnOiAxMDI0LCAneSc6IDEwMjQsICd6JzogMTAyNCB9LFxyXG4gICAgICAgICAgICAgICAgJ19kZXB0aCc6IDhcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIF07XHJcbiAgICB9XHJcbn1cclxuIl19