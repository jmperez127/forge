import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionItem,
  TextDocumentPositionParams,
  Definition,
  Location,
  ReferenceParams,
  DocumentSymbolParams,
  DocumentSymbol,
  SymbolKind,
  Hover,
  MarkupKind,
  WorkspaceSymbolParams,
  SymbolInformation,
  Diagnostic,
  DiagnosticSeverity,
  CodeAction,
  CodeActionParams,
  CodeActionKind,
  RenameParams,
  WorkspaceEdit,
  TextEdit,
  Range,
  Position,
  DidChangeWatchedFilesParams,
  FileChangeType
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { ForgeParser, getWordAtPosition, ParseResult } from './parser';
import { SymbolTable } from './symbols';
import { CompletionProvider } from './completion';
import { URI } from 'vscode-uri';
import * as fs from 'fs';
import * as path from 'path';

// Create connection
const connection = createConnection(ProposedFeatures.all);

// Document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Parser and symbol table
const parser = new ForgeParser();
const symbolTable = new SymbolTable();
const completionProvider = new CompletionProvider(symbolTable);

// Workspace folders
let workspaceFolders: string[] = [];

connection.onInitialize((params: InitializeParams): InitializeResult => {
  // Store workspace folders
  if (params.workspaceFolders) {
    workspaceFolders = params.workspaceFolders.map(f => URI.parse(f.uri).fsPath);
  } else if (params.rootUri) {
    workspaceFolders = [URI.parse(params.rootUri).fsPath];
  } else if (params.rootPath) {
    workspaceFolders = [params.rootPath];
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', ':', ' ']
      },
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      hoverProvider: true,
      renameProvider: {
        prepareProvider: true
      },
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix]
      },
      workspace: {
        workspaceFolders: {
          supported: true,
          changeNotifications: true
        }
      }
    }
  };
});

connection.onInitialized(() => {
  // Scan workspace for all .forge files
  scanWorkspaceForForgeFiles();
});

// Scan all workspace folders for .forge files
function scanWorkspaceForForgeFiles(): void {
  for (const folder of workspaceFolders) {
    scanDirectory(folder);
  }
}

function scanDirectory(dir: string): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scanDirectory(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.forge')) {
        parseFileFromDisk(fullPath);
      }
    }
  } catch (err) {
    // Ignore errors (permission issues, etc.)
  }
}

function parseFileFromDisk(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const uri = URI.file(filePath).toString();
    const result = parser.parse(content, uri);
    symbolTable.updateDocument(uri, result);
  } catch (err) {
    // Ignore errors
  }
}

// Parse document and update symbol table
function parseDocument(document: TextDocument): void {
  const text = document.getText();
  const uri = document.uri;

  const result = parser.parse(text, uri);
  symbolTable.updateDocument(uri, result);

  // Send diagnostics
  const diagnostics = generateDiagnostics(document, result);
  connection.sendDiagnostics({ uri, diagnostics });
}

function generateDiagnostics(document: TextDocument, result: ParseResult): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Add parse errors
  for (const error of result.errors) {
    diagnostics.push({
      severity: error.severity === 'error' ? DiagnosticSeverity.Error :
                error.severity === 'warning' ? DiagnosticSeverity.Warning :
                DiagnosticSeverity.Information,
      range: error.range,
      message: error.message,
      source: 'forge'
    });
  }

  // Check for undefined references
  for (const ref of result.references) {
    const def = symbolTable.findDefinition(ref.name);
    if (!def) {
      // Only warn for entity/action/job/message references that look like they should exist
      if (ref.kind === 'entity' && /^[A-Z]/.test(ref.name)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: ref.range,
          message: `Undefined entity: ${ref.name}`,
          source: 'forge'
        });
      } else if (ref.kind === 'message' && ref.name === ref.name.toUpperCase()) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: ref.range,
          message: `Undefined message: ${ref.name}`,
          source: 'forge'
        });
      } else if (ref.kind === 'job') {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: ref.range,
          message: `Undefined job: ${ref.name}`,
          source: 'forge'
        });
      } else if (ref.kind === 'action') {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: ref.range,
          message: `Undefined action: ${ref.name}`,
          source: 'forge'
        });
      }
    }
  }

  return diagnostics;
}

