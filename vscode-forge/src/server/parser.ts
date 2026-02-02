import { Range, Position } from 'vscode-languageserver';

export type DeclarationType =
  | 'app'
  | 'entity'
  | 'relation'
  | 'rule'
  | 'access'
  | 'action'
  | 'message'
  | 'job'
  | 'hook'
  | 'view'
  | 'test'
  | 'imperative'
  | 'migrate';

export interface ForgeSymbol {
  name: string;
  kind: DeclarationType;
  range: Range;
  nameRange: Range;
  uri: string;
  detail?: string;
  children?: ForgeSymbol[];
}

export interface FieldSymbol {
  name: string;
  type: string;
  range: Range;
  nameRange: Range;
  uri: string;  // Added URI for cross-file navigation
  parentEntity: string;
  constraints?: string[];
  defaultValue?: string;
  enumValues?: string[];
}

export interface Reference {
  name: string;
  range: Range;
  uri: string;
  kind: 'entity' | 'field' | 'action' | 'job' | 'message' | 'view' | 'relation';
}

export interface ParseResult {
  symbols: ForgeSymbol[];
  fields: Map<string, FieldSymbol[]>;
  references: Reference[];
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  range: Range;
  severity: 'error' | 'warning' | 'info';
}

const KEYWORDS = new Set([
  'app', 'entity', 'relation', 'rule', 'access', 'action', 'message',
  'job', 'hook', 'view', 'test', 'imperative', 'migrate',
  'if', 'where', 'and', 'or', 'not', 'in', 'many',
  'forbid', 'require', 'emit', 'enqueue',
  'given', 'when', 'expect', 'reject',
  'read', 'write', 'input', 'needs', 'effect', 'source', 'fields',
  'auth', 'database', 'frontend', 'level', 'default', 'returns',
  'from', 'to', 'map', 'true', 'false', 'unique', 'length',
  'update', 'create', 'delete',
  'after_create', 'after_update', 'after_delete',
  'before_create', 'before_update', 'before_delete'
]);

export class ForgeParser {
  private text: string = '';
  private pos: number = 0;
  private line: number = 0;
  private column: number = 0;
  private uri: string = '';

  parse(text: string, uri: string): ParseResult {
    this.text = text;
    this.pos = 0;
    this.line = 0;
    this.column = 0;
    this.uri = uri;

    const symbols: ForgeSymbol[] = [];
    const fields = new Map<string, FieldSymbol[]>();
    const references: Reference[] = [];
    const errors: ParseError[] = [];

    while (this.pos < this.text.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.text.length) break;

      const startLine = this.line;
      const startColumn = this.column;
      const word = this.readIdentifier();

      if (!word) {
        this.pos++;
        this.column++;
        continue;
      }

      if (this.isDeclarationKeyword(word)) {
        const result = this.parseDeclaration(word as DeclarationType, startLine, startColumn);
        if (result) {
          symbols.push(result.symbol);
          if (result.fields) {
            const existing = fields.get(result.symbol.name) || [];
            fields.set(result.symbol.name, [...existing, ...result.fields]);
          }
          references.push(...result.references);
        }
      }
    }

