// FORGE Syntax Highlighter
// Based on vscode-forge/syntaxes/forge.tmLanguage.json

export type TokenType =
  | 'keyword'        // Declaration keywords: app, entity, relation, etc.
  | 'control'        // Control flow: if, where, forbid, require, emit, etc.
  | 'entity'         // Entity/Type names: User, Ticket, Organization (PascalCase)
  | 'function'       // Function names: action/job names (snake_case after keyword)
  | 'field'          // Field names before colon
  | 'type'           // Primitive types: string, bool, time, int, etc.
  | 'operator'       // Operators: ->, ==, and, or, in, etc.
  | 'string'         // String literals: "..."
  | 'number'         // Numeric literals
  | 'constant'       // Constants: true, false
  | 'message'        // Message constants: SCREAMING_CASE
  | 'comment'        // Comments: # ...
  | 'property'       // Property access: .fieldName
  | 'punctuation'    // Braces, colons, etc.
  | 'text';          // Plain text

interface Token {
  type: TokenType;
  value: string;
}

// Keywords by category
const DECLARATION_KEYWORDS = new Set([
  'app', 'entity', 'relation', 'rule', 'access', 'action', 'message',
  'job', 'hook', 'view', 'test', 'imperative', 'migrate'
]);

const CONTROL_KEYWORDS = new Set([
  'if', 'where', 'forbid', 'require', 'emit', 'enqueue',
  'read', 'write', 'given', 'when', 'expect', 'reject',
  'input', 'needs', 'effect', 'source', 'fields', 'filter',
  'order', 'limit', 'create', 'update', 'delete', 'many',
  'level', 'default', 'returns', 'from', 'to', 'map'
]);

const OPERATORS = new Set(['and', 'or', 'not', 'in']);

const TYPES = new Set(['string', 'bool', 'time', 'file', 'int', 'float', 'enum', 'uuid']);

const CONSTANTS = new Set(['true', 'false', 'asc', 'desc', 'error', 'warning', 'info', 'success']);

// Regex patterns
const PATTERNS = {
  comment: /^#.*/,
  string: /^"(?:[^"\\]|\\.)*"/,
  number: /^\d+(?:\.\d+)?/,
  arrow: /^->/,
  comparison: /^(?:<=|>=|==|!=|<|>)/,
  assignment: /^=/,
  punctuation: /^[{}():,\[\]]/,
  entityName: /^[A-Z][a-zA-Z0-9_]*/,
  messageName: /^[A-Z_][A-Z0-9_]*/,
  identifier: /^[a-z_][a-zA-Z0-9_]*/,
  whitespace: /^\s+/,
  dot: /^\./,
  optional: /^\?/,
};

