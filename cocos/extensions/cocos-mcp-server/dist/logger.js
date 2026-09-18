"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDebugLogging = setDebugLogging;
exports.debugLog = debugLog;
exports.errorLog = errorLog;
let debugLoggingEnabled = false;
const MAX_STRING_LENGTH = 500;
function setDebugLogging(enabled) {
    debugLoggingEnabled = enabled;
}
function debugLog(scope, message, ...details) {
    if (!debugLoggingEnabled)
        return;
    const parts = [`[${scope}]`, formatMessage(message)];
    if (details.length > 0)
        parts.push('[details redacted]');
    console.log(parts.join(' '));
}
function errorLog(scope, message, ...details) {
    const parts = [`[${scope}]`, formatMessage(message)];
    if (details.length > 0)
        parts.push('[details redacted]');
    console.error(parts.join(' '));
}
function formatMessage(value) {
    if (typeof value !== 'string')
        return '[diagnostic event]';
    return redactString(value)
        .replace(/:\s*[\s\S]+$/, ': [redacted]')
        .replace(/\b(node|uuid|path|value|data)\s+[^,\s]+/gi, '$1 [redacted]')
        .replace(/=\s*.+?(?=\s+(?:on|for|to)\b|$)/gi, '= [redacted]');
}
function redactString(value) {
    return value
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
        .replace(/(["']?(?:authToken|token|authorization)["']?\s*[:=]\s*)["']?[^"',\s}]+/gi, '$1[redacted]')
        .replace(/\/Users\/[^/\s]+/g, '/Users/[redacted]')
        .slice(0, MAX_STRING_LENGTH);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc291cmNlL2xvZ2dlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUlBLDBDQUVDO0FBRUQsNEJBS0M7QUFFRCw0QkFJQztBQW5CRCxJQUFJLG1CQUFtQixHQUFHLEtBQUssQ0FBQztBQUVoQyxNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQztBQUU5QixTQUFnQixlQUFlLENBQUMsT0FBZ0I7SUFDNUMsbUJBQW1CLEdBQUcsT0FBTyxDQUFDO0FBQ2xDLENBQUM7QUFFRCxTQUFnQixRQUFRLENBQUMsS0FBYSxFQUFFLE9BQWdCLEVBQUUsR0FBRyxPQUFrQjtJQUMzRSxJQUFJLENBQUMsbUJBQW1CO1FBQUUsT0FBTztJQUNqQyxNQUFNLEtBQUssR0FBRyxDQUFDLElBQUksS0FBSyxHQUFHLEVBQUUsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDckQsSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUM7UUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFDekQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUVELFNBQWdCLFFBQVEsQ0FBQyxLQUFhLEVBQUUsT0FBZ0IsRUFBRSxHQUFHLE9BQWtCO0lBQzNFLE1BQU0sS0FBSyxHQUFHLENBQUMsSUFBSSxLQUFLLEdBQUcsRUFBRSxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNyRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQztRQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUN6RCxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNuQyxDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsS0FBYztJQUNqQyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVE7UUFBRSxPQUFPLG9CQUFvQixDQUFDO0lBQzNELE9BQU8sWUFBWSxDQUFDLEtBQUssQ0FBQztTQUNyQixPQUFPLENBQUMsY0FBYyxFQUFFLGNBQWMsQ0FBQztTQUN2QyxPQUFPLENBQUMsMkNBQTJDLEVBQUUsZUFBZSxDQUFDO1NBQ3JFLE9BQU8sQ0FBQyxtQ0FBbUMsRUFBRSxjQUFjLENBQUMsQ0FBQztBQUN0RSxDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUMsS0FBYTtJQUMvQixPQUFPLEtBQUs7U0FDUCxPQUFPLENBQUMsZ0NBQWdDLEVBQUUsbUJBQW1CLENBQUM7U0FDOUQsT0FBTyxDQUFDLDBFQUEwRSxFQUFFLGNBQWMsQ0FBQztTQUNuRyxPQUFPLENBQUMsbUJBQW1CLEVBQUUsbUJBQW1CLENBQUM7U0FDakQsS0FBSyxDQUFDLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0FBQ3JDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJsZXQgZGVidWdMb2dnaW5nRW5hYmxlZCA9IGZhbHNlO1xyXG5cclxuY29uc3QgTUFYX1NUUklOR19MRU5HVEggPSA1MDA7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2V0RGVidWdMb2dnaW5nKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIGRlYnVnTG9nZ2luZ0VuYWJsZWQgPSBlbmFibGVkO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZGVidWdMb2coc2NvcGU6IHN0cmluZywgbWVzc2FnZTogdW5rbm93biwgLi4uZGV0YWlsczogdW5rbm93bltdKTogdm9pZCB7XHJcbiAgICBpZiAoIWRlYnVnTG9nZ2luZ0VuYWJsZWQpIHJldHVybjtcclxuICAgIGNvbnN0IHBhcnRzID0gW2BbJHtzY29wZX1dYCwgZm9ybWF0TWVzc2FnZShtZXNzYWdlKV07XHJcbiAgICBpZiAoZGV0YWlscy5sZW5ndGggPiAwKSBwYXJ0cy5wdXNoKCdbZGV0YWlscyByZWRhY3RlZF0nKTtcclxuICAgIGNvbnNvbGUubG9nKHBhcnRzLmpvaW4oJyAnKSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBlcnJvckxvZyhzY29wZTogc3RyaW5nLCBtZXNzYWdlOiB1bmtub3duLCAuLi5kZXRhaWxzOiB1bmtub3duW10pOiB2b2lkIHtcclxuICAgIGNvbnN0IHBhcnRzID0gW2BbJHtzY29wZX1dYCwgZm9ybWF0TWVzc2FnZShtZXNzYWdlKV07XHJcbiAgICBpZiAoZGV0YWlscy5sZW5ndGggPiAwKSBwYXJ0cy5wdXNoKCdbZGV0YWlscyByZWRhY3RlZF0nKTtcclxuICAgIGNvbnNvbGUuZXJyb3IocGFydHMuam9pbignICcpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZm9ybWF0TWVzc2FnZSh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB7XHJcbiAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykgcmV0dXJuICdbZGlhZ25vc3RpYyBldmVudF0nO1xyXG4gICAgcmV0dXJuIHJlZGFjdFN0cmluZyh2YWx1ZSlcclxuICAgICAgICAucmVwbGFjZSgvOlxccypbXFxzXFxTXSskLywgJzogW3JlZGFjdGVkXScpXHJcbiAgICAgICAgLnJlcGxhY2UoL1xcYihub2RlfHV1aWR8cGF0aHx2YWx1ZXxkYXRhKVxccytbXixcXHNdKy9naSwgJyQxIFtyZWRhY3RlZF0nKVxyXG4gICAgICAgIC5yZXBsYWNlKC89XFxzKi4rPyg/PVxccysoPzpvbnxmb3J8dG8pXFxifCQpL2dpLCAnPSBbcmVkYWN0ZWRdJyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlZGFjdFN0cmluZyh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcclxuICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICAgIC5yZXBsYWNlKC9CZWFyZXJcXHMrW0EtWmEtejAtOS5ffisvPS1dKy9naSwgJ0JlYXJlciBbcmVkYWN0ZWRdJylcclxuICAgICAgICAucmVwbGFjZSgvKFtcIiddPyg/OmF1dGhUb2tlbnx0b2tlbnxhdXRob3JpemF0aW9uKVtcIiddP1xccypbOj1dXFxzKilbXCInXT9bXlwiJyxcXHN9XSsvZ2ksICckMVtyZWRhY3RlZF0nKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXC9Vc2Vyc1xcL1teL1xcc10rL2csICcvVXNlcnMvW3JlZGFjdGVkXScpXHJcbiAgICAgICAgLnNsaWNlKDAsIE1BWF9TVFJJTkdfTEVOR1RIKTtcclxufVxyXG4iXX0=