// Document events
documents.onDidOpen(event => {
  parseDocument(event.document);
});

documents.onDidChangeContent(event => {
  parseDocument(event.document);
});

documents.onDidClose(event => {
  // Don't remove from symbol table - keep for cross-file navigation
  // Just clear diagnostics
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// Watch for file changes (creation, deletion)
connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
  for (const change of params.changes) {
    const filePath = URI.parse(change.uri).fsPath;
    if (filePath.endsWith('.forge')) {
      if (change.type === FileChangeType.Deleted) {
        symbolTable.removeDocument(change.uri);
      } else if (change.type === FileChangeType.Created) {
        parseFileFromDisk(filePath);
      }
      // For changes, the document manager will handle it if the file is open
    }
  }
});

// Completion
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  return completionProvider.getCompletions(
    document.getText(),
    params.position.line,
    params.position.character
  );
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

// Go to definition
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const wordInfo = getWordAtPosition(document.getText(), params.position.line, params.position.character);
  if (!wordInfo) return null;

  // Try to find definition
  const location = symbolTable.findDefinition(wordInfo.word);
  if (location) return location;

  // Handle path expressions like user.role, Ticket.author.name
  const parts = wordInfo.word.split('.');
  if (parts.length >= 2) {
    // Try Entity.field
    const entityDef = symbolTable.findDefinition(parts[0]);
    if (entityDef) {
      // Try to find the field
      const field = symbolTable.findField(parts[0], parts[1]);
      if (field) {
        return Location.create(field.uri, field.nameRange);
      }
      // If no field found, at least go to the entity
      return entityDef;
    }
  }

  return null;
});

// Find references
connection.onReferences((params: ReferenceParams): Location[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const wordInfo = getWordAtPosition(document.getText(), params.position.line, params.position.character);
  if (!wordInfo) return [];

  return symbolTable.findReferences(wordInfo.word);
});

// Document symbols (outline)
connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
  const symbols = symbolTable.getDocumentSymbols(params.textDocument.uri);

  return symbols.map(symbol => {
    const children: DocumentSymbol[] = [];

    // Add fields as children for entities
    if (symbol.kind === 'entity') {
      const fields = symbolTable.findFieldsForEntity(symbol.name);
      for (const field of fields) {
        children.push({
          name: field.name,
          kind: SymbolKind.Field,
          range: field.range,
          selectionRange: field.nameRange,
          detail: field.type
        });
      }
    }

    return {
      name: symbol.name,
      kind: SymbolTable.toLspSymbolKind(symbol.kind),
      range: symbol.range,
      selectionRange: symbol.nameRange,
      children: children.length > 0 ? children : undefined
    };
  });
});

// Workspace symbols
connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): SymbolInformation[] => {
  const query = params.query.toLowerCase();
  const symbols = symbolTable.getAllSymbols();

  return symbols
    .filter(symbol => symbol.name.toLowerCase().includes(query))
    .map(symbol => ({
      name: symbol.name,
      kind: SymbolTable.toLspSymbolKind(symbol.kind),
      location: Location.create(symbol.uri, symbol.nameRange)
    }));
});