export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let prevToken: Token | null = null;

  while (pos < code.length) {
    const remaining = code.slice(pos);

    // Whitespace
    const wsMatch = remaining.match(PATTERNS.whitespace);
    if (wsMatch) {
      tokens.push({ type: 'text', value: wsMatch[0] });
      pos += wsMatch[0].length;
      continue;
    }

    // Comments
    const commentMatch = remaining.match(PATTERNS.comment);
    if (commentMatch) {
      tokens.push({ type: 'comment', value: commentMatch[0] });
      pos += commentMatch[0].length;
      continue;
    }

    // Strings
    const stringMatch = remaining.match(PATTERNS.string);
    if (stringMatch) {
      tokens.push({ type: 'string', value: stringMatch[0] });
      pos += stringMatch[0].length;
      prevToken = tokens[tokens.length - 1];
      continue;
    }

    // Numbers
    const numMatch = remaining.match(PATTERNS.number);
    if (numMatch) {
      tokens.push({ type: 'number', value: numMatch[0] });
      pos += numMatch[0].length;
      prevToken = tokens[tokens.length - 1];
      continue;
    }

    // Arrow operator
    const arrowMatch = remaining.match(PATTERNS.arrow);
    if (arrowMatch) {
      tokens.push({ type: 'operator', value: arrowMatch[0] });
      pos += arrowMatch[0].length;
      prevToken = tokens[tokens.length - 1];
      continue;
    }

    // Comparison operators
    const compMatch = remaining.match(PATTERNS.comparison);
    if (compMatch) {
      tokens.push({ type: 'operator', value: compMatch[0] });
      pos += compMatch[0].length;
      prevToken = tokens[tokens.length - 1];
      continue;
    }

    // Assignment
    const assignMatch = remaining.match(PATTERNS.assignment);
    if (assignMatch) {
      tokens.push({ type: 'operator', value: assignMatch[0] });
      pos += assignMatch[0].length;
      prevToken = tokens[tokens.length - 1];
      continue;
    }

    // Dot (property access)
    const dotMatch = remaining.match(PATTERNS.dot);
    if (dotMatch) {
      tokens.push({ type: 'punctuation', value: dotMatch[0] });
      pos += dotMatch[0].length;
      prevToken = tokens[tokens.length - 1];
      continue;
    }

    // Optional marker
    const optMatch = remaining.match(PATTERNS.optional);
    if (optMatch) {
      tokens.push({ type: 'operator', value: optMatch[0] });
      pos += optMatch[0].length;
      prevToken = tokens[tokens.length - 1];
      continue;
    }

    // Punctuation
    const punctMatch = remaining.match(PATTERNS.punctuation);
    if (punctMatch) {
      tokens.push({ type: 'punctuation', value: punctMatch[0] });
      pos += punctMatch[0].length;
      prevToken = tokens[tokens.length - 1];
      continue;
    }

    // Entity names (PascalCase) - check before identifiers
    const entityMatch = remaining.match(PATTERNS.entityName);
    if (entityMatch) {
      const value = entityMatch[0];

      // Check if it's a SCREAMING_CASE message constant
      if (PATTERNS.messageName.test(value) && value === value.toUpperCase() && value.includes('_')) {
        tokens.push({ type: 'message', value });
      } else {
        tokens.push({ type: 'entity', value });
      }
      pos += value.length;
      prevToken = tokens[tokens.length - 1];
      continue;
    }

    // Identifiers (snake_case)
    const idMatch = remaining.match(PATTERNS.identifier);
    if (idMatch) {
      const value = idMatch[0];

      // Determine token type based on context and keyword sets
      if (DECLARATION_KEYWORDS.has(value)) {
        tokens.push({ type: 'keyword', value });
      } else if (CONTROL_KEYWORDS.has(value)) {
        tokens.push({ type: 'control', value });
      } else if (OPERATORS.has(value)) {
        tokens.push({ type: 'operator', value });
      } else if (TYPES.has(value)) {
        tokens.push({ type: 'type', value });
      } else if (CONSTANTS.has(value)) {
        tokens.push({ type: 'constant', value });
      } else if (prevToken?.type === 'punctuation' && prevToken.value === '.') {
        // Property access after dot
        tokens.push({ type: 'property', value });
      } else if (prevToken?.type === 'keyword' &&
                 (prevToken.value === 'action' || prevToken.value === 'job' ||
                  prevToken.value === 'hook' || prevToken.value === 'test' ||
                  prevToken.value === 'imperative')) {
        // Function name after action/job/hook keywords
        tokens.push({ type: 'function', value });
      } else {
        // Check if followed by colon (field definition)
        const lookAhead = code.slice(pos + value.length).match(/^\s*:/);
        if (lookAhead) {
          tokens.push({ type: 'field', value });
        } else {
          tokens.push({ type: 'text', value });
        }
      }

      pos += value.length;
      prevToken = tokens[tokens.length - 1];
      continue;
    }

    // Unknown character - just add as text
    tokens.push({ type: 'text', value: remaining[0] });
    pos += 1;
    prevToken = tokens[tokens.length - 1];
  }

  return tokens;
}