    return { symbols, fields, references, errors };
  }

  private isDeclarationKeyword(word: string): boolean {
    return ['app', 'entity', 'relation', 'rule', 'access', 'action', 'message',
            'job', 'hook', 'view', 'test', 'imperative', 'migrate'].includes(word);
  }

  private parseDeclaration(kind: DeclarationType, startLine: number, startColumn: number): {
    symbol: ForgeSymbol;
    fields?: FieldSymbol[];
    references: Reference[];
  } | null {
    const references: Reference[] = [];
    this.skipWhitespace();

    let name = '';
    let nameStartLine = this.line;
    let nameStartColumn = this.column;
    let nameEndColumn = this.column;

    if (kind === 'relation') {
      // relation Entity.field -> Target [many]
      const entityName = this.readIdentifier();
      if (!entityName) return null;

      references.push({
        name: entityName,
        range: this.makeRange(nameStartLine, nameStartColumn, nameStartLine, nameStartColumn + entityName.length),
        uri: this.uri,
        kind: 'entity'
      });

      this.skipWhitespace();
      if (this.peek() === '.') {
        this.advance();
        const fieldName = this.readIdentifier();
        name = `${entityName}.${fieldName}`;
        nameEndColumn = this.column;
      } else {
        name = entityName;
        nameEndColumn = nameStartColumn + entityName.length;
      }

      // Parse -> Target
      this.skipWhitespace();
      if (this.peek() === '-' && this.peekAt(1) === '>') {
        this.advance();
        this.advance();
        this.skipWhitespace();
        const targetStartCol = this.column;
        const targetStartLine = this.line;
        const targetName = this.readIdentifier();
        if (targetName) {
          references.push({
            name: targetName,
            range: this.makeRange(targetStartLine, targetStartCol, targetStartLine, targetStartCol + targetName.length),
            uri: this.uri,
            kind: 'entity'
          });
        }
      }
    } else if (kind === 'rule' || kind === 'hook' || kind === 'migrate') {
      // rule Entity.operation or hook Entity.lifecycle
      const entityName = this.readIdentifier();
      if (!entityName) return null;

      references.push({
        name: entityName,
        range: this.makeRange(nameStartLine, nameStartColumn, nameStartLine, nameStartColumn + entityName.length),
        uri: this.uri,
        kind: 'entity'
      });

      this.skipWhitespace();
      if (this.peek() === '.') {
        this.advance();
        const opName = this.readIdentifier();
        name = `${entityName}.${opName}`;
        nameEndColumn = this.column;
      } else {
        name = entityName;
        nameEndColumn = nameStartColumn + entityName.length;
      }
    } else if (kind === 'access') {
      // access Entity { ... }
      const entityName = this.readIdentifier();
      if (!entityName) return null;

      name = entityName;
      nameEndColumn = this.column;

      references.push({
        name: entityName,
        range: this.makeRange(nameStartLine, nameStartColumn, nameStartLine, nameEndColumn),
        uri: this.uri,
        kind: 'entity'
      });
    } else if (kind === 'test') {
      // test Entity.operation or test action_name
      const firstName = this.readIdentifier();
      if (!firstName) return null;

      if (firstName[0] === firstName[0].toUpperCase()) {
        references.push({
          name: firstName,
          range: this.makeRange(nameStartLine, nameStartColumn, nameStartLine, nameStartColumn + firstName.length),
          uri: this.uri,
          kind: 'entity'
        });
      } else {
        references.push({
          name: firstName,
          range: this.makeRange(nameStartLine, nameStartColumn, nameStartLine, nameStartColumn + firstName.length),
          uri: this.uri,
          kind: 'action'
        });
      }

      this.skipWhitespace();
      if (this.peek() === '.') {
        this.advance();
        const opName = this.readIdentifier();
        name = `${firstName}.${opName}`;
        nameEndColumn = this.column;
      } else {
        name = firstName;
        nameEndColumn = nameStartColumn + firstName.length;
      }
    } else {
      // Regular declaration: app Name, entity Name, action name, etc.
      name = this.readIdentifier() || '';
      nameEndColumn = this.column;
    }

    const nameRange = this.makeRange(nameStartLine, nameStartColumn, nameStartLine, nameEndColumn);

    // Skip to opening brace or end of line
    this.skipWhitespace();
    let endLine = this.line;
    let endColumn = this.column;
    let fields: FieldSymbol[] | undefined;

    if (this.peek() === '{') {
      const blockResult = this.parseBlock(kind, name, references);
      endLine = this.line;
      endColumn = this.column;
      fields = blockResult.fields;
    } else {
      // Single line declaration (like relation)
      this.skipToEndOfLine();
      endLine = this.line;
      endColumn = this.column;
    }

    const range = this.makeRange(startLine, startColumn, endLine, endColumn);

    return {
      symbol: { name, kind, range, nameRange, uri: this.uri },
      fields,
      references
    };
  }

  private parseBlock(kind: DeclarationType, parentName: string, references: Reference[]): { fields: FieldSymbol[] } {
    const fields: FieldSymbol[] = [];
    this.advance(); // skip {

    let braceCount = 1;
    while (this.pos < this.text.length && braceCount > 0) {
      this.skipWhitespaceAndComments();

      if (this.peek() === '{') {
        braceCount++;
        this.advance();
        continue;
      }

      if (this.peek() === '}') {
        braceCount--;
        this.advance();
        continue;
      }

      const lineStart = this.line;
      const colStart = this.column;
      const word = this.readIdentifier();

      if (!word) {
        this.advance();
        continue;
      }

      // Check for field definition in entity
      if (kind === 'entity') {
        this.skipWhitespace();
        if (this.peek() === ':') {
          this.advance();
          this.skipWhitespace();
          const typeInfo = this.parseFieldType();
          fields.push({
            name: word,
            type: typeInfo.type,
            range: this.makeRange(lineStart, colStart, this.line, this.column),
            nameRange: this.makeRange(lineStart, colStart, lineStart, colStart + word.length),
            uri: this.uri,
            parentEntity: parentName,
            constraints: typeInfo.constraints,
            defaultValue: typeInfo.defaultValue,
            enumValues: typeInfo.enumValues
          });
        }
      }

      // Parse references in view source and fields
      if (kind === 'view') {
        if (word === 'source') {
          this.skipWhitespace();
          if (this.peek() === ':') {
            this.advance();
            this.skipWhitespace();
            const refStartCol = this.column;
            const refStartLine = this.line;
            const refName = this.readIdentifier();
            if (refName && /^[A-Z]/.test(refName)) {
              references.push({
                name: refName,
                range: this.makeRange(refStartLine, refStartCol, refStartLine, refStartCol + refName.length),
                uri: this.uri,
                kind: 'entity'
              });
            }
          }
        } else if (word === 'fields') {
          // Parse field list: fields: subject, status, author.name
          this.skipWhitespace();
          if (this.peek() === ':') {
            this.advance();
            this.parseFieldList(references);
          }
        }
      }

      // Parse references in job body
      if (kind === 'job') {
        if (word === 'input') {
          this.skipWhitespace();
          if (this.peek() === ':') {
            this.advance();
            this.skipWhitespace();
            const refStartCol = this.column;
            const refStartLine = this.line;
            const refName = this.readIdentifier();
            if (refName && /^[A-Z]/.test(refName)) {
              references.push({
                name: refName,
                range: this.makeRange(refStartLine, refStartCol, refStartLine, refStartCol + refName.length),
                uri: this.uri,
                kind: 'entity'
              });
            }
          }
        } else if (word === 'needs') {
          this.skipWhitespace();
          if (this.peek() === ':') {
            this.advance();
            this.skipWhitespace();
            // Parse path expression like Ticket.org.members
            this.parsePathExpression(references);
          }
        }
      }

      // Parse references in action body
      if (kind === 'action') {
        if (word === 'input') {
          this.skipWhitespace();
          if (this.peek() === ':') {
            this.advance();
            this.skipWhitespace();
            const refStartCol = this.column;
            const refStartLine = this.line;
            const refName = this.readIdentifier();
            if (refName && /^[A-Z]/.test(refName)) {
              references.push({
                name: refName,
                range: this.makeRange(refStartLine, refStartCol, refStartLine, refStartCol + refName.length),
                uri: this.uri,
                kind: 'entity'
              });
            }
          }
        }
      }

      // Parse emit and enqueue references
      if (word === 'emit' || word === 'reject') {
        this.skipWhitespace();
        const msgStartCol = this.column;
        const msgStartLine = this.line;
        const msgName = this.readIdentifier();
        if (msgName && /^[A-Z_]+$/.test(msgName)) {
          references.push({
            name: msgName,
            range: this.makeRange(msgStartLine, msgStartCol, msgStartLine, msgStartCol + msgName.length),
            uri: this.uri,
            kind: 'message'
          });
        }
      }

      if (word === 'enqueue') {
        this.skipWhitespace();
        const jobStartCol = this.column;
        const jobStartLine = this.line;
        const jobName = this.readIdentifier();
        if (jobName) {
          references.push({
            name: jobName,
            range: this.makeRange(jobStartLine, jobStartCol, jobStartLine, jobStartCol + jobName.length),
            uri: this.uri,
            kind: 'job'
          });
        }
      }

      // Parse test body references
      if (kind === 'test') {
        if (word === 'when') {
          this.skipWhitespace();
          const opWord = this.readIdentifier();
          if (opWord === 'action') {
            this.skipWhitespace();
            const actionStartCol = this.column;
            const actionStartLine = this.line;
            const actionName = this.readIdentifier();
            if (actionName) {
              references.push({
                name: actionName,
                range: this.makeRange(actionStartLine, actionStartCol, actionStartLine, actionStartCol + actionName.length),
                uri: this.uri,
                kind: 'action'
              });
            }
          } else if (opWord && /^(update|create|delete)$/.test(opWord)) {
            this.skipWhitespace();
            const entityStartCol = this.column;
            const entityStartLine = this.line;
            const entityName = this.readIdentifier();
            if (entityName && /^[A-Z]/.test(entityName)) {
              references.push({
                name: entityName,
                range: this.makeRange(entityStartLine, entityStartCol, entityStartLine, entityStartCol + entityName.length),
                uri: this.uri,
                kind: 'entity'
              });
            }
          }
        }
      }

      // Skip to end of line for other contexts
      if (!['entity'].includes(kind)) {
        // Continue parsing but don't consume everything
      }
    }

    return { fields };
  }

  private parseFieldList(references: Reference[]): void {
    // Parse comma-separated field references like: subject, status, author.name
    while (this.pos < this.text.length && this.peek() !== '\n' && this.peek() !== '}') {
      this.skipWhitespace();
      const startCol = this.column;
      const startLine = this.line;

      // Read a potentially dotted name
      let name = this.readIdentifier();
      if (!name) {
        if (this.peek() === ',') {
          this.advance();
          continue;
        }
        break;
      }

      // Check for dotted path
      while (this.peek() === '.') {
        this.advance();
        const part = this.readIdentifier();
        if (part) {
          name += '.' + part;
        }
      }

      // If starts with uppercase, it's an entity reference
      if (/^[A-Z]/.test(name)) {
        const entityName = name.split('.')[0];
        references.push({
          name: entityName,
          range: this.makeRange(startLine, startCol, startLine, startCol + entityName.length),
          uri: this.uri,
          kind: 'entity'
        });
      }

      this.skipWhitespace();
      if (this.peek() === ',') {
        this.advance();
      }
    }
  }

  private parsePathExpression(references: Reference[]): void {
    // Parse path expression like Ticket.org.members where role == agent
    const startCol = this.column;
    const startLine = this.line;

    let path = this.readIdentifier();
    if (!path) return;

    // If starts with uppercase, it's an entity
    if (/^[A-Z]/.test(path)) {
      references.push({
        name: path,
        range: this.makeRange(startLine, startCol, startLine, startCol + path.length),
        uri: this.uri,
        kind: 'entity'
      });
    }

    // Continue reading dotted path
    while (this.peek() === '.') {
      this.advance();
      const part = this.readIdentifier();
      if (part) {
        path += '.' + part;
      }
    }
  }

  private parseFieldType(): { type: string; constraints?: string[]; defaultValue?: string; enumValues?: string[] } {
    const constraints: string[] = [];
    let type = '';
    let defaultValue: string | undefined;
    let enumValues: string[] | undefined;

    const typeName = this.readIdentifier();
    if (!typeName) return { type: 'unknown' };

    type = typeName;

    // Check for enum values
    if (typeName === 'enum') {
      this.skipWhitespace();
      if (this.peek() === '(') {
        this.advance();
        enumValues = [];
        while (this.peek() !== ')' && this.pos < this.text.length) {
          this.skipWhitespace();
          const val = this.readIdentifier();
          if (val) enumValues.push(val);
          this.skipWhitespace();
          if (this.peek() === ',') this.advance();
        }
        if (this.peek() === ')') this.advance();
        type = `enum(${enumValues.join(', ')})`;
      }
    }

    // Parse constraints and default value
    while (this.pos < this.text.length && this.peek() !== '\n' && this.peek() !== '}') {
      this.skipWhitespace();
      const word = this.readIdentifier();
      if (!word) {
        if (this.peek() === '=') {
          this.advance();
          this.skipWhitespace();
          defaultValue = this.readIdentifier() || this.readString();
        } else {
          this.advance();
        }
        continue;
      }

      if (word === 'unique') {
        constraints.push('unique');
      } else if (word === 'length') {
        this.skipWhitespace();
        let constraint = 'length';
        while (this.pos < this.text.length && /[<>=\d\s]/.test(this.peek())) {
          constraint += this.peek();
          this.advance();
        }
        constraints.push(constraint.trim());
      }
    }

    return { type, constraints: constraints.length > 0 ? constraints : undefined, defaultValue, enumValues };
  }

  private readIdentifier(): string {
    let result = '';
    while (this.pos < this.text.length && /[a-zA-Z0-9_]/.test(this.peek())) {
      result += this.peek();
      this.advance();
    }
    return result;
  }

  private readString(): string {
    if (this.peek() !== '"') return '';
    this.advance();
    let result = '';
    while (this.pos < this.text.length && this.peek() !== '"') {
      if (this.peek() === '\\') {
        this.advance();
        result += this.peek();
      } else {
        result += this.peek();
      }
      this.advance();
    }
    if (this.peek() === '"') this.advance();
    return result;
  }

  private peek(): string {
    return this.text[this.pos] || '';
  }

  private peekAt(offset: number): string {
    return this.text[this.pos + offset] || '';
  }

  private advance(): void {
    if (this.text[this.pos] === '\n') {
      this.line++;
      this.column = 0;
    } else {
      this.column++;
    }
    this.pos++;
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length && /[ \t]/.test(this.peek())) {
      this.advance();
    }
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.text.length) {
      if (/\s/.test(this.peek())) {
        this.advance();
      } else if (this.peek() === '#') {
        this.skipToEndOfLine();
      } else {
        break;
      }
    }
  }

  private skipToEndOfLine(): void {
    while (this.pos < this.text.length && this.peek() !== '\n') {
      this.advance();
    }
    if (this.peek() === '\n') {
      this.advance();
    }
  }

  private makeRange(startLine: number, startChar: number, endLine: number, endChar: number): Range {
    return Range.create(
      Position.create(startLine, startChar),
      Position.create(endLine, endChar)
    );
  }
}

// Helper to get word at position
export function getWordAtPosition(text: string, line: number, character: number): { word: string; range: Range } | null {
  const lines = text.split('\n');
  if (line >= lines.length) return null;

  const lineText = lines[line];
  let start = character;
  let end = character;

  // Find word boundaries (include dots for path expressions)
  while (start > 0 && /[a-zA-Z0-9_]/.test(lineText[start - 1])) {
    start--;
  }
  while (end < lineText.length && /[a-zA-Z0-9_]/.test(lineText[end])) {
    end++;
  }

  if (start === end) return null;

  const word = lineText.substring(start, end);
  return {
    word,
    range: Range.create(Position.create(line, start), Position.create(line, end))
  };
}
