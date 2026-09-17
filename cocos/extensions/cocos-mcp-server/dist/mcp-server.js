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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPServer = void 0;
const http = __importStar(require("http"));
const crypto_1 = require("crypto");
const ajv_1 = __importDefault(require("ajv"));
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const scene_tools_1 = require("./tools/scene-tools");
const node_tools_1 = require("./tools/node-tools");
const component_tools_1 = require("./tools/component-tools");
const prefab_tools_1 = require("./tools/prefab-tools");
const project_tools_1 = require("./tools/project-tools");
const debug_tools_1 = require("./tools/debug-tools");
const preferences_tools_1 = require("./tools/preferences-tools");
const server_tools_1 = require("./tools/server-tools");
const broadcast_tools_1 = require("./tools/broadcast-tools");
const scene_advanced_tools_1 = require("./tools/scene-advanced-tools");
const scene_view_tools_1 = require("./tools/scene-view-tools");
const reference_image_tools_1 = require("./tools/reference-image-tools");
const asset_advanced_tools_1 = require("./tools/asset-advanced-tools");
const validation_tools_1 = require("./tools/validation-tools");
const tool_security_1 = require("./tools/tool-security");
const logger_1 = require("./logger");
const SERVER_VERSION = '1.0.0';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const TOOL_OUTPUT_SCHEMA = {
    type: 'object',
    properties: {
        success: { type: 'boolean' },
        data: {},
        message: { type: 'string' },
        error: { type: 'string' },
        instruction: { type: 'string' },
        warning: { type: 'string' },
        verificationData: {},
        updatedProperties: {
            type: 'array',
            items: { type: 'string' }
        }
    },
    required: ['success'],
    additionalProperties: true
};
class RequestBodyTooLargeError extends Error {
}
class ToolDisabledError extends Error {
}
class ToolConfirmationError extends Error {
}
class ToolTimeoutError extends Error {
}
class ToolValidationError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
    }
}
class MCPServer {
    constructor(settings) {
        this.tools = {};
        this.registeredTools = new Map();
        this.validators = new Map();
        this.ajv = new ajv_1.default({ allErrors: true, strict: false, useDefaults: true });
        this.protocolRuntimes = new Map();
        this.httpServer = null;
        this.toolsList = [];
        this.enabledToolNames = null;
        this.activeRequests = 0;
        this.sessionCleanupTimer = null;
        this.settings = settings;
        (0, logger_1.setDebugLogging)(settings.enableDebugLog);
        this.initializeTools();
        this.rebuildToolsList();
    }
    initializeTools() {
        this.tools.scene = new scene_tools_1.SceneTools();
        this.tools.node = new node_tools_1.NodeTools();
        this.tools.component = new component_tools_1.ComponentTools();
        this.tools.prefab = new prefab_tools_1.PrefabTools();
        this.tools.project = new project_tools_1.ProjectTools();
        this.tools.debug = new debug_tools_1.DebugTools();
        this.tools.preferences = new preferences_tools_1.PreferencesTools();
        this.tools.server = new server_tools_1.ServerTools();
        this.tools.broadcast = new broadcast_tools_1.BroadcastTools();
        this.tools.sceneAdvanced = new scene_advanced_tools_1.SceneAdvancedTools();
        this.tools.sceneView = new scene_view_tools_1.SceneViewTools();
        this.tools.referenceImage = new reference_image_tools_1.ReferenceImageTools();
        this.tools.assetAdvanced = new asset_advanced_tools_1.AssetAdvancedTools();
        this.tools.validation = new validation_tools_1.ValidationTools();
        for (const [category, executor] of Object.entries(this.tools)) {
            for (const rawDefinition of executor.getTools()) {
                const qualifiedName = `${category}_${rawDefinition.name}`;
                const definition = this.decorateToolDefinition(qualifiedName, rawDefinition);
                this.registeredTools.set(qualifiedName, {
                    category,
                    methodName: rawDefinition.name,
                    executor,
                    definition
                });
            }
        }
    }
    decorateToolDefinition(qualifiedName, definition) {
        var _a, _b, _c, _d, _e, _f;
        const inputSchema = Object.assign(Object.assign({}, definition.inputSchema), { properties: Object.assign({}, ((_b = (_a = definition.inputSchema) === null || _a === void 0 ? void 0 : _a.properties) !== null && _b !== void 0 ? _b : {})) });
        if ((0, tool_security_1.requiresConfirmation)(qualifiedName)) {
            inputSchema.properties.confirm = {
                type: 'boolean',
                const: true,
                description: 'Must be true to confirm this destructive or high-risk operation'
            };
            inputSchema.required = Array.from(new Set([
                ...((_d = (_c = definition.inputSchema) === null || _c === void 0 ? void 0 : _c.required) !== null && _d !== void 0 ? _d : []),
                'confirm'
            ]));
        }
        return Object.assign(Object.assign({}, definition), { name: qualifiedName, inputSchema, outputSchema: (_e = definition.outputSchema) !== null && _e !== void 0 ? _e : TOOL_OUTPUT_SCHEMA, annotations: Object.assign(Object.assign({}, (0, tool_security_1.getToolAnnotations)(qualifiedName)), ((_f = definition.annotations) !== null && _f !== void 0 ? _f : {})) });
    }
    async start() {
        var _a, _b;
        if (this.httpServer)
            return;
        const server = http.createServer((req, res) => {
            void this.handleHttpRequest(req, res);
        });
        server.requestTimeout = this.settings.toolExecutionTimeoutMs + 5000;
        server.headersTimeout = Math.min(server.requestTimeout, 15000);
        server.keepAliveTimeout = 5000;
        server.maxRequestsPerSocket = 100;
        try {
            await new Promise((resolve, reject) => {
                const onError = (error) => {
                    server.off('listening', onListening);
                    reject(error);
                };
                const onListening = () => {
                    server.off('error', onError);
                    resolve();
                };
                server.once('error', onError);
                server.once('listening', onListening);
                server.listen(this.settings.port, '127.0.0.1');
            });
            this.httpServer = server;
            const sessionIdleTimeoutMs = this.getSessionIdleTimeoutMs();
            const cleanupInterval = Math.max(250, Math.min(Math.floor(sessionIdleTimeoutMs / 2), 60000));
            this.sessionCleanupTimer = setInterval(() => this.removeExpiredProtocolRuntimes(), cleanupInterval);
            (_b = (_a = this.sessionCleanupTimer).unref) === null || _b === void 0 ? void 0 : _b.call(_a);
            this.debug(`Started on http://127.0.0.1:${this.getListeningPort()}`);
        }
        catch (error) {
            throw error;
        }
    }
    async stop() {
        const server = this.httpServer;
        this.httpServer = null;
        if (this.sessionCleanupTimer) {
            clearInterval(this.sessionCleanupTimer);
            this.sessionCleanupTimer = null;
        }
        await this.closeAllProtocolRuntimes();
        if (server) {
            await new Promise((resolve, reject) => {
                var _a;
                server.close(error => error ? reject(error) : resolve());
                (_a = server.closeIdleConnections) === null || _a === void 0 ? void 0 : _a.call(server);
            });
        }
        this.debug('Stopped');
    }
    getStatus() {
        var _a, _b;
        return {
            running: (_b = (_a = this.httpServer) === null || _a === void 0 ? void 0 : _a.listening) !== null && _b !== void 0 ? _b : false,
            port: this.getListeningPort(),
            clients: this.protocolRuntimes.size
        };
    }
    getSettings() {
        return Object.assign(Object.assign({}, this.settings), { allowedOrigins: [...this.settings.allowedOrigins] });
    }
    getAvailableTools() {
        return [...this.toolsList];
    }
    getFilteredTools(enabledTools) {
        const enabledSet = new Set(enabledTools.map(tool => `${tool.category}_${tool.name}`));
        return Array.from(this.registeredTools.entries())
            .filter(([name]) => enabledSet.has(name))
            .map(([, tool]) => tool.definition);
    }
    updateEnabledTools(enabledTools) {
        this.enabledToolNames = new Set(enabledTools.map(tool => `${tool.category}_${tool.name}`));
        this.rebuildToolsList();
        for (const runtime of this.protocolRuntimes.values()) {
            runtime.server.sendToolListChanged().catch(error => {
                this.debug(`Unable to send tools/list_changed: ${this.getErrorMessage(error)}`);
            });
        }
    }
    async executeToolCall(toolName, args) {
        var _a;
        const registered = this.registeredTools.get(toolName);
        if (!registered) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        if (this.enabledToolNames !== null && !this.enabledToolNames.has(toolName)) {
            throw new ToolDisabledError(`Tool is disabled: ${toolName}`);
        }
        const normalizedArgs = this.isRecord(args) ? Object.assign({}, args) : {};
        const validator = this.getValidator(toolName, registered.definition.inputSchema);
        if (!validator(normalizedArgs)) {
            throw new ToolValidationError(`Invalid arguments for tool ${toolName}`, (_a = validator.errors) !== null && _a !== void 0 ? _a : []);
        }
        if ((0, tool_security_1.requiresConfirmation)(toolName) && normalizedArgs.confirm !== true) {
            throw new ToolConfirmationError(`Tool ${toolName} requires confirm=true`);
        }
        delete normalizedArgs.confirm;
        let timeout;
        try {
            return await Promise.race([
                registered.executor.execute(registered.methodName, normalizedArgs),
                new Promise((_, reject) => {
                    timeout = setTimeout(() => {
                        reject(new ToolTimeoutError(`Tool ${toolName} timed out after ${this.settings.toolExecutionTimeoutMs}ms`));
                    }, this.settings.toolExecutionTimeoutMs);
                })
            ]);
        }
        finally {
            if (timeout)
                clearTimeout(timeout);
        }
    }
    async createProtocolRuntime() {
        const protocolServer = new index_js_1.Server({ name: 'cocos-mcp-server', version: SERVER_VERSION }, {
            capabilities: {
                tools: { listChanged: true }
            },
            instructions: 'Use read-only query tools before mutation tools. High-risk tools require confirm=true.'
        });
        protocolServer.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
            tools: this.getAvailableTools()
        }));
        protocolServer.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            var _a;
            try {
                const result = await this.executeToolCall(request.params.name, (_a = request.params.arguments) !== null && _a !== void 0 ? _a : {});
                return this.toCallToolResult(result);
            }
            catch (error) {
                return this.toCallToolResult(this.toToolError(error));
            }
        });
        const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
            sessionIdGenerator: crypto_1.randomUUID,
            enableJsonResponse: true
        });
        await protocolServer.connect(transport);
        return {
            server: protocolServer,
            transport,
            lastActivity: Date.now()
        };
    }
    async closeProtocolRuntime(runtime) {
        await runtime.server.close().catch(() => undefined);
    }
    async closeAllProtocolRuntimes() {
        const runtimes = Array.from(this.protocolRuntimes.values());
        this.protocolRuntimes.clear();
        await Promise.all(runtimes.map(runtime => this.closeProtocolRuntime(runtime)));
    }
    rebuildToolsList() {
        this.toolsList = Array.from(this.registeredTools.entries())
            .filter(([name]) => this.enabledToolNames === null || this.enabledToolNames.has(name))
            .map(([, tool]) => tool.definition);
    }
    getValidator(toolName, schema) {
        let validator = this.validators.get(toolName);
        if (!validator) {
            validator = this.ajv.compile(schema);
            this.validators.set(toolName, validator);
        }
        return validator;
    }
    async handleHttpRequest(req, res) {
        var _a, _b, _c;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        try {
            if (!this.isAllowedHost(req.headers.host)) {
                this.sendJson(res, 403, { error: 'Forbidden host' });
                return;
            }
            const origin = this.getHeader(req.headers.origin);
            if (origin && !this.isAllowedOrigin(origin)) {
                this.sendJson(res, 403, { error: 'Forbidden origin' });
                return;
            }
            if (origin) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
            }
            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, X-MCP-Token');
                res.writeHead(204);
                res.end();
                return;
            }
            const pathname = new URL((_a = req.url) !== null && _a !== void 0 ? _a : '/', 'http://localhost').pathname;
            if (pathname === '/health' && req.method === 'GET') {
                this.sendJson(res, 200, {
                    status: 'ok',
                    running: (_c = (_b = this.httpServer) === null || _b === void 0 ? void 0 : _b.listening) !== null && _c !== void 0 ? _c : false,
                    tools: this.toolsList.length,
                    sessions: this.protocolRuntimes.size,
                    activeRequests: this.activeRequests
                });
                return;
            }
            if (!this.isAuthenticated(req)) {
                res.setHeader('WWW-Authenticate', 'Bearer realm="cocos-mcp-server"');
                this.sendJson(res, 401, { error: 'Unauthorized' });
                return;
            }
            if (this.activeRequests >= this.settings.maxConnections) {
                this.sendJson(res, 429, { error: 'Too many active requests' });
                return;
            }
            this.activeRequests++;
            try {
                if (pathname === '/mcp') {
                    await this.handleMCPRequest(req, res);
                    return;
                }
                if (!this.settings.enableRestApi) {
                    this.sendJson(res, 404, { error: 'Not found' });
                    return;
                }
                if (pathname === '/api/tools' && req.method === 'GET') {
                    this.sendJson(res, 200, { tools: this.getSimplifiedToolsList() });
                    return;
                }
                if (pathname.startsWith('/api/') && req.method === 'POST') {
                    await this.handleSimpleAPIRequest(req, res, pathname);
                    return;
                }
                this.sendJson(res, 404, { error: 'Not found' });
            }
            finally {
                this.activeRequests--;
            }
        }
        catch (error) {
            if (res.headersSent) {
                res.end();
                return;
            }
            if (error instanceof RequestBodyTooLargeError) {
                this.sendJson(res, 413, { error: error.message });
                return;
            }
            (0, logger_1.debugLog)('MCPServer', 'Unhandled request error', error);
            this.sendJson(res, 500, { error: 'Internal server error' });
        }
    }
    async handleMCPRequest(req, res) {
        let parsedBody;
        if (req.method === 'POST') {
            const body = await this.readRequestBody(req);
            try {
                parsedBody = JSON.parse(body);
            }
            catch (error) {
                this.sendJson(res, 400, {
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: -32700,
                        message: `Parse error: ${this.getErrorMessage(error)}`
                    }
                });
                return;
            }
        }
        this.removeExpiredProtocolRuntimes();
        if (req.method === 'POST' && this.isInitializeRequest(parsedBody)) {
            const maxSessions = Number.isFinite(this.settings.maxSessions)
                ? this.settings.maxSessions
                : this.settings.maxConnections;
            if (this.protocolRuntimes.size >= maxSessions) {
                this.sendJson(res, 429, { error: 'Maximum MCP sessions reached' });
                return;
            }
            const runtime = await this.createProtocolRuntime();
            try {
                await runtime.transport.handleRequest(req, res, parsedBody);
                const sessionId = runtime.transport.sessionId;
                if (!sessionId) {
                    throw new Error('MCP initialization did not create a session');
                }
                runtime.lastActivity = Date.now();
                this.protocolRuntimes.set(sessionId, runtime);
            }
            catch (error) {
                await this.closeProtocolRuntime(runtime);
                throw error;
            }
            return;
        }
        const sessionId = this.getHeader(req.headers['mcp-session-id']);
        const runtime = sessionId ? this.protocolRuntimes.get(sessionId) : undefined;
        if (!runtime) {
            this.sendJson(res, sessionId ? 404 : 400, {
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32000,
                    message: sessionId ? 'MCP session not found' : 'MCP-Session-Id header is required'
                }
            });
            return;
        }
        runtime.lastActivity = Date.now();
        await runtime.transport.handleRequest(req, res, parsedBody);
        if (req.method === 'DELETE') {
            this.protocolRuntimes.delete(sessionId);
            await this.closeProtocolRuntime(runtime);
        }
    }
    removeExpiredProtocolRuntimes() {
        const expirationTime = Date.now() - this.getSessionIdleTimeoutMs();
        for (const [sessionId, runtime] of this.protocolRuntimes) {
            if (runtime.lastActivity < expirationTime) {
                this.protocolRuntimes.delete(sessionId);
                void this.closeProtocolRuntime(runtime);
            }
        }
    }
    isInitializeRequest(body) {
        if (Array.isArray(body)) {
            return body.some(item => this.isInitializeRequest(item));
        }
        return this.isRecord(body) && body.method === 'initialize';
    }
    async handleSimpleAPIRequest(req, res, pathname) {
        const pathParts = pathname.split('/').filter(Boolean);
        if (pathParts.length !== 3) {
            this.sendJson(res, 400, { error: 'Use /api/{category}/{tool_name}' });
            return;
        }
        let params = {};
        const body = await this.readRequestBody(req);
        if (body) {
            try {
                params = JSON.parse(body);
            }
            catch (error) {
                this.sendJson(res, 400, {
                    error: 'Invalid JSON in request body',
                    details: this.getErrorMessage(error)
                });
                return;
            }
        }
        const fullToolName = `${pathParts[1]}_${pathParts[2]}`;
        try {
            const result = await this.executeToolCall(fullToolName, params);
            this.sendJson(res, result.success ? 200 : 422, {
                success: result.success,
                tool: fullToolName,
                result
            });
        }
        catch (error) {
            const toolError = this.toToolError(error);
            this.sendJson(res, this.getToolErrorStatus(error), {
                success: false,
                tool: fullToolName,
                error: toolError.error,
                details: toolError.data
            });
        }
    }
    readRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            let size = 0;
            let settled = false;
            req.on('data', chunk => {
                if (settled)
                    return;
                size += chunk.length;
                if (size > this.settings.requestBodyLimitBytes) {
                    settled = true;
                    reject(new RequestBodyTooLargeError(`Request body exceeds ${this.settings.requestBodyLimitBytes} bytes`));
                    req.resume();
                    return;
                }
                body += chunk.toString('utf8');
            });
            req.on('end', () => {
                if (!settled)
                    resolve(body);
            });
            req.on('error', error => {
                if (!settled)
                    reject(error);
            });
        });
    }
    isAllowedHost(hostHeader) {
        if (!hostHeader)
            return false;
        try {
            const hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
            return LOOPBACK_HOSTS.has(hostname);
        }
        catch (_a) {
            return false;
        }
    }
    isAllowedOrigin(origin) {
        return this.settings.allowedOrigins.some(allowed => {
            if (allowed.endsWith('*')) {
                return origin.startsWith(allowed.slice(0, -1));
            }
            return allowed === origin;
        });
    }
    isAuthenticated(req) {
        const authorization = this.getHeader(req.headers.authorization);
        const bearerToken = (authorization === null || authorization === void 0 ? void 0 : authorization.startsWith('Bearer '))
            ? authorization.slice('Bearer '.length).trim()
            : undefined;
        const token = bearerToken !== null && bearerToken !== void 0 ? bearerToken : this.getHeader(req.headers['x-mcp-token']);
        if (!token)
            return false;
        const expected = Buffer.from(this.settings.authToken);
        const provided = Buffer.from(token);
        return expected.length === provided.length && (0, crypto_1.timingSafeEqual)(expected, provided);
    }
    getListeningPort() {
        var _a;
        const address = (_a = this.httpServer) === null || _a === void 0 ? void 0 : _a.address();
        return address && typeof address === 'object' ? address.port : this.settings.port;
    }
    getSessionIdleTimeoutMs() {
        return Number.isFinite(this.settings.sessionIdleTimeoutMs)
            ? this.settings.sessionIdleTimeoutMs
            : 30 * 60 * 1000;
    }
    getSimplifiedToolsList() {
        return this.toolsList.map(tool => {
            const underscoreIdx = tool.name.indexOf('_');
            const category = tool.name.substring(0, underscoreIdx);
            const toolName = tool.name.substring(underscoreIdx + 1);
            return {
                name: tool.name,
                category,
                toolName,
                description: tool.description,
                annotations: tool.annotations,
                apiPath: `/api/${category}/${toolName}`,
                curlExample: this.generateCurlExample(category, toolName, tool.inputSchema)
            };
        });
    }
    generateCurlExample(category, toolName, schema) {
        const sampleParams = this.generateSampleParams(schema);
        const jsonString = JSON.stringify(sampleParams, null, 2);
        return `curl -X POST http://127.0.0.1:${this.getListeningPort()}/api/${category}/${toolName} \\\n  -H "Authorization: Bearer ${this.settings.authToken}" \\\n  -H "Content-Type: application/json" \\\n  -d '${jsonString}'`;
    }
    generateSampleParams(schema) {
        var _a, _b, _c, _d, _e, _f;
        if (!(schema === null || schema === void 0 ? void 0 : schema.properties))
            return {};
        const sample = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
            if (prop.const !== undefined) {
                sample[key] = prop.const;
                continue;
            }
            switch (prop.type) {
                case 'string':
                    sample[key] = (_a = prop.default) !== null && _a !== void 0 ? _a : 'example_string';
                    break;
                case 'number':
                    sample[key] = (_b = prop.default) !== null && _b !== void 0 ? _b : 0;
                    break;
                case 'boolean':
                    sample[key] = (_c = prop.default) !== null && _c !== void 0 ? _c : true;
                    break;
                case 'array':
                    sample[key] = (_d = prop.default) !== null && _d !== void 0 ? _d : [];
                    break;
                case 'object':
                    sample[key] = (_e = prop.default) !== null && _e !== void 0 ? _e : {};
                    break;
                default: sample[key] = (_f = prop.default) !== null && _f !== void 0 ? _f : null;
            }
        }
        return sample;
    }
    toCallToolResult(result) {
        return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result,
            isError: !result.success
        };
    }
    toToolError(error) {
        const response = {
            success: false,
            error: this.getErrorMessage(error)
        };
        if (error instanceof ToolValidationError) {
            response.data = { validationErrors: error.details };
        }
        return response;
    }
    getToolErrorStatus(error) {
        if (error instanceof ToolDisabledError)
            return 403;
        if (error instanceof ToolConfirmationError || error instanceof ToolValidationError)
            return 400;
        if (error instanceof ToolTimeoutError)
            return 504;
        return 404;
    }
    sendJson(res, status, body) {
        if (!res.hasHeader('Content-Type')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        res.writeHead(status);
        res.end(JSON.stringify(body));
    }
    getHeader(value) {
        return Array.isArray(value) ? value[0] : value;
    }
    isRecord(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
    getErrorMessage(error) {
        return error instanceof Error ? error.message : String(error);
    }
    debug(message) {
        (0, logger_1.debugLog)('MCPServer', message);
    }
}
exports.MCPServer = MCPServer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwLXNlcnZlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9tY3Atc2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJDQUE2QjtBQUM3QixtQ0FBcUQ7QUFDckQsOENBQTRDO0FBQzVDLHdFQUF3RjtBQUN4RiwwRkFBbUc7QUFDbkcsaUVBQW1HO0FBU25HLHFEQUFpRDtBQUNqRCxtREFBK0M7QUFDL0MsNkRBQXlEO0FBQ3pELHVEQUFtRDtBQUNuRCx5REFBcUQ7QUFDckQscURBQWlEO0FBQ2pELGlFQUE2RDtBQUM3RCx1REFBbUQ7QUFDbkQsNkRBQXlEO0FBQ3pELHVFQUFrRTtBQUNsRSwrREFBMEQ7QUFDMUQseUVBQW9FO0FBQ3BFLHVFQUFrRTtBQUNsRSwrREFBMkQ7QUFDM0QseURBQWlGO0FBQ2pGLHFDQUFxRDtBQUVyRCxNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUM7QUFDL0IsTUFBTSxjQUFjLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxXQUFXLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBRTNFLE1BQU0sa0JBQWtCLEdBQUc7SUFDdkIsSUFBSSxFQUFFLFFBQVE7SUFDZCxVQUFVLEVBQUU7UUFDUixPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFO1FBQzVCLElBQUksRUFBRSxFQUFFO1FBQ1IsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTtRQUMzQixLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO1FBQ3pCLFdBQVcsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7UUFDL0IsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTtRQUMzQixnQkFBZ0IsRUFBRSxFQUFFO1FBQ3BCLGlCQUFpQixFQUFFO1lBQ2YsSUFBSSxFQUFFLE9B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LENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRU8sS0FBSyxDQUFDLE9BQWU7UUFDekIsSUFBQSxpQkFBUSxFQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNuQyxDQUFDO0NBQ0o7QUF0cEJELDhCQXNwQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xyXG5pbXBvcnQgeyByYW5kb21VVUlELCB0aW1pbmdTYWZlRXF1YWwgfSBmcm9tICdjcnlwdG8nO1xyXG5pbXBvcnQgQWp2LCB7IFZhbGlkYXRlRnVuY3Rpb24gfSBmcm9tICdhanYnO1xyXG5pbXBvcnQgeyBTZXJ2ZXIgYXMgTUNQUHJvdG9jb2xTZXJ2ZXIgfSBmcm9tICdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3NlcnZlci9pbmRleC5qcyc7XHJcbmltcG9ydCB7IFN0cmVhbWFibGVIVFRQU2VydmVyVHJhbnNwb3J0IH0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay9zZXJ2ZXIvc3RyZWFtYWJsZUh0dHAuanMnO1xyXG5pbXBvcnQgeyBDYWxsVG9vbFJlcXVlc3RTY2hlbWEsIExpc3RUb29sc1JlcXVlc3RTY2hlbWEgfSBmcm9tICdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3R5cGVzLmpzJztcclxuaW1wb3J0IHtcclxuICAgIE1DUFNlcnZlclNldHRpbmdzLFxyXG4gICAgU2VydmVyU3RhdHVzLFxyXG4gICAgVG9vbENvbmZpZyxcclxuICAgIFRvb2xEZWZpbml0aW9uLFxyXG4gICAgVG9vbEV4ZWN1dG9yLFxyXG4gICAgVG9vbFJlc3BvbnNlXHJcbn0gZnJvbSAnLi90eXBlcyc7XHJcbmltcG9ydCB7IFNjZW5lVG9vbHMgfSBmcm9tICcuL3Rvb2xzL3NjZW5lLXRvb2xzJztcclxuaW1wb3J0IHsgTm9kZVRvb2xzIH0gZnJvbSAnLi90b29scy9ub2RlLXRvb2xzJztcclxuaW1wb3J0IHsgQ29tcG9uZW50VG9vbHMgfSBmcm9tICcuL3Rvb2xzL2NvbXBvbmVudC10b29scyc7XHJcbmltcG9ydCB7IFByZWZhYlRvb2xzIH0gZnJvbSAnLi90b29scy9wcmVmYWItdG9vbHMnO1xyXG5pbXBvcnQgeyBQcm9qZWN0VG9vbHMgfSBmcm9tICcuL3Rvb2xzL3Byb2plY3QtdG9vbHMnO1xyXG5pbXBvcnQgeyBEZWJ1Z1Rvb2xzIH0gZnJvbSAnLi90b29scy9kZWJ1Zy10b29scyc7XHJcbmltcG9ydCB7IFByZWZlcmVuY2VzVG9vbHMgfSBmcm9tICcuL3Rvb2xzL3ByZWZlcmVuY2VzLXRvb2xzJztcclxuaW1wb3J0IHsgU2VydmVyVG9vbHMgfSBmcm9tICcuL3Rvb2xzL3NlcnZlci10b29scyc7XHJcbmltcG9ydCB7IEJyb2FkY2FzdFRvb2xzIH0gZnJvbSAnLi90b29scy9icm9hZGNhc3QtdG9vbHMnO1xyXG5pbXBvcnQgeyBTY2VuZUFkdmFuY2VkVG9vbHMgfSBmcm9tICcuL3Rvb2xzL3NjZW5lLWFkdmFuY2VkLXRvb2xzJztcclxuaW1wb3J0IHsgU2NlbmVWaWV3VG9vbHMgfSBmcm9tICcuL3Rvb2xzL3NjZW5lLXZpZXctdG9vbHMnO1xyXG5pbXBvcnQgeyBSZWZlcmVuY2VJbWFnZVRvb2xzIH0gZnJvbSAnLi90b29scy9yZWZlcmVuY2UtaW1hZ2UtdG9vbHMnO1xyXG5pbXBvcnQgeyBBc3NldEFkdmFuY2VkVG9vbHMgfSBmcm9tICcuL3Rvb2xzL2Fzc2V0LWFkdmFuY2VkLXRvb2xzJztcclxuaW1wb3J0IHsgVmFsaWRhdGlvblRvb2xzIH0gZnJvbSAnLi90b29scy92YWxpZGF0aW9uLXRvb2xzJztcclxuaW1wb3J0IHsgZ2V0VG9vbEFubm90YXRpb25zLCByZXF1aXJlc0NvbmZpcm1hdGlvbiB9IGZyb20gJy4vdG9vbHMvdG9vbC1zZWN1cml0eSc7XHJcbmltcG9ydCB7IGRlYnVnTG9nLCBzZXREZWJ1Z0xvZ2dpbmcgfSBmcm9tICcuL2xvZ2dlcic7XHJcblxyXG5jb25zdCBTRVJWRVJfVkVSU0lPTiA9ICcxLjAuMCc7XHJcbmNvbnN0IExPT1BCQUNLX0hPU1RTID0gbmV3IFNldChbJzEyNy4wLjAuMScsICdsb2NhbGhvc3QnLCAnOjoxJywgJ1s6OjFdJ10pO1xyXG5cclxuY29uc3QgVE9PTF9PVVRQVVRfU0NIRU1BID0ge1xyXG4gICAgdHlwZTogJ29iamVjdCcsXHJcbiAgICBwcm9wZXJ0aWVzOiB7XHJcbiAgICAgICAgc3VjY2VzczogeyB0eXBlOiAnYm9vbGVhbicgfSxcclxuICAgICAgICBkYXRhOiB7fSxcclxuICAgICAgICBtZXNzYWdlOiB7IHR5cGU6ICdzdHJpbmcnIH0sXHJcbiAgICAgICAgZXJyb3I6IHsgdHlwZTogJ3N0cmluZycgfSxcclxuICAgICAgICBpbnN0cnVjdGlvbjogeyB0eXBlOiAnc3RyaW5nJyB9LFxyXG4gICAgICAgIHdhcm5pbmc6IHsgdHlwZTogJ3N0cmluZycgfSxcclxuICAgICAgICB2ZXJpZmljYXRpb25EYXRhOiB7fSxcclxuICAgICAgICB1cGRhdGVkUHJvcGVydGllczoge1xyXG4gICAgICAgICAgICB0eXBlOiAnYXJyYXknLFxyXG4gICAgICAgICAgICBpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9XHJcbiAgICAgICAgfVxyXG4gICAgfSxcclxuICAgIHJlcXVpcmVkOiBbJ3N1Y2Nlc3MnXSxcclxuICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB0cnVlXHJcbn07XHJcblxyXG5pbnRlcmZhY2UgUmVnaXN0ZXJlZFRvb2wge1xyXG4gICAgY2F0ZWdvcnk6IHN0cmluZztcclxuICAgIG1ldGhvZE5hbWU6IHN0cmluZztcclxuICAgIGV4ZWN1dG9yOiBUb29sRXhlY3V0b3I7XHJcbiAgICBkZWZpbml0aW9uOiBUb29sRGVmaW5pdGlvbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFByb3RvY29sUnVudGltZSB7XHJcbiAgICBzZXJ2ZXI6IE1DUFByb3RvY29sU2VydmVyO1xyXG4gICAgdHJhbnNwb3J0OiBTdHJlYW1hYmxlSFRUUFNlcnZlclRyYW5zcG9ydDtcclxuICAgIGxhc3RBY3Rpdml0eTogbnVtYmVyO1xyXG59XHJcblxyXG5jbGFzcyBSZXF1ZXN0Qm9keVRvb0xhcmdlRXJyb3IgZXh0ZW5kcyBFcnJvciB7fVxyXG5jbGFzcyBUb29sRGlzYWJsZWRFcnJvciBleHRlbmRzIEVycm9yIHt9XHJcbmNsYXNzIFRvb2xDb25maXJtYXRpb25FcnJvciBleHRlbmRzIEVycm9yIHt9XHJcbmNsYXNzIFRvb2xUaW1lb3V0RXJyb3IgZXh0ZW5kcyBFcnJvciB7fVxyXG5cclxuY2xhc3MgVG9vbFZhbGlkYXRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcclxuICAgIGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZywgcHVibGljIHJlYWRvbmx5IGRldGFpbHM6IHVua25vd24pIHtcclxuICAgICAgICBzdXBlcihtZXNzYWdlKTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIE1DUFNlcnZlciB7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IHNldHRpbmdzOiBNQ1BTZXJ2ZXJTZXR0aW5ncztcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgdG9vbHM6IFJlY29yZDxzdHJpbmcsIFRvb2xFeGVjdXRvcj4gPSB7fTtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgcmVnaXN0ZXJlZFRvb2xzID0gbmV3IE1hcDxzdHJpbmcsIFJlZ2lzdGVyZWRUb29sPigpO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSB2YWxpZGF0b3JzID0gbmV3IE1hcDxzdHJpbmcsIFZhbGlkYXRlRnVuY3Rpb24+KCk7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGFqdiA9IG5ldyBBanYoeyBhbGxFcnJvcnM6IHRydWUsIHN0cmljdDogZmFsc2UsIHVzZURlZmF1bHRzOiB0cnVlIH0pO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBwcm90b2NvbFJ1bnRpbWVzID0gbmV3IE1hcDxzdHJpbmcsIFByb3RvY29sUnVudGltZT4oKTtcclxuICAgIHByaXZhdGUgaHR0cFNlcnZlcjogaHR0cC5TZXJ2ZXIgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgdG9vbHNMaXN0OiBUb29sRGVmaW5pdGlvbltdID0gW107XHJcbiAgICBwcml2YXRlIGVuYWJsZWRUb29sTmFtZXM6IFNldDxzdHJpbmc+IHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGFjdGl2ZVJlcXVlc3RzID0gMDtcclxuICAgIHByaXZhdGUgc2Vzc2lvbkNsZWFudXBUaW1lcjogTm9kZUpTLlRpbWVvdXQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihzZXR0aW5nczogTUNQU2VydmVyU2V0dGluZ3MpIHtcclxuICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XHJcbiAgICAgICAgc2V0RGVidWdMb2dnaW5nKHNldHRpbmdzLmVuYWJsZURlYnVnTG9nKTtcclxuICAgICAgICB0aGlzLmluaXRpYWxpemVUb29scygpO1xyXG4gICAgICAgIHRoaXMucmVidWlsZFRvb2xzTGlzdCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaW5pdGlhbGl6ZVRvb2xzKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMudG9vbHMuc2NlbmUgPSBuZXcgU2NlbmVUb29scygpO1xyXG4gICAgICAgIHRoaXMudG9vbHMubm9kZSA9IG5ldyBOb2RlVG9vbHMoKTtcclxuICAgICAgICB0aGlzLnRvb2xzLmNvbXBvbmVudCA9IG5ldyBDb21wb25lbnRUb29scygpO1xyXG4gICAgICAgIHRoaXMudG9vbHMucHJlZmFiID0gbmV3IFByZWZhYlRvb2xzKCk7XHJcbiAgICAgICAgdGhpcy50b29scy5wcm9qZWN0ID0gbmV3IFByb2plY3RUb29scygpO1xyXG4gICAgICAgIHRoaXMudG9vbHMuZGVidWcgPSBuZXcgRGVidWdUb29scygpO1xyXG4gICAgICAgIHRoaXMudG9vbHMucHJlZmVyZW5jZXMgPSBuZXcgUHJlZmVyZW5jZXNUb29scygpO1xyXG4gICAgICAgIHRoaXMudG9vbHMuc2VydmVyID0gbmV3IFNlcnZlclRvb2xzKCk7XHJcbiAgICAgICAgdGhpcy50b29scy5icm9hZGNhc3QgPSBuZXcgQnJvYWRjYXN0VG9vbHMoKTtcclxuICAgICAgICB0aGlzLnRvb2xzLnNjZW5lQWR2YW5jZWQgPSBuZXcgU2NlbmVBZHZhbmNlZFRvb2xzKCk7XHJcbiAgICAgICAgdGhpcy50b29scy5zY2VuZVZpZXcgPSBuZXcgU2NlbmVWaWV3VG9vbHMoKTtcclxuICAgICAgICB0aGlzLnRvb2xzLnJlZmVyZW5jZUltYWdlID0gbmV3IFJlZmVyZW5jZUltYWdlVG9vbHMoKTtcclxuICAgICAgICB0aGlzLnRvb2xzLmFzc2V0QWR2YW5jZWQgPSBuZXcgQXNzZXRBZHZhbmNlZFRvb2xzKCk7XHJcbiAgICAgICAgdGhpcy50b29scy52YWxpZGF0aW9uID0gbmV3IFZhbGlkYXRpb25Ub29scygpO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IFtjYXRlZ29yeSwgZXhlY3V0b3JdIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMudG9vbHMpKSB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgcmF3RGVmaW5pdGlvbiBvZiBleGVjdXRvci5nZXRUb29scygpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBxdWFsaWZpZWROYW1lID0gYCR7Y2F0ZWdvcnl9XyR7cmF3RGVmaW5pdGlvbi5uYW1lfWA7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkZWZpbml0aW9uID0gdGhpcy5kZWNvcmF0ZVRvb2xEZWZpbml0aW9uKHF1YWxpZmllZE5hbWUsIHJhd0RlZmluaXRpb24pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZWdpc3RlcmVkVG9vbHMuc2V0KHF1YWxpZmllZE5hbWUsIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeSxcclxuICAgICAgICAgICAgICAgICAgICBtZXRob2ROYW1lOiByYXdEZWZpbml0aW9uLm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgZXhlY3V0b3IsXHJcbiAgICAgICAgICAgICAgICAgICAgZGVmaW5pdGlvblxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkZWNvcmF0ZVRvb2xEZWZpbml0aW9uKHF1YWxpZmllZE5hbWU6IHN0cmluZywgZGVmaW5pdGlvbjogVG9vbERlZmluaXRpb24pOiBUb29sRGVmaW5pdGlvbiB7XHJcbiAgICAgICAgY29uc3QgaW5wdXRTY2hlbWEgPSB7XHJcbiAgICAgICAgICAgIC4uLmRlZmluaXRpb24uaW5wdXRTY2hlbWEsXHJcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHsgLi4uKGRlZmluaXRpb24uaW5wdXRTY2hlbWE/LnByb3BlcnRpZXMgPz8ge30pIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBpZiAocmVxdWlyZXNDb25maXJtYXRpb24ocXVhbGlmaWVkTmFtZSkpIHtcclxuICAgICAgICAgICAgaW5wdXRTY2hlbWEucHJvcGVydGllcy5jb25maXJtID0ge1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxyXG4gICAgICAgICAgICAgICAgY29uc3Q6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ011c3QgYmUgdHJ1ZSB0byBjb25maXJtIHRoaXMgZGVzdHJ1Y3RpdmUgb3IgaGlnaC1yaXNrIG9wZXJhdGlvbidcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW5wdXRTY2hlbWEucmVxdWlyZWQgPSBBcnJheS5mcm9tKG5ldyBTZXQoW1xyXG4gICAgICAgICAgICAgICAgLi4uKGRlZmluaXRpb24uaW5wdXRTY2hlbWE/LnJlcXVpcmVkID8/IFtdKSxcclxuICAgICAgICAgICAgICAgICdjb25maXJtJ1xyXG4gICAgICAgICAgICBdKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAuLi5kZWZpbml0aW9uLFxyXG4gICAgICAgICAgICBuYW1lOiBxdWFsaWZpZWROYW1lLFxyXG4gICAgICAgICAgICBpbnB1dFNjaGVtYSxcclxuICAgICAgICAgICAgb3V0cHV0U2NoZW1hOiBkZWZpbml0aW9uLm91dHB1dFNjaGVtYSA/PyBUT09MX09VVFBVVF9TQ0hFTUEsXHJcbiAgICAgICAgICAgIGFubm90YXRpb25zOiB7XHJcbiAgICAgICAgICAgICAgICAuLi5nZXRUb29sQW5ub3RhdGlvbnMocXVhbGlmaWVkTmFtZSksXHJcbiAgICAgICAgICAgICAgICAuLi4oZGVmaW5pdGlvbi5hbm5vdGF0aW9ucyA/PyB7fSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGlmICh0aGlzLmh0dHBTZXJ2ZXIpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3Qgc2VydmVyID0gaHR0cC5jcmVhdGVTZXJ2ZXIoKHJlcSwgcmVzKSA9PiB7XHJcbiAgICAgICAgICAgIHZvaWQgdGhpcy5oYW5kbGVIdHRwUmVxdWVzdChyZXEsIHJlcyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgc2VydmVyLnJlcXVlc3RUaW1lb3V0ID0gdGhpcy5zZXR0aW5ncy50b29sRXhlY3V0aW9uVGltZW91dE1zICsgNTAwMDtcclxuICAgICAgICBzZXJ2ZXIuaGVhZGVyc1RpbWVvdXQgPSBNYXRoLm1pbihzZXJ2ZXIucmVxdWVzdFRpbWVvdXQsIDE1MDAwKTtcclxuICAgICAgICBzZXJ2ZXIua2VlcEFsaXZlVGltZW91dCA9IDUwMDA7XHJcbiAgICAgICAgc2VydmVyLm1heFJlcXVlc3RzUGVyU29ja2V0ID0gMTAwO1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvbkVycm9yID0gKGVycm9yOiBFcnJvcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlcnZlci5vZmYoJ2xpc3RlbmluZycsIG9uTGlzdGVuaW5nKTtcclxuICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG9uTGlzdGVuaW5nID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlcnZlci5vZmYoJ2Vycm9yJywgb25FcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIHNlcnZlci5vbmNlKCdlcnJvcicsIG9uRXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgc2VydmVyLm9uY2UoJ2xpc3RlbmluZycsIG9uTGlzdGVuaW5nKTtcclxuICAgICAgICAgICAgICAgIHNlcnZlci5saXN0ZW4odGhpcy5zZXR0aW5ncy5wb3J0LCAnMTI3LjAuMC4xJyk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB0aGlzLmh0dHBTZXJ2ZXIgPSBzZXJ2ZXI7XHJcbiAgICAgICAgICAgIGNvbnN0IHNlc3Npb25JZGxlVGltZW91dE1zID0gdGhpcy5nZXRTZXNzaW9uSWRsZVRpbWVvdXRNcygpO1xyXG4gICAgICAgICAgICBjb25zdCBjbGVhbnVwSW50ZXJ2YWwgPSBNYXRoLm1heChcclxuICAgICAgICAgICAgICAgIDI1MCxcclxuICAgICAgICAgICAgICAgIE1hdGgubWluKE1hdGguZmxvb3Ioc2Vzc2lvbklkbGVUaW1lb3V0TXMgLyAyKSwgNjBfMDAwKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLnNlc3Npb25DbGVhbnVwVGltZXIgPSBzZXRJbnRlcnZhbChcclxuICAgICAgICAgICAgICAgICgpID0+IHRoaXMucmVtb3ZlRXhwaXJlZFByb3RvY29sUnVudGltZXMoKSxcclxuICAgICAgICAgICAgICAgIGNsZWFudXBJbnRlcnZhbFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLnNlc3Npb25DbGVhbnVwVGltZXIudW5yZWY/LigpO1xyXG4gICAgICAgICAgICB0aGlzLmRlYnVnKGBTdGFydGVkIG9uIGh0dHA6Ly8xMjcuMC4wLjE6JHt0aGlzLmdldExpc3RlbmluZ1BvcnQoKX1gKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3Qgc2VydmVyID0gdGhpcy5odHRwU2VydmVyO1xyXG4gICAgICAgIHRoaXMuaHR0cFNlcnZlciA9IG51bGw7XHJcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbkNsZWFudXBUaW1lcikge1xyXG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuc2Vzc2lvbkNsZWFudXBUaW1lcik7XHJcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbkNsZWFudXBUaW1lciA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF3YWl0IHRoaXMuY2xvc2VBbGxQcm90b2NvbFJ1bnRpbWVzKCk7XHJcblxyXG4gICAgICAgIGlmIChzZXJ2ZXIpIHtcclxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgc2VydmVyLmNsb3NlKGVycm9yID0+IGVycm9yID8gcmVqZWN0KGVycm9yKSA6IHJlc29sdmUoKSk7XHJcbiAgICAgICAgICAgICAgICBzZXJ2ZXIuY2xvc2VJZGxlQ29ubmVjdGlvbnM/LigpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZGVidWcoJ1N0b3BwZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZ2V0U3RhdHVzKCk6IFNlcnZlclN0YXR1cyB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgcnVubmluZzogdGhpcy5odHRwU2VydmVyPy5saXN0ZW5pbmcgPz8gZmFsc2UsXHJcbiAgICAgICAgICAgIHBvcnQ6IHRoaXMuZ2V0TGlzdGVuaW5nUG9ydCgpLFxyXG4gICAgICAgICAgICBjbGllbnRzOiB0aGlzLnByb3RvY29sUnVudGltZXMuc2l6ZVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGdldFNldHRpbmdzKCk6IE1DUFNlcnZlclNldHRpbmdzIHtcclxuICAgICAgICByZXR1cm4geyAuLi50aGlzLnNldHRpbmdzLCBhbGxvd2VkT3JpZ2luczogWy4uLnRoaXMuc2V0dGluZ3MuYWxsb3dlZE9yaWdpbnNdIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGdldEF2YWlsYWJsZVRvb2xzKCk6IFRvb2xEZWZpbml0aW9uW10ge1xyXG4gICAgICAgIHJldHVybiBbLi4udGhpcy50b29sc0xpc3RdO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBnZXRGaWx0ZXJlZFRvb2xzKGVuYWJsZWRUb29sczogVG9vbENvbmZpZ1tdKTogVG9vbERlZmluaXRpb25bXSB7XHJcbiAgICAgICAgY29uc3QgZW5hYmxlZFNldCA9IG5ldyBTZXQoZW5hYmxlZFRvb2xzLm1hcCh0b29sID0+IGAke3Rvb2wuY2F0ZWdvcnl9XyR7dG9vbC5uYW1lfWApKTtcclxuICAgICAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLnJlZ2lzdGVyZWRUb29scy5lbnRyaWVzKCkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKFtuYW1lXSkgPT4gZW5hYmxlZFNldC5oYXMobmFtZSkpXHJcbiAgICAgICAgICAgIC5tYXAoKFssIHRvb2xdKSA9PiB0b29sLmRlZmluaXRpb24pO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyB1cGRhdGVFbmFibGVkVG9vbHMoZW5hYmxlZFRvb2xzOiBUb29sQ29uZmlnW10pOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmVuYWJsZWRUb29sTmFtZXMgPSBuZXcgU2V0KGVuYWJsZWRUb29scy5tYXAodG9vbCA9PiBgJHt0b29sLmNhdGVnb3J5fV8ke3Rvb2wubmFtZX1gKSk7XHJcbiAgICAgICAgdGhpcy5yZWJ1aWxkVG9vbHNMaXN0KCk7XHJcbiAgICAgICAgZm9yIChjb25zdCBydW50aW1lIG9mIHRoaXMucHJvdG9jb2xSdW50aW1lcy52YWx1ZXMoKSkge1xyXG4gICAgICAgICAgICBydW50aW1lLnNlcnZlci5zZW5kVG9vbExpc3RDaGFuZ2VkKCkuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kZWJ1ZyhgVW5hYmxlIHRvIHNlbmQgdG9vbHMvbGlzdF9jaGFuZ2VkOiAke3RoaXMuZ2V0RXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBhc3luYyBleGVjdXRlVG9vbENhbGwodG9vbE5hbWU6IHN0cmluZywgYXJnczogdW5rbm93bik6IFByb21pc2U8VG9vbFJlc3BvbnNlPiB7XHJcbiAgICAgICAgY29uc3QgcmVnaXN0ZXJlZCA9IHRoaXMucmVnaXN0ZXJlZFRvb2xzLmdldCh0b29sTmFtZSk7XHJcbiAgICAgICAgaWYgKCFyZWdpc3RlcmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b29sOiAke3Rvb2xOYW1lfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5lbmFibGVkVG9vbE5hbWVzICE9PSBudWxsICYmICF0aGlzLmVuYWJsZWRUb29sTmFtZXMuaGFzKHRvb2xOYW1lKSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgVG9vbERpc2FibGVkRXJyb3IoYFRvb2wgaXMgZGlzYWJsZWQ6ICR7dG9vbE5hbWV9YCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBub3JtYWxpemVkQXJnczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB0aGlzLmlzUmVjb3JkKGFyZ3MpID8geyAuLi5hcmdzIH0gOiB7fTtcclxuICAgICAgICBjb25zdCB2YWxpZGF0b3IgPSB0aGlzLmdldFZhbGlkYXRvcih0b29sTmFtZSwgcmVnaXN0ZXJlZC5kZWZpbml0aW9uLmlucHV0U2NoZW1hKTtcclxuICAgICAgICBpZiAoIXZhbGlkYXRvcihub3JtYWxpemVkQXJncykpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFRvb2xWYWxpZGF0aW9uRXJyb3IoXHJcbiAgICAgICAgICAgICAgICBgSW52YWxpZCBhcmd1bWVudHMgZm9yIHRvb2wgJHt0b29sTmFtZX1gLFxyXG4gICAgICAgICAgICAgICAgdmFsaWRhdG9yLmVycm9ycyA/PyBbXVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocmVxdWlyZXNDb25maXJtYXRpb24odG9vbE5hbWUpICYmIG5vcm1hbGl6ZWRBcmdzLmNvbmZpcm0gIT09IHRydWUpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IFRvb2xDb25maXJtYXRpb25FcnJvcihgVG9vbCAke3Rvb2xOYW1lfSByZXF1aXJlcyBjb25maXJtPXRydWVgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZGVsZXRlIG5vcm1hbGl6ZWRBcmdzLmNvbmZpcm07XHJcblxyXG4gICAgICAgIGxldCB0aW1lb3V0OiBOb2RlSlMuVGltZW91dCB8IHVuZGVmaW5lZDtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgUHJvbWlzZS5yYWNlKFtcclxuICAgICAgICAgICAgICAgIHJlZ2lzdGVyZWQuZXhlY3V0b3IuZXhlY3V0ZShyZWdpc3RlcmVkLm1ldGhvZE5hbWUsIG5vcm1hbGl6ZWRBcmdzKSxcclxuICAgICAgICAgICAgICAgIG5ldyBQcm9taXNlPFRvb2xSZXNwb25zZT4oKF8sIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBUb29sVGltZW91dEVycm9yKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYFRvb2wgJHt0b29sTmFtZX0gdGltZWQgb3V0IGFmdGVyICR7dGhpcy5zZXR0aW5ncy50b29sRXhlY3V0aW9uVGltZW91dE1zfW1zYFxyXG4gICAgICAgICAgICAgICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgICAgICAgICB9LCB0aGlzLnNldHRpbmdzLnRvb2xFeGVjdXRpb25UaW1lb3V0TXMpO1xyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgXSk7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgaWYgKHRpbWVvdXQpIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBjcmVhdGVQcm90b2NvbFJ1bnRpbWUoKTogUHJvbWlzZTxQcm90b2NvbFJ1bnRpbWU+IHtcclxuICAgICAgICBjb25zdCBwcm90b2NvbFNlcnZlciA9IG5ldyBNQ1BQcm90b2NvbFNlcnZlcihcclxuICAgICAgICAgICAgeyBuYW1lOiAnY29jb3MtbWNwLXNlcnZlcicsIHZlcnNpb246IFNFUlZFUl9WRVJTSU9OIH0sXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNhcGFiaWxpdGllczoge1xyXG4gICAgICAgICAgICAgICAgICAgIHRvb2xzOiB7IGxpc3RDaGFuZ2VkOiB0cnVlIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBpbnN0cnVjdGlvbnM6ICdVc2UgcmVhZC1vbmx5IHF1ZXJ5IHRvb2xzIGJlZm9yZSBtdXRhdGlvbiB0b29scy4gSGlnaC1yaXNrIHRvb2xzIHJlcXVpcmUgY29uZmlybT10cnVlLidcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHByb3RvY29sU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKExpc3RUb29sc1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7XHJcbiAgICAgICAgICAgIHRvb2xzOiB0aGlzLmdldEF2YWlsYWJsZVRvb2xzKClcclxuICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgIHByb3RvY29sU2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKENhbGxUb29sUmVxdWVzdFNjaGVtYSwgYXN5bmMgcmVxdWVzdCA9PiB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVUb29sQ2FsbChcclxuICAgICAgICAgICAgICAgICAgICByZXF1ZXN0LnBhcmFtcy5uYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3QucGFyYW1zLmFyZ3VtZW50cyA/PyB7fVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnRvQ2FsbFRvb2xSZXN1bHQocmVzdWx0KTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnRvQ2FsbFRvb2xSZXN1bHQodGhpcy50b1Rvb2xFcnJvcihlcnJvcikpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBTdHJlYW1hYmxlSFRUUFNlcnZlclRyYW5zcG9ydCh7XHJcbiAgICAgICAgICAgIHNlc3Npb25JZEdlbmVyYXRvcjogcmFuZG9tVVVJRCxcclxuICAgICAgICAgICAgZW5hYmxlSnNvblJlc3BvbnNlOiB0cnVlXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IHByb3RvY29sU2VydmVyLmNvbm5lY3QodHJhbnNwb3J0KTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBzZXJ2ZXI6IHByb3RvY29sU2VydmVyLFxyXG4gICAgICAgICAgICB0cmFuc3BvcnQsXHJcbiAgICAgICAgICAgIGxhc3RBY3Rpdml0eTogRGF0ZS5ub3coKVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBjbG9zZVByb3RvY29sUnVudGltZShydW50aW1lOiBQcm90b2NvbFJ1bnRpbWUpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBhd2FpdCBydW50aW1lLnNlcnZlci5jbG9zZSgpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBjbG9zZUFsbFByb3RvY29sUnVudGltZXMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgcnVudGltZXMgPSBBcnJheS5mcm9tKHRoaXMucHJvdG9jb2xSdW50aW1lcy52YWx1ZXMoKSk7XHJcbiAgICAgICAgdGhpcy5wcm90b2NvbFJ1bnRpbWVzLmNsZWFyKCk7XHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocnVudGltZXMubWFwKHJ1bnRpbWUgPT4gdGhpcy5jbG9zZVByb3RvY29sUnVudGltZShydW50aW1lKSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVidWlsZFRvb2xzTGlzdCgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnRvb2xzTGlzdCA9IEFycmF5LmZyb20odGhpcy5yZWdpc3RlcmVkVG9vbHMuZW50cmllcygpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKChbbmFtZV0pID0+IHRoaXMuZW5hYmxlZFRvb2xOYW1lcyA9PT0gbnVsbCB8fCB0aGlzLmVuYWJsZWRUb29sTmFtZXMuaGFzKG5hbWUpKVxyXG4gICAgICAgICAgICAubWFwKChbLCB0b29sXSkgPT4gdG9vbC5kZWZpbml0aW9uKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldFZhbGlkYXRvcih0b29sTmFtZTogc3RyaW5nLCBzY2hlbWE6IG9iamVjdCk6IFZhbGlkYXRlRnVuY3Rpb24ge1xyXG4gICAgICAgIGxldCB2YWxpZGF0b3IgPSB0aGlzLnZhbGlkYXRvcnMuZ2V0KHRvb2xOYW1lKTtcclxuICAgICAgICBpZiAoIXZhbGlkYXRvcikge1xyXG4gICAgICAgICAgICB2YWxpZGF0b3IgPSB0aGlzLmFqdi5jb21waWxlKHNjaGVtYSk7XHJcbiAgICAgICAgICAgIHRoaXMudmFsaWRhdG9ycy5zZXQodG9vbE5hbWUsIHZhbGlkYXRvcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB2YWxpZGF0b3I7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBoYW5kbGVIdHRwUmVxdWVzdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXMuc2V0SGVhZGVyKCdDYWNoZS1Db250cm9sJywgJ25vLXN0b3JlJyk7XHJcbiAgICAgICAgcmVzLnNldEhlYWRlcignWC1Db250ZW50LVR5cGUtT3B0aW9ucycsICdub3NuaWZmJyk7XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5pc0FsbG93ZWRIb3N0KHJlcS5oZWFkZXJzLmhvc3QpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNlbmRKc29uKHJlcywgNDAzLCB7IGVycm9yOiAnRm9yYmlkZGVuIGhvc3QnIH0pO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBvcmlnaW4gPSB0aGlzLmdldEhlYWRlcihyZXEuaGVhZGVycy5vcmlnaW4pO1xyXG4gICAgICAgICAgICBpZiAob3JpZ2luICYmICF0aGlzLmlzQWxsb3dlZE9yaWdpbihvcmlnaW4pKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNlbmRKc29uKHJlcywgNDAzLCB7IGVycm9yOiAnRm9yYmlkZGVuIG9yaWdpbicgfSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKG9yaWdpbikge1xyXG4gICAgICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJywgb3JpZ2luKTtcclxuICAgICAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ1ZhcnknLCAnT3JpZ2luJyk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChyZXEubWV0aG9kID09PSAnT1BUSU9OUycpIHtcclxuICAgICAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnLCAnR0VULCBQT1NULCBERUxFVEUsIE9QVElPTlMnKTtcclxuICAgICAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoXHJcbiAgICAgICAgICAgICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLFxyXG4gICAgICAgICAgICAgICAgICAgICdBY2NlcHQsIEF1dGhvcml6YXRpb24sIENvbnRlbnQtVHlwZSwgTUNQLVByb3RvY29sLVZlcnNpb24sIE1DUC1TZXNzaW9uLUlkLCBYLU1DUC1Ub2tlbidcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwNCk7XHJcbiAgICAgICAgICAgICAgICByZXMuZW5kKCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHBhdGhuYW1lID0gbmV3IFVSTChyZXEudXJsID8/ICcvJywgJ2h0dHA6Ly9sb2NhbGhvc3QnKS5wYXRobmFtZTtcclxuICAgICAgICAgICAgaWYgKHBhdGhuYW1lID09PSAnL2hlYWx0aCcgJiYgcmVxLm1ldGhvZCA9PT0gJ0dFVCcpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2VuZEpzb24ocmVzLCAyMDAsIHtcclxuICAgICAgICAgICAgICAgICAgICBzdGF0dXM6ICdvaycsXHJcbiAgICAgICAgICAgICAgICAgICAgcnVubmluZzogdGhpcy5odHRwU2VydmVyPy5saXN0ZW5pbmcgPz8gZmFsc2UsXHJcbiAgICAgICAgICAgICAgICAgICAgdG9vbHM6IHRoaXMudG9vbHNMaXN0Lmxlbmd0aCxcclxuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uczogdGhpcy5wcm90b2NvbFJ1bnRpbWVzLnNpemUsXHJcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlUmVxdWVzdHM6IHRoaXMuYWN0aXZlUmVxdWVzdHNcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNBdXRoZW50aWNhdGVkKHJlcSkpIHtcclxuICAgICAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ1dXVy1BdXRoZW50aWNhdGUnLCAnQmVhcmVyIHJlYWxtPVwiY29jb3MtbWNwLXNlcnZlclwiJyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNlbmRKc29uKHJlcywgNDAxLCB7IGVycm9yOiAnVW5hdXRob3JpemVkJyB9KTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlUmVxdWVzdHMgPj0gdGhpcy5zZXR0aW5ncy5tYXhDb25uZWN0aW9ucykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZW5kSnNvbihyZXMsIDQyOSwgeyBlcnJvcjogJ1RvbyBtYW55IGFjdGl2ZSByZXF1ZXN0cycgfSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlUmVxdWVzdHMrKztcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGlmIChwYXRobmFtZSA9PT0gJy9tY3AnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5oYW5kbGVNQ1BSZXF1ZXN0KHJlcSwgcmVzKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLmVuYWJsZVJlc3RBcGkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbmRKc29uKHJlcywgNDA0LCB7IGVycm9yOiAnTm90IGZvdW5kJyB9KTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAocGF0aG5hbWUgPT09ICcvYXBpL3Rvb2xzJyAmJiByZXEubWV0aG9kID09PSAnR0VUJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2VuZEpzb24ocmVzLCAyMDAsIHsgdG9vbHM6IHRoaXMuZ2V0U2ltcGxpZmllZFRvb2xzTGlzdCgpIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmIChwYXRobmFtZS5zdGFydHNXaXRoKCcvYXBpLycpICYmIHJlcS5tZXRob2QgPT09ICdQT1NUJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuaGFuZGxlU2ltcGxlQVBJUmVxdWVzdChyZXEsIHJlcywgcGF0aG5hbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNlbmRKc29uKHJlcywgNDA0LCB7IGVycm9yOiAnTm90IGZvdW5kJyB9KTtcclxuICAgICAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlUmVxdWVzdHMtLTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGlmIChyZXMuaGVhZGVyc1NlbnQpIHtcclxuICAgICAgICAgICAgICAgIHJlcy5lbmQoKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBSZXF1ZXN0Qm9keVRvb0xhcmdlRXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2VuZEpzb24ocmVzLCA0MTMsIHsgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZGVidWdMb2coJ01DUFNlcnZlcicsICdVbmhhbmRsZWQgcmVxdWVzdCBlcnJvcicsIGVycm9yKTtcclxuICAgICAgICAgICAgdGhpcy5zZW5kSnNvbihyZXMsIDUwMCwgeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlTUNQUmVxdWVzdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBsZXQgcGFyc2VkQm9keTogdW5rbm93bjtcclxuICAgICAgICBpZiAocmVxLm1ldGhvZCA9PT0gJ1BPU1QnKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCB0aGlzLnJlYWRSZXF1ZXN0Qm9keShyZXEpO1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgcGFyc2VkQm9keSA9IEpTT04ucGFyc2UoYm9keSk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNlbmRKc29uKHJlcywgNDAwLCB7XHJcbiAgICAgICAgICAgICAgICAgICAganNvbnJwYzogJzIuMCcsXHJcbiAgICAgICAgICAgICAgICAgICAgaWQ6IG51bGwsXHJcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogLTMyNzAwLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBgUGFyc2UgZXJyb3I6ICR7dGhpcy5nZXRFcnJvck1lc3NhZ2UoZXJyb3IpfWBcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yZW1vdmVFeHBpcmVkUHJvdG9jb2xSdW50aW1lcygpO1xyXG5cclxuICAgICAgICBpZiAocmVxLm1ldGhvZCA9PT0gJ1BPU1QnICYmIHRoaXMuaXNJbml0aWFsaXplUmVxdWVzdChwYXJzZWRCb2R5KSkge1xyXG4gICAgICAgICAgICBjb25zdCBtYXhTZXNzaW9ucyA9IE51bWJlci5pc0Zpbml0ZSh0aGlzLnNldHRpbmdzLm1heFNlc3Npb25zKVxyXG4gICAgICAgICAgICAgICAgPyB0aGlzLnNldHRpbmdzLm1heFNlc3Npb25zXHJcbiAgICAgICAgICAgICAgICA6IHRoaXMuc2V0dGluZ3MubWF4Q29ubmVjdGlvbnM7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnByb3RvY29sUnVudGltZXMuc2l6ZSA+PSBtYXhTZXNzaW9ucykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZW5kSnNvbihyZXMsIDQyOSwgeyBlcnJvcjogJ01heGltdW0gTUNQIHNlc3Npb25zIHJlYWNoZWQnIH0pO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBydW50aW1lID0gYXdhaXQgdGhpcy5jcmVhdGVQcm90b2NvbFJ1bnRpbWUoKTtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHJ1bnRpbWUudHJhbnNwb3J0LmhhbmRsZVJlcXVlc3QocmVxLCByZXMsIHBhcnNlZEJvZHkpO1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2Vzc2lvbklkID0gcnVudGltZS50cmFuc3BvcnQuc2Vzc2lvbklkO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFzZXNzaW9uSWQpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ01DUCBpbml0aWFsaXphdGlvbiBkaWQgbm90IGNyZWF0ZSBhIHNlc3Npb24nKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJ1bnRpbWUubGFzdEFjdGl2aXR5ID0gRGF0ZS5ub3coKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucHJvdG9jb2xSdW50aW1lcy5zZXQoc2Vzc2lvbklkLCBydW50aW1lKTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuY2xvc2VQcm90b2NvbFJ1bnRpbWUocnVudGltZSk7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBzZXNzaW9uSWQgPSB0aGlzLmdldEhlYWRlcihyZXEuaGVhZGVyc1snbWNwLXNlc3Npb24taWQnXSk7XHJcbiAgICAgICAgY29uc3QgcnVudGltZSA9IHNlc3Npb25JZCA/IHRoaXMucHJvdG9jb2xSdW50aW1lcy5nZXQoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcclxuICAgICAgICBpZiAoIXJ1bnRpbWUpIHtcclxuICAgICAgICAgICAgdGhpcy5zZW5kSnNvbihyZXMsIHNlc3Npb25JZCA/IDQwNCA6IDQwMCwge1xyXG4gICAgICAgICAgICAgICAganNvbnJwYzogJzIuMCcsXHJcbiAgICAgICAgICAgICAgICBpZDogbnVsbCxcclxuICAgICAgICAgICAgICAgIGVycm9yOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZTogLTMyMDAwLFxyXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHNlc3Npb25JZCA/ICdNQ1Agc2Vzc2lvbiBub3QgZm91bmQnIDogJ01DUC1TZXNzaW9uLUlkIGhlYWRlciBpcyByZXF1aXJlZCdcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJ1bnRpbWUubGFzdEFjdGl2aXR5ID0gRGF0ZS5ub3coKTtcclxuICAgICAgICBhd2FpdCBydW50aW1lLnRyYW5zcG9ydC5oYW5kbGVSZXF1ZXN0KHJlcSwgcmVzLCBwYXJzZWRCb2R5KTtcclxuICAgICAgICBpZiAocmVxLm1ldGhvZCA9PT0gJ0RFTEVURScpIHtcclxuICAgICAgICAgICAgdGhpcy5wcm90b2NvbFJ1bnRpbWVzLmRlbGV0ZShzZXNzaW9uSWQhKTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5jbG9zZVByb3RvY29sUnVudGltZShydW50aW1lKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW1vdmVFeHBpcmVkUHJvdG9jb2xSdW50aW1lcygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBleHBpcmF0aW9uVGltZSA9IERhdGUubm93KCkgLSB0aGlzLmdldFNlc3Npb25JZGxlVGltZW91dE1zKCk7XHJcbiAgICAgICAgZm9yIChjb25zdCBbc2Vzc2lvbklkLCBydW50aW1lXSBvZiB0aGlzLnByb3RvY29sUnVudGltZXMpIHtcclxuICAgICAgICAgICAgaWYgKHJ1bnRpbWUubGFzdEFjdGl2aXR5IDwgZXhwaXJhdGlvblRpbWUpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucHJvdG9jb2xSdW50aW1lcy5kZWxldGUoc2Vzc2lvbklkKTtcclxuICAgICAgICAgICAgICAgIHZvaWQgdGhpcy5jbG9zZVByb3RvY29sUnVudGltZShydW50aW1lKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGlzSW5pdGlhbGl6ZVJlcXVlc3QoYm9keTogdW5rbm93bik6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGJvZHkpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBib2R5LnNvbWUoaXRlbSA9PiB0aGlzLmlzSW5pdGlhbGl6ZVJlcXVlc3QoaXRlbSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcy5pc1JlY29yZChib2R5KSAmJiBib2R5Lm1ldGhvZCA9PT0gJ2luaXRpYWxpemUnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlU2ltcGxlQVBJUmVxdWVzdChcclxuICAgICAgICByZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLFxyXG4gICAgICAgIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSxcclxuICAgICAgICBwYXRobmFtZTogc3RyaW5nXHJcbiAgICApOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zdCBwYXRoUGFydHMgPSBwYXRobmFtZS5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKTtcclxuICAgICAgICBpZiAocGF0aFBhcnRzLmxlbmd0aCAhPT0gMykge1xyXG4gICAgICAgICAgICB0aGlzLnNlbmRKc29uKHJlcywgNDAwLCB7IGVycm9yOiAnVXNlIC9hcGkve2NhdGVnb3J5fS97dG9vbF9uYW1lfScgfSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBwYXJhbXM6IHVua25vd24gPSB7fTtcclxuICAgICAgICBjb25zdCBib2R5ID0gYXdhaXQgdGhpcy5yZWFkUmVxdWVzdEJvZHkocmVxKTtcclxuICAgICAgICBpZiAoYm9keSkge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgcGFyYW1zID0gSlNPTi5wYXJzZShib2R5KTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2VuZEpzb24ocmVzLCA0MDAsIHtcclxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogJ0ludmFsaWQgSlNPTiBpbiByZXF1ZXN0IGJvZHknLFxyXG4gICAgICAgICAgICAgICAgICAgIGRldGFpbHM6IHRoaXMuZ2V0RXJyb3JNZXNzYWdlKGVycm9yKVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGZ1bGxUb29sTmFtZSA9IGAke3BhdGhQYXJ0c1sxXX1fJHtwYXRoUGFydHNbMl19YDtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVUb29sQ2FsbChmdWxsVG9vbE5hbWUsIHBhcmFtcyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2VuZEpzb24ocmVzLCByZXN1bHQuc3VjY2VzcyA/IDIwMCA6IDQyMiwge1xyXG4gICAgICAgICAgICAgICAgc3VjY2VzczogcmVzdWx0LnN1Y2Nlc3MsXHJcbiAgICAgICAgICAgICAgICB0b29sOiBmdWxsVG9vbE5hbWUsXHJcbiAgICAgICAgICAgICAgICByZXN1bHRcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc3QgdG9vbEVycm9yID0gdGhpcy50b1Rvb2xFcnJvcihlcnJvcik7XHJcbiAgICAgICAgICAgIHRoaXMuc2VuZEpzb24ocmVzLCB0aGlzLmdldFRvb2xFcnJvclN0YXR1cyhlcnJvciksIHtcclxuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgdG9vbDogZnVsbFRvb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZXJyb3I6IHRvb2xFcnJvci5lcnJvcixcclxuICAgICAgICAgICAgICAgIGRldGFpbHM6IHRvb2xFcnJvci5kYXRhXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlYWRSZXF1ZXN0Qm9keShyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBsZXQgYm9keSA9ICcnO1xyXG4gICAgICAgICAgICBsZXQgc2l6ZSA9IDA7XHJcbiAgICAgICAgICAgIGxldCBzZXR0bGVkID0gZmFsc2U7XHJcblxyXG4gICAgICAgICAgICByZXEub24oJ2RhdGEnLCBjaHVuayA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoc2V0dGxlZCkgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgc2l6ZSArPSBjaHVuay5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBpZiAoc2l6ZSA+IHRoaXMuc2V0dGluZ3MucmVxdWVzdEJvZHlMaW1pdEJ5dGVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2V0dGxlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBSZXF1ZXN0Qm9keVRvb0xhcmdlRXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGBSZXF1ZXN0IGJvZHkgZXhjZWVkcyAke3RoaXMuc2V0dGluZ3MucmVxdWVzdEJvZHlMaW1pdEJ5dGVzfSBieXRlc2BcclxuICAgICAgICAgICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgICAgICAgICByZXEucmVzdW1lKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYm9keSArPSBjaHVuay50b1N0cmluZygndXRmOCcpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgcmVxLm9uKCdlbmQnLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXNldHRsZWQpIHJlc29sdmUoYm9keSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICByZXEub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFzZXR0bGVkKSByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGlzQWxsb3dlZEhvc3QoaG9zdEhlYWRlcjogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKCFob3N0SGVhZGVyKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgaG9zdG5hbWUgPSBuZXcgVVJMKGBodHRwOi8vJHtob3N0SGVhZGVyfWApLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgIHJldHVybiBMT09QQkFDS19IT1NUUy5oYXMoaG9zdG5hbWUpO1xyXG4gICAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaXNBbGxvd2VkT3JpZ2luKG9yaWdpbjogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0dGluZ3MuYWxsb3dlZE9yaWdpbnMuc29tZShhbGxvd2VkID0+IHtcclxuICAgICAgICAgICAgaWYgKGFsbG93ZWQuZW5kc1dpdGgoJyonKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbi5zdGFydHNXaXRoKGFsbG93ZWQuc2xpY2UoMCwgLTEpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gYWxsb3dlZCA9PT0gb3JpZ2luO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaXNBdXRoZW50aWNhdGVkKHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBhdXRob3JpemF0aW9uID0gdGhpcy5nZXRIZWFkZXIocmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbik7XHJcbiAgICAgICAgY29uc3QgYmVhcmVyVG9rZW4gPSBhdXRob3JpemF0aW9uPy5zdGFydHNXaXRoKCdCZWFyZXIgJylcclxuICAgICAgICAgICAgPyBhdXRob3JpemF0aW9uLnNsaWNlKCdCZWFyZXIgJy5sZW5ndGgpLnRyaW0oKVxyXG4gICAgICAgICAgICA6IHVuZGVmaW5lZDtcclxuICAgICAgICBjb25zdCB0b2tlbiA9IGJlYXJlclRva2VuID8/IHRoaXMuZ2V0SGVhZGVyKHJlcS5oZWFkZXJzWyd4LW1jcC10b2tlbiddKTtcclxuICAgICAgICBpZiAoIXRva2VuKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkID0gQnVmZmVyLmZyb20odGhpcy5zZXR0aW5ncy5hdXRoVG9rZW4pO1xyXG4gICAgICAgIGNvbnN0IHByb3ZpZGVkID0gQnVmZmVyLmZyb20odG9rZW4pO1xyXG4gICAgICAgIHJldHVybiBleHBlY3RlZC5sZW5ndGggPT09IHByb3ZpZGVkLmxlbmd0aCAmJiB0aW1pbmdTYWZlRXF1YWwoZXhwZWN0ZWQsIHByb3ZpZGVkKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldExpc3RlbmluZ1BvcnQoKTogbnVtYmVyIHtcclxuICAgICAgICBjb25zdCBhZGRyZXNzID0gdGhpcy5odHRwU2VydmVyPy5hZGRyZXNzKCk7XHJcbiAgICAgICAgcmV0dXJuIGFkZHJlc3MgJiYgdHlwZW9mIGFkZHJlc3MgPT09ICdvYmplY3QnID8gYWRkcmVzcy5wb3J0IDogdGhpcy5zZXR0aW5ncy5wb3J0O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0U2Vzc2lvbklkbGVUaW1lb3V0TXMoKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gTnVtYmVyLmlzRmluaXRlKHRoaXMuc2V0dGluZ3Muc2Vzc2lvbklkbGVUaW1lb3V0TXMpXHJcbiAgICAgICAgICAgID8gdGhpcy5zZXR0aW5ncy5zZXNzaW9uSWRsZVRpbWVvdXRNc1xyXG4gICAgICAgICAgICA6IDMwICogNjAgKiAxMDAwO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0U2ltcGxpZmllZFRvb2xzTGlzdCgpOiB1bmtub3duW10ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRvb2xzTGlzdC5tYXAodG9vbCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHVuZGVyc2NvcmVJZHggPSB0b29sLm5hbWUuaW5kZXhPZignXycpO1xyXG4gICAgICAgICAgICBjb25zdCBjYXRlZ29yeSA9IHRvb2wubmFtZS5zdWJzdHJpbmcoMCwgdW5kZXJzY29yZUlkeCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHRvb2xOYW1lID0gdG9vbC5uYW1lLnN1YnN0cmluZyh1bmRlcnNjb3JlSWR4ICsgMSk7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiB0b29sLm5hbWUsXHJcbiAgICAgICAgICAgICAgICBjYXRlZ29yeSxcclxuICAgICAgICAgICAgICAgIHRvb2xOYW1lLFxyXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IHRvb2wuZGVzY3JpcHRpb24sXHJcbiAgICAgICAgICAgICAgICBhbm5vdGF0aW9uczogdG9vbC5hbm5vdGF0aW9ucyxcclxuICAgICAgICAgICAgICAgIGFwaVBhdGg6IGAvYXBpLyR7Y2F0ZWdvcnl9LyR7dG9vbE5hbWV9YCxcclxuICAgICAgICAgICAgICAgIGN1cmxFeGFtcGxlOiB0aGlzLmdlbmVyYXRlQ3VybEV4YW1wbGUoY2F0ZWdvcnksIHRvb2xOYW1lLCB0b29sLmlucHV0U2NoZW1hKVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2VuZXJhdGVDdXJsRXhhbXBsZShjYXRlZ29yeTogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCBzY2hlbWE6IGFueSk6IHN0cmluZyB7XHJcbiAgICAgICAgY29uc3Qgc2FtcGxlUGFyYW1zID0gdGhpcy5nZW5lcmF0ZVNhbXBsZVBhcmFtcyhzY2hlbWEpO1xyXG4gICAgICAgIGNvbnN0IGpzb25TdHJpbmcgPSBKU09OLnN0cmluZ2lmeShzYW1wbGVQYXJhbXMsIG51bGwsIDIpO1xyXG4gICAgICAgIHJldHVybiBgY3VybCAtWCBQT1NUIGh0dHA6Ly8xMjcuMC4wLjE6JHt0aGlzLmdldExpc3RlbmluZ1BvcnQoKX0vYXBpLyR7Y2F0ZWdvcnl9LyR7dG9vbE5hbWV9IFxcXFxcXG4gIC1IIFwiQXV0aG9yaXphdGlvbjogQmVhcmVyICR7dGhpcy5zZXR0aW5ncy5hdXRoVG9rZW59XCIgXFxcXFxcbiAgLUggXCJDb250ZW50LVR5cGU6IGFwcGxpY2F0aW9uL2pzb25cIiBcXFxcXFxuICAtZCAnJHtqc29uU3RyaW5nfSdgO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2VuZXJhdGVTYW1wbGVQYXJhbXMoc2NoZW1hOiBhbnkpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XHJcbiAgICAgICAgaWYgKCFzY2hlbWE/LnByb3BlcnRpZXMpIHJldHVybiB7fTtcclxuICAgICAgICBjb25zdCBzYW1wbGU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCBwcm9wXSBvZiBPYmplY3QuZW50cmllcyhzY2hlbWEucHJvcGVydGllcyBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+KSkge1xyXG4gICAgICAgICAgICBpZiAocHJvcC5jb25zdCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBzYW1wbGVba2V5XSA9IHByb3AuY29uc3Q7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzd2l0Y2ggKHByb3AudHlwZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnc3RyaW5nJzogc2FtcGxlW2tleV0gPSBwcm9wLmRlZmF1bHQgPz8gJ2V4YW1wbGVfc3RyaW5nJzsgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICdudW1iZXInOiBzYW1wbGVba2V5XSA9IHByb3AuZGVmYXVsdCA/PyAwOyBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2Jvb2xlYW4nOiBzYW1wbGVba2V5XSA9IHByb3AuZGVmYXVsdCA/PyB0cnVlOyBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgJ2FycmF5Jzogc2FtcGxlW2tleV0gPSBwcm9wLmRlZmF1bHQgPz8gW107IGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAnb2JqZWN0Jzogc2FtcGxlW2tleV0gPSBwcm9wLmRlZmF1bHQgPz8ge307IGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDogc2FtcGxlW2tleV0gPSBwcm9wLmRlZmF1bHQgPz8gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gc2FtcGxlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdG9DYWxsVG9vbFJlc3VsdChyZXN1bHQ6IFRvb2xSZXNwb25zZSk6IGFueSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiBKU09OLnN0cmluZ2lmeShyZXN1bHQpIH1dLFxyXG4gICAgICAgICAgICBzdHJ1Y3R1cmVkQ29udGVudDogcmVzdWx0LFxyXG4gICAgICAgICAgICBpc0Vycm9yOiAhcmVzdWx0LnN1Y2Nlc3NcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdG9Ub29sRXJyb3IoZXJyb3I6IHVua25vd24pOiBUb29sUmVzcG9uc2Uge1xyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlOiBUb29sUmVzcG9uc2UgPSB7XHJcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgICAgICBlcnJvcjogdGhpcy5nZXRFcnJvck1lc3NhZ2UoZXJyb3IpXHJcbiAgICAgICAgfTtcclxuICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBUb29sVmFsaWRhdGlvbkVycm9yKSB7XHJcbiAgICAgICAgICAgIHJlc3BvbnNlLmRhdGEgPSB7IHZhbGlkYXRpb25FcnJvcnM6IGVycm9yLmRldGFpbHMgfTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0VG9vbEVycm9yU3RhdHVzKGVycm9yOiB1bmtub3duKTogbnVtYmVyIHtcclxuICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBUb29sRGlzYWJsZWRFcnJvcikgcmV0dXJuIDQwMztcclxuICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBUb29sQ29uZmlybWF0aW9uRXJyb3IgfHwgZXJyb3IgaW5zdGFuY2VvZiBUb29sVmFsaWRhdGlvbkVycm9yKSByZXR1cm4gNDAwO1xyXG4gICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFRvb2xUaW1lb3V0RXJyb3IpIHJldHVybiA1MDQ7XHJcbiAgICAgICAgcmV0dXJuIDQwNDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNlbmRKc29uKHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSwgc3RhdHVzOiBudW1iZXIsIGJvZHk6IHVua25vd24pOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXJlcy5oYXNIZWFkZXIoJ0NvbnRlbnQtVHlwZScpKSB7XHJcbiAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJlcy53cml0ZUhlYWQoc3RhdHVzKTtcclxuICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KGJvZHkpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEhlYWRlcih2YWx1ZTogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHZhbHVlKSA/IHZhbHVlWzBdIDogdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpc1JlY29yZCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcclxuICAgICAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRFcnJvck1lc3NhZ2UoZXJyb3I6IHVua25vd24pOiBzdHJpbmcge1xyXG4gICAgICAgIHJldHVybiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkZWJ1ZyhtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICBkZWJ1Z0xvZygnTUNQU2VydmVyJywgbWVzc2FnZSk7XHJcbiAgICB9XHJcbn1cclxuIl19