// CSS class mapping for each token type
const TOKEN_CLASSES: Record<TokenType, string> = {
  keyword: 'text-violet-400',
  control: 'text-pink-400',
  entity: 'text-amber-400',
  function: 'text-sky-400',
  field: 'text-sky-300',
  type: 'text-emerald-400',
  operator: 'text-pink-400',
  string: 'text-orange-300',
  number: 'text-amber-300',
  constant: 'text-orange-400',
  message: 'text-amber-400',
  comment: 'text-zinc-500 italic',
  property: 'text-sky-300',
  punctuation: 'text-zinc-400',
  text: 'text-zinc-300',
};

export function highlightForge(code: string): string {
  const tokens = tokenize(code);

  return tokens
    .map(token => {
      const className = TOKEN_CLASSES[token.type];
      const escaped = escapeHtml(token.value);

      if (token.type === 'text' && /^\s+$/.test(token.value)) {
        return escaped; // Don't wrap whitespace in spans
      }

      return `<span class="${className}">${escaped}</span>`;
    })
    .join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// SQL Syntax Highlighter
export function highlightSQL(code: string): string {
  const tokens: { type: string; value: string }[] = [];
  let pos = 0;

  const SQL_KEYWORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP',
    'TABLE', 'INDEX', 'VIEW', 'POLICY', 'ON', 'FOR', 'USING', 'WITH', 'AS',
    'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DEFAULT', 'NOT', 'NULL',
    'EXISTS', 'AND', 'OR', 'IN', 'ALL', 'UUID', 'VARCHAR', 'INT', 'TEXT',
    'BOOLEAN', 'TIMESTAMPTZ', 'NOW', 'CASCADE', 'SET', 'CONSTRAINT', 'UNIQUE',
    'CHECK', 'ALTER', 'ADD', 'COLUMN', 'GRANT', 'REVOKE', 'TO', 'ENABLE',
    'ROW', 'LEVEL', 'SECURITY', 'FORCE'
  ]);

  while (pos < code.length) {
    const remaining = code.slice(pos);

    // Whitespace
    const wsMatch = remaining.match(/^\s+/);
    if (wsMatch) {
      tokens.push({ type: 'text', value: wsMatch[0] });
      pos += wsMatch[0].length;
      continue;
    }

    // Comments
    const commentMatch = remaining.match(/^--.*$/m);
    if (commentMatch) {
      tokens.push({ type: 'comment', value: commentMatch[0] });
      pos += commentMatch[0].length;
      continue;
    }

    // Strings
    const stringMatch = remaining.match(/^'[^']*'/);
    if (stringMatch) {
      tokens.push({ type: 'string', value: stringMatch[0] });
      pos += stringMatch[0].length;
      continue;
    }

    // Numbers
    const numMatch = remaining.match(/^\d+/);
    if (numMatch) {
      tokens.push({ type: 'number', value: numMatch[0] });
      pos += numMatch[0].length;
      continue;
    }

    // Identifiers and keywords
    const idMatch = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (idMatch) {
      const value = idMatch[0];
      const upper = value.toUpperCase();
      if (SQL_KEYWORDS.has(upper)) {
        tokens.push({ type: 'keyword', value });
      } else if (/^[a-z]/.test(value)) {
        tokens.push({ type: 'identifier', value });
      } else {
        tokens.push({ type: 'type', value });
      }
      pos += value.length;
      continue;
    }

    // Operators and punctuation
    const punctMatch = remaining.match(/^[();,.*=<>!]/);
    if (punctMatch) {
      tokens.push({ type: 'punctuation', value: punctMatch[0] });
      pos += 1;
      continue;
    }

    tokens.push({ type: 'text', value: remaining[0] });
    pos += 1;
  }

  const TOKEN_STYLES: Record<string, string> = {
    keyword: 'text-violet-400',
    type: 'text-amber-400',
    identifier: 'text-sky-300',
    string: 'text-orange-300',
    number: 'text-amber-300',
    comment: 'text-zinc-500 italic',
    punctuation: 'text-zinc-400',
    text: 'text-zinc-300',
  };

  return tokens
    .map(token => {
      const escaped = escapeHtml(token.value);
      const style = TOKEN_STYLES[token.type] || '';
      if (!style) return escaped;
      return `<span class="${style}">${escaped}</span>`;
    })
    .join('');
}

