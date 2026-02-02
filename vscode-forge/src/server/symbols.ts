import { Range, Location, SymbolKind } from 'vscode-languageserver';
import { ForgeSymbol, FieldSymbol, Reference, ParseResult, DeclarationType } from './parser';

export interface SymbolInfo {
  symbol: ForgeSymbol;
  fields: FieldSymbol[];
}

export class SymbolTable {
  // Map from URI to parsed symbols
  private documents = new Map<string, ParseResult>();

  // Global indices for fast lookup
  private entityIndex = new Map<string, ForgeSymbol>();
  private actionIndex = new Map<string, ForgeSymbol>();
  private jobIndex = new Map<string, ForgeSymbol>();
  private messageIndex = new Map<string, ForgeSymbol>();
  private viewIndex = new Map<string, ForgeSymbol>();
  private relationIndex = new Map<string, ForgeSymbol>();
  private ruleIndex = new Map<string, ForgeSymbol>();
  private hookIndex = new Map<string, ForgeSymbol>();
  private testIndex = new Map<string, ForgeSymbol>();
  private accessIndex = new Map<string, ForgeSymbol>();
  private fieldIndex = new Map<string, FieldSymbol[]>(); // "Entity.field" -> FieldSymbol[]

  updateDocument(uri: string, result: ParseResult): void {
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

  removeDocument(uri: string): void {
    this.removeDocumentFromIndices(uri);
    this.documents.delete(uri);
  }

  private removeDocumentFromIndices(uri: string): void {
    const old = this.documents.get(uri);
    if (!old) return;

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

  private indexSymbol(symbol: ForgeSymbol): void {
    const index = this.getIndexForKind(symbol.kind);
    if (index) {
      index.set(symbol.name, symbol);
    }
  }

  private removeFromIndex(symbol: ForgeSymbol): void {
    const index = this.getIndexForKind(symbol.kind);
    if (index) {
      const existing = index.get(symbol.name);
      if (existing && existing.uri === symbol.uri) {
        index.delete(symbol.name);
      }
    }
  }

  private getIndexForKind(kind: DeclarationType): Map<string, ForgeSymbol> | null {
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
  findEntity(name: string): ForgeSymbol | undefined {
    return this.entityIndex.get(name);
  }

  findAction(name: string): ForgeSymbol | undefined {
    return this.actionIndex.get(name);
  }

  findJob(name: string): ForgeSymbol | undefined {
    return this.jobIndex.get(name);
  }

  findMessage(name: string): ForgeSymbol | undefined {
    return this.messageIndex.get(name);
  }

  findView(name: string): ForgeSymbol | undefined {
    return this.viewIndex.get(name);
  }

  findRelation(name: string): ForgeSymbol | undefined {
    return this.relationIndex.get(name);
  }

  findAccess(name: string): ForgeSymbol | undefined {
    return this.accessIndex.get(name);
  }

  findField(entityName: string, fieldName: string): FieldSymbol | undefined {
    const key = `${entityName}.${fieldName}`;
    const fields = this.fieldIndex.get(key);
    return fields?.[0];
  }

  findFieldsForEntity(entityName: string): FieldSymbol[] {
    const result: FieldSymbol[] = [];
    for (const [key, fields] of this.fieldIndex) {
      if (key.startsWith(entityName + '.')) {
        result.push(...fields);
      }
    }
    return result;
  }

  // Find definition for a word - returns Location with correct URI
  findDefinition(word: string): Location | null {
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
          return Location.create(field.uri, field.nameRange);
        }

        // Try as relation
        const relation = this.relationIndex.get(word);
        if (relation) {
          return Location.create(relation.uri, relation.nameRange);
        }

        // Try as rule
        const rule = this.ruleIndex.get(word);
        if (rule) {
          return Location.create(rule.uri, rule.nameRange);
        }

        // Try as hook
        const hook = this.hookIndex.get(word);
        if (hook) {
          return Location.create(hook.uri, hook.nameRange);
        }

        // Try as access (e.g., "User" from "access User")
        const access = this.accessIndex.get(entityName);
        if (access) {
          return Location.create(access.uri, access.nameRange);
        }
      }
    }

    // Try each index
    const entity = this.entityIndex.get(word);
    if (entity) return Location.create(entity.uri, entity.nameRange);

    const action = this.actionIndex.get(word);
    if (action) return Location.create(action.uri, action.nameRange);

    const job = this.jobIndex.get(word);
    if (job) return Location.create(job.uri, job.nameRange);

    const message = this.messageIndex.get(word);
    if (message) return Location.create(message.uri, message.nameRange);

    const view = this.viewIndex.get(word);
    if (view) return Location.create(view.uri, view.nameRange);

    const relation = this.relationIndex.get(word);
    if (relation) return Location.create(relation.uri, relation.nameRange);

    const access = this.accessIndex.get(word);
    if (access) return Location.create(access.uri, access.nameRange);

    return null;
  }

  // Find all references to a symbol
  findReferences(name: string): Location[] {
    const locations: Location[] = [];

    for (const [uri, result] of this.documents) {
      for (const ref of result.references) {
        if (ref.name === name) {
          locations.push(Location.create(uri, ref.range));
        }
      }
    }

    // Also include the definition itself
    const def = this.findDefinition(name);
    if (def) {
      // Avoid duplicates
      const isDuplicate = locations.some(loc =>
        loc.uri === def.uri &&
        loc.range.start.line === def.range.start.line &&
        loc.range.start.character === def.range.start.character
      );
      if (!isDuplicate) {
        locations.push(def);
      }
    }

    return locations;
  }

  // Get all symbols in a document
  getDocumentSymbols(uri: string): ForgeSymbol[] {
    const result = this.documents.get(uri);
    return result?.symbols || [];
  }

  // Get all symbols in workspace
  getAllSymbols(): ForgeSymbol[] {
    const symbols: ForgeSymbol[] = [];
    for (const result of this.documents.values()) {
      symbols.push(...result.symbols);
    }
    return symbols;
  }

  // Get all entities
  getAllEntities(): ForgeSymbol[] {
    return Array.from(this.entityIndex.values());
  }

  // Get all actions
  getAllActions(): ForgeSymbol[] {
    return Array.from(this.actionIndex.values());
  }

  // Get all jobs
  getAllJobs(): ForgeSymbol[] {
    return Array.from(this.jobIndex.values());
  }

  // Get all messages
  getAllMessages(): ForgeSymbol[] {
    return Array.from(this.messageIndex.values());
  }

  // Get all views
  getAllViews(): ForgeSymbol[] {
    return Array.from(this.viewIndex.values());
  }

  // Get all relations
  getAllRelations(): ForgeSymbol[] {
    return Array.from(this.relationIndex.values());
  }

  // Convert FORGE symbol kind to LSP symbol kind
  static toLspSymbolKind(kind: DeclarationType): SymbolKind {
    switch (kind) {
      case 'app': return SymbolKind.Module;
      case 'entity': return SymbolKind.Class;
      case 'relation': return SymbolKind.Property;
      case 'rule': return SymbolKind.Event;
      case 'access': return SymbolKind.Key;
      case 'action': return SymbolKind.Function;
      case 'message': return SymbolKind.Constant;
      case 'job': return SymbolKind.Method;
      case 'hook': return SymbolKind.Event;
      case 'view': return SymbolKind.Interface;
      case 'test': return SymbolKind.Method;
      case 'imperative': return SymbolKind.Function;
      case 'migrate': return SymbolKind.Operator;
      default: return SymbolKind.Variable;
    }
  }
}
