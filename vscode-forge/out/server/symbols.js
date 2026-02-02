"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SymbolTable = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
class SymbolTable {
    // Map from URI to parsed symbols
    documents = new Map();
    // Global indices for fast lookup
    entityIndex = new Map();
    actionIndex = new Map();
    jobIndex = new Map();
    messageIndex = new Map();
    viewIndex = new Map();
    relationIndex = new Map();
    ruleIndex = new Map();
    hookIndex = new Map();
    testIndex = new Map();
    accessIndex = new Map();
    fieldIndex = new Map(); // "Entity.field" -> FieldSymbol[]
    updateDocument(uri, result) {
        // Remove old symbols from indices
        this.removeDocumentFromIndices(uri);
        // Store new result
        this.documents.set(uri, result);
        // Rebuild indices
        for (const symbol of result.symbols) {
            this.indexSymbol(symbol);
        }
        // Index fields
        for (const [entityName, fields] of result.fields) {
            for (const field of fields) {
                const key = `${entityName}.${field.name}`;
                const existing = this.fieldIndex.get(key) || [];
                this.fieldIndex.set(key, [...existing, field]);
            }
        }
    }
    removeDocument(uri) {
        this.removeDocumentFromIndices(uri);
        this.documents.delete(uri);
    }
    removeDocumentFromIndices(uri) {
        const old = this.documents.get(uri);
        if (!old)
            return;
        for (const symbol of old.symbols) {
            this.removeFromIndex(symbol);
        }
        // Remove fields
        for (const [entityName, fields] of old.fields) {
            for (const field of fields) {
                const key = `${entityName}.${field.name}`;
                const existing = this.fieldIndex.get(key) || [];
                this.fieldIndex.set(key, existing.filter(f => f.uri !== uri));
            }
        }
    }
    indexSymbol(symbol) {
        const index = this.getIndexForKind(symbol.kind);
        if (index) {
            index.set(symbol.name, symbol);
        }
    }
    removeFromIndex(symbol) {
        const index = this.getIndexForKind(symbol.kind);
        if (index) {
            const existing = index.get(symbol.name);
            if (existing && existing.uri === symbol.uri) {
                index.delete(symbol.name);
            }
        }
    }
    getIndexForKind(kind) {
        switch (kind) {
            case 'entity': return this.entityIndex;
            case 'action': return this.actionIndex;
            case 'job': return this.jobIndex;
            case 'message': return this.messageIndex;
            case 'view': return this.viewIndex;
            case 'relation': return this.relationIndex;
            case 'rule': return this.ruleIndex;
            case 'hook': return this.hookIndex;
            case 'test': return this.testIndex;
            case 'access': return this.accessIndex;
            default: return null;
        }
    }
    // Lookup methods
    findEntity(name) {
        return this.entityIndex.get(name);
    }
    findAction(name) {
        return this.actionIndex.get(name);
    }
    findJob(name) {
        return this.jobIndex.get(name);
    }
    findMessage(name) {
        return this.messageIndex.get(name);
    }
    findView(name) {
        return this.viewIndex.get(name);
    }
    findRelation(name) {
        return this.relationIndex.get(name);
    }
    findAccess(name) {
        return this.accessIndex.get(name);
    }
    findField(entityName, fieldName) {
        const key = `${entityName}.${fieldName}`;
        const fields = this.fieldIndex.get(key);
        return fields?.[0];
    }
    findFieldsForEntity(entityName) {
        const result = [];
        for (const [key, fields] of this.fieldIndex) {
            if (key.startsWith(entityName + '.')) {
                result.push(...fields);
            }
        }
        return result;
    }
    // Find definition for a word - returns Location with correct URI
    findDefinition(word) {
        // Check if it's a qualified name (Entity.field or Entity.operation)
        if (word.includes('.')) {
            const parts = word.split('.');
            if (parts.length >= 2) {
                const entityName = parts[0];
                const memberName = parts[1];
                // Try to find as field first
                const field = this.findField(entityName, memberName);
                if (field) {
                    // Use the field's URI (now correctly stored)
                    return vscode_languageserver_1.Location.create(field.uri, field.nameRange);
                }
                // Try as relation
                const relation = this.relationIndex.get(word);
                if (relation) {
                    return vscode_languageserver_1.Location.create(relation.uri, relation.nameRange);
                }
                // Try as rule
                const rule = this.ruleIndex.get(word);
                if (rule) {
                    return vscode_languageserver_1.Location.create(rule.uri, rule.nameRange);
                }
                // Try as hook
                const hook = this.hookIndex.get(word);
                if (hook) {
                    return vscode_languageserver_1.Location.create(hook.uri, hook.nameRange);
                }
                // Try as access (e.g., "User" from "access User")
                const access = this.accessIndex.get(entityName);
                if (access) {
                    return vscode_languageserver_1.Location.create(access.uri, access.nameRange);
                }
            }
        }
        // Try each index
        const entity = this.entityIndex.get(word);
        if (entity)
            return vscode_languageserver_1.Location.create(entity.uri, entity.nameRange);
        const action = this.actionIndex.get(word);
        if (action)
            return vscode_languageserver_1.Location.create(action.uri, action.nameRange);
        const job = this.jobIndex.get(word);
        if (job)
            return vscode_languageserver_1.Location.create(job.uri, job.nameRange);
        const message = this.messageIndex.get(word);
        if (message)
            return vscode_languageserver_1.Location.create(message.uri, message.nameRange);
        const view = this.viewIndex.get(word);
        if (view)
            return vscode_languageserver_1.Location.create(view.uri, view.nameRange);
        const relation = this.relationIndex.get(word);
        if (relation)
            return vscode_languageserver_1.Location.create(relation.uri, relation.nameRange);
        const access = this.accessIndex.get(word);
        if (access)
            return vscode_languageserver_1.Location.create(access.uri, access.nameRange);
        return null;
    }
    // Find all references to a symbol
    findReferences(name) {
        const locations = [];
        for (const [uri, result] of this.documents) {
            for (const ref of result.references) {
                if (ref.name === name) {
                    locations.push(vscode_languageserver_1.Location.create(uri, ref.range));
                }
            }
        }
        // Also include the definition itself
        const def = this.findDefinition(name);
        if (def) {
            // Avoid duplicates
            const isDuplicate = locations.some(loc => loc.uri === def.uri &&
                loc.range.start.line === def.range.start.line &&
                loc.range.start.character === def.range.start.character);
            if (!isDuplicate) {
                locations.push(def);
            }
        }
        return locations;
    }
    // Get all symbols in a document
    getDocumentSymbols(uri) {
        const result = this.documents.get(uri);
        return result?.symbols || [];
    }
    // Get all symbols in workspace
    getAllSymbols() {
        const symbols = [];
        for (const result of this.documents.values()) {
            symbols.push(...result.symbols);
        }
        return symbols;
    }
    // Get all entities
    getAllEntities() {
        return Array.from(this.entityIndex.values());
    }
    // Get all actions
    getAllActions() {
        return Array.from(this.actionIndex.values());
    }
    // Get all jobs
    getAllJobs() {
        return Array.from(this.jobIndex.values());
    }
    // Get all messages
    getAllMessages() {
        return Array.from(this.messageIndex.values());
    }
    // Get all views
    getAllViews() {
        return Array.from(this.viewIndex.values());
    }
    // Get all relations
    getAllRelations() {
        return Array.from(this.relationIndex.values());
    }
    // Convert FORGE symbol kind to LSP symbol kind
    static toLspSymbolKind(kind) {
        switch (kind) {
            case 'app': return vscode_languageserver_1.SymbolKind.Module;
            case 'entity': return vscode_languageserver_1.SymbolKind.Class;
            case 'relation': return vscode_languageserver_1.SymbolKind.Property;
            case 'rule': return vscode_languageserver_1.SymbolKind.Event;
            case 'access': return vscode_languageserver_1.SymbolKind.Key;
            case 'action': return vscode_languageserver_1.SymbolKind.Function;
            case 'message': return vscode_languageserver_1.SymbolKind.Constant;
            case 'job': return vscode_languageserver_1.SymbolKind.Method;
            case 'hook': return vscode_languageserver_1.SymbolKind.Event;
            case 'view': return vscode_languageserver_1.SymbolKind.Interface;
            case 'test': return vscode_languageserver_1.SymbolKind.Method;
            case 'imperative': return vscode_languageserver_1.SymbolKind.Function;
            case 'migrate': return vscode_languageserver_1.SymbolKind.Operator;
            default: return vscode_languageserver_1.SymbolKind.Variable;
        }
    }
}
exports.SymbolTable = SymbolTable;
//# sourceMappingURL=symbols.js.map