// Hover
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const wordInfo = getWordAtPosition(document.getText(), params.position.line, params.position.character);
  if (!wordInfo) return null;

  // Find symbol info
  const entity = symbolTable.findEntity(wordInfo.word);
  if (entity) {
    const fields = symbolTable.findFieldsForEntity(wordInfo.word);
    const fieldList = fields.map(f => `  ${f.name}: ${f.type}`).join('\n');
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**entity** ${entity.name}\n\n\`\`\`forge\nentity ${entity.name} {\n${fieldList}\n}\n\`\`\``
      }
    };
  }

  const action = symbolTable.findAction(wordInfo.word);
  if (action) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**action** ${action.name}\n\nNamed transaction that can be invoked via the SDK.`
      }
    };
  }

  const job = symbolTable.findJob(wordInfo.word);
  if (job) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**job** ${job.name}\n\nDeferred effect that runs after commit.`
      }
    };
  }

  const message = symbolTable.findMessage(wordInfo.word);
  if (message) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**message** ${message.name}\n\nStructured outcome message.`
      }
    };
  }

  const view = symbolTable.findView(wordInfo.word);
  if (view) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**view** ${view.name}\n\nFrontend projection (queryable and subscribable).`
      }
    };
  }

  const relation = symbolTable.findRelation(wordInfo.word);
  if (relation) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**relation** ${relation.name}\n\nDefines ownership and connectivity between entities.`
      }
    };
  }

  // Handle qualified names
  const parts = wordInfo.word.split('.');
  if (parts.length >= 2) {
    const entityName = parts[0];
    const fieldName = parts[1];
    const field = symbolTable.findField(entityName, fieldName);
    if (field) {
      let detail = `**${entityName}.${fieldName}**: ${field.type}`;
      if (field.constraints && field.constraints.length > 0) {
        detail += `\n\nConstraints: ${field.constraints.join(', ')}`;
      }
      if (field.defaultValue) {
        detail += `\n\nDefault: \`${field.defaultValue}\``;
      }
      return { contents: { kind: MarkupKind.Markdown, value: detail } };
    }
  }

  // Type hover info
  const typeHovers: { [key: string]: string } = {
    'string': 'Text field',
    'bool': 'Boolean (true/false)',
    'int': 'Integer number',
    'float': 'Floating point number',
    'time': 'Timestamp',
    'file': 'File reference',
    'enum': 'Enumeration type'
  };

  if (typeHovers[wordInfo.word]) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${wordInfo.word}** - ${typeHovers[wordInfo.word]}`
      }
    };
  }

  return null;
});

// Code actions (quick fixes)
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  const actions: CodeAction[] = [];

  for (const diagnostic of params.context.diagnostics) {
    // Quick fix for undefined entity - create it
    if (diagnostic.message.startsWith('Undefined entity:')) {
      const entityName = diagnostic.message.replace('Undefined entity: ', '');
      actions.push({
        title: `Create entity '${entityName}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: Range.create(Position.create(0, 0), Position.create(0, 0)),
              newText: `entity ${entityName} {\n  # TODO: add fields\n}\n\n`
            }]
          }
        }
      });
    }

    // Quick fix for undefined message - create it
    if (diagnostic.message.startsWith('Undefined message:')) {
      const messageName = diagnostic.message.replace('Undefined message: ', '');
      actions.push({
        title: `Create message '${messageName}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: Range.create(Position.create(0, 0), Position.create(0, 0)),
              newText: `message ${messageName} {\n  level: error\n  default: "TODO: message text"\n}\n\n`
            }]
          }
        }
      });
    }

    // Quick fix for undefined job - create it
    if (diagnostic.message.startsWith('Undefined job:')) {
      const jobName = diagnostic.message.replace('Undefined job: ', '');
      actions.push({
        title: `Create job '${jobName}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: Range.create(Position.create(0, 0), Position.create(0, 0)),
              newText: `job ${jobName} {\n  input: TODO\n  needs: TODO\n  effect: TODO\n}\n\n`
            }]
          }
        }
      });
    }
  }

  return actions;
});

// Rename prepare (validate rename)
connection.onPrepareRename((params: TextDocumentPositionParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const wordInfo = getWordAtPosition(document.getText(), params.position.line, params.position.character);
  if (!wordInfo) return null;

  // Check if it's a symbol we can rename
  const def = symbolTable.findDefinition(wordInfo.word);
  if (!def) return null;

  return wordInfo.range;
});

// Rename
connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const wordInfo = getWordAtPosition(document.getText(), params.position.line, params.position.character);
  if (!wordInfo) return null;

  const references = symbolTable.findReferences(wordInfo.word);
  if (references.length === 0) return null;

  const changes: { [uri: string]: TextEdit[] } = {};

  for (const ref of references) {
    if (!changes[ref.uri]) {
      changes[ref.uri] = [];
    }
    changes[ref.uri].push({
      range: ref.range,
      newText: params.newName
    });
  }

  return { changes };
});

// Start the server
documents.listen(connection);
connection.listen();
