"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionProvider = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
// Declaration keywords with snippets
const DECLARATION_COMPLETIONS = [
    {
        label: 'entity',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'entity ${1:Name} {\n  ${2:field}: ${3:string}\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define a new entity (data model)\n\n```forge\nentity User {\n  email: string unique\n  name: string\n}\n```'
        }
    },
    {
        label: 'relation',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'relation ${1:Entity}.${2:field} -> ${3:Target}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define a relation between entities\n\n```forge\nrelation Ticket.author -> User\nrelation Organization.members -> User many\n```'
        }
    },
    {
        label: 'rule',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'rule ${1:Entity}.${2:update} {\n  ${3:forbid if ${4:condition}}\n    ${5:emit ${6:MESSAGE}}\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define a business rule\n\n```forge\nrule Ticket.update {\n  forbid if status == closed\n    emit TICKET_CLOSED\n}\n```'
        }
    },
    {
        label: 'access',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'access ${1:Entity} {\n  read: ${2:user in org.members}\n  write: ${3:user == author}\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define access control rules\n\n```forge\naccess Ticket {\n  read: user in org.members\n  write: user == author or user.role == agent\n}\n```'
        }
    },
    {
        label: 'action',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'action ${1:name} {\n  input: ${2:Entity}\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define a named transaction\n\n```forge\naction close_ticket {\n  input: Ticket\n}\n```'
        }
    },
    {
        label: 'message',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'message ${1:MESSAGE_NAME} {\n  level: ${2|error,warning,info,success|}\n  default: "${3:Message text}"\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define a structured message\n\n```forge\nmessage TICKET_CLOSED {\n  level: error\n  default: "This ticket is already closed."\n}\n```'
        }
    },
    {
        label: 'job',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'job ${1:name} {\n  input: ${2:Entity}\n  needs: ${3:Entity.relation}\n  effect: ${4:email.send}\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define a deferred effect (background job)\n\n```forge\njob notify_agent {\n  input: Ticket\n  needs: Ticket.org.members where role == agent\n  effect: email.send\n}\n```'
        }
    },
    {
        label: 'hook',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'hook ${1:Entity}.${2|after_create,after_update,after_delete,before_create,before_update,before_delete|} {\n  enqueue ${3:job_name}\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Bind entity lifecycle events to jobs\n\n```forge\nhook Ticket.after_create {\n  enqueue notify_agent\n}\n```'
        }
    },
    {
        label: 'view',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'view ${1:Name} {\n  source: ${2:Entity}\n  fields: ${3:field1, field2}\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define a frontend projection (queryable/subscribable)\n\n```forge\nview TicketList {\n  source: Ticket\n  fields: subject, status, author.name\n}\n```'
        }
    },
    {
        label: 'test',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'test ${1:Entity}.${2:operation} {\n  given ${3:field} = ${4:value}\n  when ${5|update,create,delete|} ${6:Entity}\n  expect ${7:outcome}\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define an invariant test\n\n```forge\ntest Ticket.update {\n  given status = closed\n  when update Ticket\n  expect reject TICKET_CLOSED\n}\n```'
        }
    },
    {
        label: 'app',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'app ${1:Name} {\n  auth: ${2|oauth,jwt,session|}\n  database: ${3|postgres,mysql|}\n  frontend: ${4|web,mobile|}\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define application configuration\n\n```forge\napp Helpdesk {\n  auth: oauth\n  database: postgres\n  frontend: web\n}\n```'
        }
    },
    {
        label: 'imperative',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'imperative ${1:name} {\n  input: ${2:Entity}\n  returns: ${3:file}\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define imperative code escape hatch\n\n```forge\nimperative export_csv {\n  input: Ticket\n  returns: file\n}\n```'
        }
    },
    {
        label: 'migrate',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'migrate ${1:Entity}.${2:v2} {\n  from: ${3:field} enum(${4:old_values})\n  to: ${5:field} enum(${6:new_values})\n\n  map:\n    ${7:old_value} -> ${8:new_value}\n}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: {
            kind: vscode_languageserver_1.MarkupKind.Markdown,
            value: 'Define a migration\n\n```forge\nmigrate Subscription.v2 {\n  from: plan enum(free, pro)\n  to: tier enum(free, starter, pro)\n\n  map:\n    free -> free\n    pro  -> starter\n}\n```'
        }
    }
];
// Type completions
const TYPE_COMPLETIONS = [
    { label: 'string', kind: vscode_languageserver_1.CompletionItemKind.TypeParameter, documentation: 'Text field' },
    { label: 'bool', kind: vscode_languageserver_1.CompletionItemKind.TypeParameter, documentation: 'Boolean (true/false)' },
    { label: 'int', kind: vscode_languageserver_1.CompletionItemKind.TypeParameter, documentation: 'Integer number' },
    { label: 'float', kind: vscode_languageserver_1.CompletionItemKind.TypeParameter, documentation: 'Floating point number' },
    { label: 'time', kind: vscode_languageserver_1.CompletionItemKind.TypeParameter, documentation: 'Timestamp' },
    { label: 'file', kind: vscode_languageserver_1.CompletionItemKind.TypeParameter, documentation: 'File reference' },
    {
        label: 'enum',
        kind: vscode_languageserver_1.CompletionItemKind.TypeParameter,
        insertText: 'enum(${1:value1}, ${2:value2})',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Enumeration type'
    }
];
// Constraint completions
const CONSTRAINT_COMPLETIONS = [
    { label: 'unique', kind: vscode_languageserver_1.CompletionItemKind.Keyword, documentation: 'Field must be unique' },
    {
        label: 'length',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'length <= ${1:100}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Maximum string length'
    }
];
// Rule body completions
const RULE_BODY_COMPLETIONS = [
    {
        label: 'forbid if',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'forbid if ${1:condition}\n    emit ${2:MESSAGE}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Forbid action if condition is true'
    },
    {
        label: 'require if',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'require if ${1:condition}\n    emit ${2:MESSAGE}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Require condition to be true'
    },
    {
        label: 'emit',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'emit ${1:MESSAGE}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Emit a message'
    }
];
// Access body completions
const ACCESS_BODY_COMPLETIONS = [
    {
        label: 'read:',
        kind: vscode_languageserver_1.CompletionItemKind.Property,
        insertText: 'read: ${1:condition}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Read access condition'
    },
    {
        label: 'write:',
        kind: vscode_languageserver_1.CompletionItemKind.Property,
        insertText: 'write: ${1:condition}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Write access condition'
    }
];
// Job body completions
const JOB_BODY_COMPLETIONS = [
    {
        label: 'input:',
        kind: vscode_languageserver_1.CompletionItemKind.Property,
        insertText: 'input: ${1:Entity}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Input entity type'
    },
    {
        label: 'needs:',
        kind: vscode_languageserver_1.CompletionItemKind.Property,
        insertText: 'needs: ${1:Entity.relation}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Required data path'
    },
    {
        label: 'effect:',
        kind: vscode_languageserver_1.CompletionItemKind.Property,
        insertText: 'effect: ${1|email.send,http.call,file.write|}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Effect capability'
    }
];
// View body completions
const VIEW_BODY_COMPLETIONS = [
    {
        label: 'source:',
        kind: vscode_languageserver_1.CompletionItemKind.Property,
        insertText: 'source: ${1:Entity}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Source entity'
    },
    {
        label: 'fields:',
        kind: vscode_languageserver_1.CompletionItemKind.Property,
        insertText: 'fields: ${1:field1}, ${2:field2}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Fields to include'
    }
];
// Hook body completions
const HOOK_BODY_COMPLETIONS = [
    {
        label: 'enqueue',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'enqueue ${1:job_name}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Enqueue a job'
    }
];
// Test body completions
const TEST_BODY_COMPLETIONS = [
    {
        label: 'given',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'given ${1:field} = ${2:value}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Test precondition'
    },
    {
        label: 'when',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'when ${1|update,create,delete,action|} ${2:target}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Test action'
    },
    {
        label: 'expect',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'expect ${1:outcome}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Expected outcome'
    },
    {
        label: 'expect reject',
        kind: vscode_languageserver_1.CompletionItemKind.Keyword,
        insertText: 'expect reject ${1:MESSAGE}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Expect rejection with message'
    }
];
// Message body completions
const MESSAGE_BODY_COMPLETIONS = [
    {
        label: 'level:',
        kind: vscode_languageserver_1.CompletionItemKind.Property,
        insertText: 'level: ${1|error,warning,info,success|}',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Message severity level'
    },
    {
        label: 'default:',
        kind: vscode_languageserver_1.CompletionItemKind.Property,
        insertText: 'default: "${1:Message text}"',
        insertTextFormat: vscode_languageserver_1.InsertTextFormat.Snippet,
        documentation: 'Default message text'
    }
];
// Operator completions
const OPERATOR_COMPLETIONS = [
    { label: 'and', kind: vscode_languageserver_1.CompletionItemKind.Operator, documentation: 'Logical AND' },
    { label: 'or', kind: vscode_languageserver_1.CompletionItemKind.Operator, documentation: 'Logical OR' },
    { label: 'not', kind: vscode_languageserver_1.CompletionItemKind.Operator, documentation: 'Logical NOT' },
    { label: 'in', kind: vscode_languageserver_1.CompletionItemKind.Operator, documentation: 'Membership test' },
    { label: 'where', kind: vscode_languageserver_1.CompletionItemKind.Keyword, documentation: 'Filter condition' }
];
class CompletionProvider {
    symbolTable;
    constructor(symbolTable) {
        this.symbolTable = symbolTable;
    }
    getCompletions(text, line, character) {
        const lines = text.split('\n');
        const currentLine = lines[line] || '';
        const prefix = currentLine.substring(0, character).trim();
        const fullPrefix = currentLine.substring(0, character);
        // Determine context
        const context = this.determineContext(lines, line);
        const completions = [];
        // Top-level declarations
        if (context === 'top-level') {
            completions.push(...DECLARATION_COMPLETIONS);
        }
        // Inside entity block - field types
        if (context === 'entity-body') {
            // After colon, suggest types
            if (fullPrefix.includes(':')) {
                completions.push(...TYPE_COMPLETIONS);
                completions.push(...this.getEntityCompletions()); // For relation types
            }
            // After type, suggest constraints
            if (/:\s*(string|int|float|enum\([^)]*\))\s+\S*$/.test(fullPrefix)) {
                completions.push(...CONSTRAINT_COMPLETIONS);
            }
        }
        // Inside rule block
        if (context === 'rule-body') {
            completions.push(...RULE_BODY_COMPLETIONS);
            completions.push(...OPERATOR_COMPLETIONS);
            completions.push(...this.getMessageCompletions());
        }
        // Inside access block
        if (context === 'access-body') {
            completions.push(...ACCESS_BODY_COMPLETIONS);
            completions.push(...OPERATOR_COMPLETIONS);
        }
        // Inside action block
        if (context === 'action-body') {
            completions.push(...this.getEntityCompletions());
            completions.push({ label: 'input:', kind: vscode_languageserver_1.CompletionItemKind.Property });
        }
        // Inside job block
        if (context === 'job-body') {
            completions.push(...JOB_BODY_COMPLETIONS);
            completions.push(...this.getEntityCompletions());
        }
        // Inside hook block
        if (context === 'hook-body') {
            completions.push(...HOOK_BODY_COMPLETIONS);
            completions.push(...this.getJobCompletions());
        }
        // Inside view block
        if (context === 'view-body') {
            completions.push(...VIEW_BODY_COMPLETIONS);
            completions.push(...this.getEntityCompletions());
        }
        // Inside test block
        if (context === 'test-body') {
            completions.push(...TEST_BODY_COMPLETIONS);
            completions.push(...this.getEntityCompletions());
            completions.push(...this.getActionCompletions());
            completions.push(...this.getMessageCompletions());
        }
        // Inside message block
        if (context === 'message-body') {
            completions.push(...MESSAGE_BODY_COMPLETIONS);
        }
        // After specific keywords, add contextual completions
        if (/emit\s+$/.test(fullPrefix) || /reject\s+$/.test(fullPrefix)) {
            completions.push(...this.getMessageCompletions());
        }
        if (/enqueue\s+$/.test(fullPrefix)) {
            completions.push(...this.getJobCompletions());
        }
        if (/source:\s*$/.test(fullPrefix) || /input:\s*$/.test(fullPrefix)) {
            completions.push(...this.getEntityCompletions());
        }
        if (/action\s+$/.test(fullPrefix)) {
            completions.push(...this.getActionCompletions());
        }
        return completions;
    }
    determineContext(lines, currentLine) {
        // Scan backwards to find enclosing block
        let braceDepth = 0;
        let lastKeyword = '';
        for (let i = currentLine; i >= 0; i--) {
            const line = lines[i];
            // Count braces
            for (const char of line) {
                if (char === '}')
                    braceDepth++;
                if (char === '{')
                    braceDepth--;
            }
            // Check for declaration keyword at start of block
            const match = line.match(/^\s*(app|entity|relation|rule|access|action|message|job|hook|view|test|imperative|migrate)\b/);
            if (match && braceDepth <= 0) {
                lastKeyword = match[1];
                break;
            }
        }
        if (braceDepth > 0 || !lastKeyword) {
            return 'top-level';
        }
        return `${lastKeyword}-body`;
    }
    getEntityCompletions() {
        return this.symbolTable.getAllEntities().map(entity => ({
            label: entity.name,
            kind: vscode_languageserver_1.CompletionItemKind.Class,
            documentation: `Entity: ${entity.name}`
        }));
    }
    getActionCompletions() {
        return this.symbolTable.getAllActions().map(action => ({
            label: action.name,
            kind: vscode_languageserver_1.CompletionItemKind.Function,
            documentation: `Action: ${action.name}`
        }));
    }
    getJobCompletions() {
        return this.symbolTable.getAllJobs().map(job => ({
            label: job.name,
            kind: vscode_languageserver_1.CompletionItemKind.Method,
            documentation: `Job: ${job.name}`
        }));
    }
    getMessageCompletions() {
        return this.symbolTable.getAllMessages().map(msg => ({
            label: msg.name,
            kind: vscode_languageserver_1.CompletionItemKind.Constant,
            documentation: `Message: ${msg.name}`
        }));
    }
    getViewCompletions() {
        return this.symbolTable.getAllViews().map(view => ({
            label: view.name,
            kind: vscode_languageserver_1.CompletionItemKind.Interface,
            documentation: `View: ${view.name}`
        }));
    }
}
exports.CompletionProvider = CompletionProvider;
//# sourceMappingURL=completion.js.map