// TypeScript/JavaScript Syntax Highlighter (tokenizer-based)
export function highlightTypeScript(code: string): string {
  const tokens: { type: string; value: string }[] = [];
  let pos = 0;

  const TS_KEYWORDS = new Set([
    'import', 'export', 'from', 'const', 'let', 'var', 'function', 'return',
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'new', 'this', 'class', 'extends', 'implements', 'interface', 'type',
    'enum', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof',
    'instanceof', 'in', 'of', 'void', 'null', 'undefined', 'default'
  ]);

  while (pos < code.length) {
    const remaining = code.slice(pos);

    // Whitespace
    const wsMatch = remaining.match(/^\s+/);
    if (wsMatch) {
      tokens.push({ type: 'text', value: wsMatch[0] });
      pos += wsMatch[0].length;
      continue;
    }

    // Single-line comments
    const commentMatch = remaining.match(/^\/\/.*$/m);
    if (commentMatch) {
      tokens.push({ type: 'comment', value: commentMatch[0] });
      pos += commentMatch[0].length;
      continue;
    }

    // Strings (single, double, template)
    const stringMatch = remaining.match(/^("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`)/);
    if (stringMatch) {
      tokens.push({ type: 'string', value: stringMatch[0] });
      pos += stringMatch[0].length;
      continue;
    }

    // Numbers
    const numMatch = remaining.match(/^\d+\.?\d*/);
    if (numMatch) {
      tokens.push({ type: 'number', value: numMatch[0] });
      pos += numMatch[0].length;
      continue;
    }

    // Arrow function
    const arrowMatch = remaining.match(/^=>/);
    if (arrowMatch) {
      tokens.push({ type: 'operator', value: '=>' });
      pos += 2;
      continue;
    }

    // Operators (multi-char first)
    const opMatch = remaining.match(/^(===|!==|==|!=|<=|>=|&&|\|\||\.\.\.|\+\+|--|\+=|-=|\*=|\/=)/);
    if (opMatch) {
      tokens.push({ type: 'operator', value: opMatch[0] });
      pos += opMatch[0].length;
      continue;
    }

    // Single char operators/punctuation
    const singleOp = remaining.match(/^[+\-*/%=<>!&|?:;,.\[\]{}()]/);
    if (singleOp) {
      tokens.push({ type: 'punctuation', value: singleOp[0] });
      pos += 1;
      continue;
    }

    // Identifiers
    const idMatch = remaining.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
    if (idMatch) {
      const value = idMatch[0];
      if (TS_KEYWORDS.has(value)) {
        tokens.push({ type: 'keyword', value });
      } else if (value === 'true' || value === 'false') {
        tokens.push({ type: 'boolean', value });
      } else if (/^[A-Z]/.test(value)) {
        tokens.push({ type: 'type', value });
      } else {
        tokens.push({ type: 'identifier', value });
      }
      pos += value.length;
      continue;
    }

    // JSX tags
    const jsxMatch = remaining.match(/^<\/?[A-Za-z][A-Za-z0-9]*|^\/?>/);
    if (jsxMatch) {
      tokens.push({ type: 'jsx', value: jsxMatch[0] });
      pos += jsxMatch[0].length;
      continue;
    }

    // Unknown - just add as text
    tokens.push({ type: 'text', value: remaining[0] });
    pos += 1;
  }

  // Convert tokens to HTML
  const TOKEN_STYLES: Record<string, string> = {
    keyword: 'text-violet-400',
    type: 'text-amber-400',
    identifier: 'text-zinc-300',
    string: 'text-orange-300',
    number: 'text-amber-300',
    boolean: 'text-orange-400',
    operator: 'text-pink-400',
    punctuation: 'text-zinc-400',
    comment: 'text-zinc-500 italic',
    jsx: 'text-sky-400',
    text: '',
  };

  return tokens
    .map(token => {
      const escaped = escapeHtml(token.value);
      const style = TOKEN_STYLES[token.type];
      if (!style || token.type === 'text') {
        return escaped;
      }
      return `<span class="${style}">${escaped}</span>`;
    })
    .join('');
}

// Bash/Shell Syntax Highlighter (tokenizer-based)
export function highlightBash(code: string): string {
  const tokens: { type: string; value: string }[] = [];
  let pos = 0;

  const COMMANDS = new Set([
    'forge', 'npm', 'cd', 'curl', 'mkdir', 'ls', 'cat', 'echo', 'git',
    'run', 'build', 'dev', 'install', 'open', 'export', 'source'
  ]);

  while (pos < code.length) {
    const remaining = code.slice(pos);

    // Whitespace
    const wsMatch = remaining.match(/^\s+/);
    if (wsMatch) {
      tokens.push({ type: 'text', value: wsMatch[0] });
      pos += wsMatch[0].length;
      continue;
    }

    // Comments
    const commentMatch = remaining.match(/^#.*$/m);
    if (commentMatch) {
      tokens.push({ type: 'comment', value: commentMatch[0] });
      pos += commentMatch[0].length;
      continue;
    }

    // Strings
    const stringMatch = remaining.match(/^("[^"]*"|'[^']*')/);
    if (stringMatch) {
      tokens.push({ type: 'string', value: stringMatch[0] });
      pos += stringMatch[0].length;
      continue;
    }

    // Variables
    const varMatch = remaining.match(/^\$[A-Za-z_][A-Za-z0-9_]*|\$\{[^}]+\}/);
    if (varMatch) {
      tokens.push({ type: 'variable', value: varMatch[0] });
      pos += varMatch[0].length;
      continue;
    }

    // URLs
    const urlMatch = remaining.match(/^https?:\/\/[^\s]*/);
    if (urlMatch) {
      tokens.push({ type: 'url', value: urlMatch[0] });
      pos += urlMatch[0].length;
      continue;
    }

    // Flags
    const flagMatch = remaining.match(/^--?[a-zA-Z][a-zA-Z0-9-]*/);
    if (flagMatch) {
      tokens.push({ type: 'flag', value: flagMatch[0] });
      pos += flagMatch[0].length;
      continue;
    }

    // Words/identifiers
    const wordMatch = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_-]*/);
    if (wordMatch) {
      const value = wordMatch[0];
      if (COMMANDS.has(value)) {
        tokens.push({ type: 'command', value });
      } else {
        tokens.push({ type: 'text', value });
      }
      pos += value.length;
      continue;
    }

    // Numbers
    const numMatch = remaining.match(/^\d+/);
    if (numMatch) {
      tokens.push({ type: 'number', value: numMatch[0] });
      pos += numMatch[0].length;
      continue;
    }

    // Punctuation and operators
    const punctMatch = remaining.match(/^[|&;><(){}\[\]=:,./\\]/);
    if (punctMatch) {
      tokens.push({ type: 'punctuation', value: punctMatch[0] });
      pos += 1;
      continue;
    }

    // Unknown
    tokens.push({ type: 'text', value: remaining[0] });
    pos += 1;
  }

  const TOKEN_STYLES: Record<string, string> = {
    command: 'text-emerald-400',
    flag: 'text-sky-400',
    string: 'text-orange-300',
    variable: 'text-amber-400',
    url: 'text-sky-300',
    number: 'text-amber-300',
    comment: 'text-zinc-500 italic',
    punctuation: 'text-zinc-500',
    text: 'text-zinc-300',
  };

  return tokens
    .map(token => {
      const escaped = escapeHtml(token.value);
      const style = TOKEN_STYLES[token.type];
      if (!style || style === 'text-zinc-300') {
        return `<span class="text-zinc-300">${escaped}</span>`;
      }
      return `<span class="${style}">${escaped}</span>`;
    })
    .join('');
}
