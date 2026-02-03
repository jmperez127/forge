import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Play,
  Copy,
  Check,
  FileCode,
  Database,
  FileJson,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Sparkles,
  BookOpen,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";

// Examples
const EXAMPLES = {
  minimal: {
    title: "Minimal",
    icon: "✨",
    description: "The simplest FORGE app",
    code: `# Minimal - The simplest FORGE app
app Minimal {
  auth: token
  database: postgres
}

entity Task {
  title: string
  done: bool = false
  created_at: time = now()
}

entity User {
  email: string unique
  name: string
}

relation Task.owner -> User

access Task {
  read: owner == user
  write: owner == user
}

access User {
  read: true
  write: user == this
}

view TaskList {
  source: Task
  filter: owner == user
  fields: id, title, done, created_at
}

action toggle_task {
  input: Task
}`,
  },
  helpdesk: {
    title: "Helpdesk",
    icon: "🎫",
    description: "Ticket management system",
    code: `# Helpdesk - Ticket Management
app Helpdesk {
  auth: oauth
  database: postgres
}

entity Organization {
  name: string
  plan: enum(free, pro, enterprise) = free
}

entity User {
  email: string unique
  name: string
  role: enum(admin, agent, customer) = customer
}

entity Ticket {
  subject: string length <= 120
  description: string
  status: enum(open, pending, resolved, closed) = open
  priority: enum(low, medium, high, urgent) = medium
  created_at: time = now()
}

relation User.organization -> Organization
relation Ticket.author -> User
relation Ticket.assignee -> User
relation Ticket.organization -> Organization

rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}

access Ticket {
  read: user in organization.members
  write: user == author or user == assignee
}

action close_ticket {
  input: Ticket
}

action assign_ticket {
  input: Ticket
  params: assignee_id uuid
}

hook Ticket.after_create {
  enqueue notify_agent
}

job notify_agent {
  input: Ticket
  effect: email.send
}

view TicketList {
  source: Ticket
  fields: id, subject, status, priority, author.name
}

message TICKET_CLOSED {
  level: error
  default: "This ticket is already closed."
}`,
  },
  blog: {
    title: "Blog",
    icon: "📝",
    description: "Multi-author publishing",
    code: `# Blog - Publishing Platform
app Blog {
  auth: oauth
  database: postgres
}

entity User {
  email: string unique
  name: string
  role: enum(reader, author, editor, admin) = reader
  avatar_url: string nullable
}

entity Post {
  title: string length <= 200
  slug: string unique
  content: string
  status: enum(draft, review, published) = draft
  published_at: time nullable
  created_at: time = now()
}

entity Comment {
  content: string length <= 1000
  status: enum(pending, approved, rejected) = pending
  created_at: time = now()
}

relation Post.author -> User
relation Comment.post -> Post
relation Comment.author -> User

rule Post.publish {
  forbid if status != review
    emit NOT_IN_REVIEW
}

rule Comment.create {
  forbid if post.status != published
    emit POST_NOT_PUBLISHED
}

access Post {
  read: status == published or user == author
  write: user == author or user.role == editor
}

action publish_post {
  input: Post
}

view PublishedPosts {
  source: Post
  filter: status == published
  fields: id, title, slug, author.name, published_at
  order: published_at desc
}

message NOT_IN_REVIEW {
  level: error
  default: "Post must be submitted for review."
}

message POST_NOT_PUBLISHED {
  level: error
  default: "Cannot comment on unpublished posts."
}`,
  },
  chat: {
    title: "Chat",
    icon: "💬",
    description: "Real-time messaging",
    code: `# Chat - Real-time Messaging
app Chat {
  auth: oauth
  database: postgres
}

entity User {
  email: string unique
  name: string
  avatar_url: string nullable
  status: enum(online, away, offline) = offline
}

entity Channel {
  name: string
  type: enum(public, private, direct) = public
}

entity Message {
  content: string
  type: enum(text, image, system) = text
  created_at: time = now()
}

relation Channel.owner -> User
relation Channel.members -> User many
relation Message.channel -> Channel
relation Message.author -> User
relation Message.parent -> Message nullable

rule Message.update {
  forbid if author != user
    emit NOT_YOUR_MESSAGE
  forbid if created_at < now() - 24h
    emit TOO_OLD_TO_EDIT
}

access Channel {
  read: type == public or user in members
  write: user == owner
}

access Message {
  read: user in channel.members
  write: user in channel.members
}

hook Message.after_create {
  broadcast channel_message
}

view ChannelMessages {
  source: Message
  filter: parent == null
  fields: id, content, author.name, created_at
  order: created_at desc
  limit: 50
}

message NOT_YOUR_MESSAGE {
  level: error
  default: "You can only edit your own messages."
}

message TOO_OLD_TO_EDIT {
  level: error
  default: "Messages older than 24 hours cannot be edited."
}`,
  },
};

type ExampleKey = keyof typeof EXAMPLES;

interface GeneratedFile {
  name: string;
  content: string;
  language: string;
}

interface FileTreeItem {
  name: string;
  type: "file" | "folder";
  children?: FileTreeItem[];
  file?: GeneratedFile;
}

export default function Playground() {
  const [code, setCode] = useState(EXAMPLES.minimal.code);
  const [selectedExample, setSelectedExample] = useState<ExampleKey>("minimal");
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["sdk"]));
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Generate output on mount and when code changes
  useEffect(() => {
    compile();
  }, []);

  const compile = useCallback(() => {
    setIsCompiling(true);
    setTimeout(() => {
      const files = generateOutput(code);
      setGeneratedFiles(files);
      if (files.length > 0 && !selectedFile) {
        setSelectedFile(files.find((f) => f.name === "artifact.json") || files[0]);
      }
      setIsCompiling(false);
    }, 300);
  }, [code]);

  const loadExample = (key: ExampleKey) => {
    setSelectedExample(key);
    setCode(EXAMPLES[key].code);
    setTimeout(() => compile(), 0);
  };

  const handleEditorScroll = () => {
    if (lineNumbersRef.current && editorRef.current) {
      lineNumbersRef.current.scrollTop = editorRef.current.scrollTop;
    }
  };

  const copyToClipboard = async () => {
    if (selectedFile) {
      await navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const lineCount = code.split("\n").length;

  // Build file tree
  const fileTree = buildFileTree(generatedFiles);

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-4 gap-4 sticky top-0 z-50">
        <Link
          to="/"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </Link>

        <div className="flex items-center gap-2 ml-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-forge-500 to-forge-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold bg-gradient-to-r from-forge-400 to-forge-500 bg-clip-text text-transparent">
            FORGE Playground
          </span>
        </div>

        <div className="flex-1" />

        {/* Example selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Examples:</span>
          <div className="flex gap-1">
            {(Object.keys(EXAMPLES) as ExampleKey[]).map((key) => (
              <button
                key={key}
                onClick={() => loadExample(key)}
                className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                  selectedExample === key
                    ? "bg-forge-500/20 text-forge-400 border border-forge-500/30"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="mr-1.5">{EXAMPLES[key].icon}</span>
                {EXAMPLES[key].title}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={compile}
          disabled={isCompiling}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
        >
          {isCompiling ? (
            <RotateCcw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          <span className="font-medium">Compile</span>
        </button>

        <Link
          to="/docs"
          className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-sm">Docs</span>
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Editor Panel */}
        <div className="w-1/2 flex flex-col border-r border-border">
          <div className="h-10 border-b border-border bg-muted/30 flex items-center px-4 gap-2">
            <FileCode className="w-4 h-4 text-forge-400" />
            <span className="text-sm font-medium">app.forge</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {lineCount} lines
            </span>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Line numbers */}
            <div
              ref={lineNumbersRef}
              className="w-12 bg-muted/20 border-r border-border overflow-hidden select-none"
            >
              <div className="py-3 px-2 text-right font-mono text-xs text-muted-foreground leading-6">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
            </div>

            {/* Editor */}
            <textarea
              ref={editorRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onScroll={handleEditorScroll}
              spellCheck={false}
              className="flex-1 bg-background p-3 font-mono text-sm leading-6 resize-none outline-none text-foreground"
              style={{ tabSize: 2 }}
            />
          </div>

          <div className="h-8 border-t border-border bg-muted/30 flex items-center px-4 text-xs text-muted-foreground">
            <span className={isCompiling ? "text-amber-400" : "text-emerald-400"}>
              {isCompiling ? "Compiling..." : "Ready"}
            </span>
          </div>
        </div>

        {/* Output Panel */}
        <div className="flex-1 flex flex-col">
          <div className="h-10 border-b border-border bg-muted/30 flex items-center px-4 gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium">Generated Output</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {generatedFiles.length} files
            </span>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* File tree */}
            <div className="w-56 border-r border-border bg-muted/10 overflow-y-auto">
              <div className="p-2">
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                  <Folder className="w-4 h-4 text-amber-500" />
                  <span className="font-medium">.forge-runtime</span>
                </div>
                <div className="mt-1">
                  {fileTree.map((item) => (
                    <FileTreeNode
                      key={item.name}
                      item={item}
                      depth={1}
                      selectedFile={selectedFile}
                      onSelectFile={setSelectedFile}
                      expandedFolders={expandedFolders}
                      onToggleFolder={toggleFolder}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* File preview */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedFile ? (
                <>
                  <div className="h-10 border-b border-border bg-muted/30 flex items-center px-4 justify-between">
                    <div className="flex items-center gap-2">
                      {getFileIcon(selectedFile.name)}
                      <span className="text-sm font-mono">{selectedFile.name}</span>
                    </div>
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto bg-background">
                    <pre className="p-4 text-sm font-mono leading-6">
                      <code className={`language-${selectedFile.language}`}>
                        {selectedFile.content}
                      </code>
                    </pre>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  Select a file to preview
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Info panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-t border-border bg-card/50 p-4"
      >
        <div className="max-w-4xl mx-auto flex items-center gap-8 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium">artifact.json</span> - Runtime
              configuration
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium">schema.sql</span> - Database
              migrations with RLS
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium">sdk/</span> - Type-safe
              TypeScript client
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// File tree node component
function FileTreeNode({
  item,
  depth,
  selectedFile,
  onSelectFile,
  expandedFolders,
  onToggleFolder,
}: {
  item: FileTreeItem;
  depth: number;
  selectedFile: GeneratedFile | null;
  onSelectFile: (file: GeneratedFile) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
}) {
  const isExpanded = expandedFolders.has(item.name);
  const isSelected = item.file && selectedFile?.name === item.file.name;

  if (item.type === "folder") {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(item.name)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 text-amber-500" />
          ) : (
            <Folder className="w-4 h-4 text-amber-500" />
          )}
          <span>{item.name}</span>
        </button>
        {isExpanded && item.children && (
          <div>
            {item.children.map((child) => (
              <FileTreeNode
                key={child.name}
                item={child}
                depth={depth + 1}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => item.file && onSelectFile(item.file)}
      className={`w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded transition-colors ${
        isSelected
          ? "bg-forge-500/20 text-forge-400"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
      style={{ paddingLeft: `${depth * 12 + 16}px` }}
    >
      {getFileIcon(item.name)}
      <span className="font-mono text-xs">{item.name}</span>
    </button>
  );
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop();
  switch (ext) {
    case "json":
      return <FileJson className="w-4 h-4 text-amber-400" />;
    case "sql":
      return <Database className="w-4 h-4 text-blue-400" />;
    case "ts":
    case "tsx":
      return <FileCode className="w-4 h-4 text-cyan-400" />;
    default:
      return <FileCode className="w-4 h-4 text-muted-foreground" />;
  }
}

function buildFileTree(files: GeneratedFile[]): FileTreeItem[] {
  const tree: FileTreeItem[] = [];
  const folders: Record<string, FileTreeItem> = {};

  for (const file of files) {
    const parts = file.name.split("/");
    if (parts.length === 1) {
      tree.push({ name: file.name, type: "file", file });
    } else {
      const folderName = parts[0];
      if (!folders[folderName]) {
        folders[folderName] = { name: folderName, type: "folder", children: [] };
        tree.push(folders[folderName]);
      }
      folders[folderName].children!.push({
        name: parts.slice(1).join("/"),
        type: "file",
        file,
      });
    }
  }

  return tree;
}

// Mock compiler
function generateOutput(source: string): GeneratedFile[] {
  const appMatch = source.match(/app\s+(\w+)/);
  const appName = appMatch ? appMatch[1] : "App";

  const entities = [...source.matchAll(/entity\s+(\w+)\s*\{([^}]+)\}/g)].map((m) => ({
    name: m[1],
    fields: parseFields(m[2]),
  }));

  const views = [...source.matchAll(/view\s+(\w+)\s*\{([^}]+)\}/g)].map((m) => ({
    name: m[1],
    source: m[2].match(/source:\s*(\w+)/)?.[1] || "",
  }));

  const actions = [...source.matchAll(/action\s+(\w+)\s*\{([^}]+)\}/g)].map((m) => ({
    name: m[1],
    input: m[2].match(/input:\s*(\w+)/)?.[1] || "",
  }));

  const access = [...source.matchAll(/access\s+(\w+)\s*\{([^}]+)\}/g)].map((m) => ({
    entity: m[1],
    read: m[2].match(/read:\s*([^\n]+)/)?.[1]?.trim() || "false",
    write: m[2].match(/write:\s*([^\n]+)/)?.[1]?.trim() || "false",
  }));

  return [
    {
      name: "artifact.json",
      language: "json",
      content: generateArtifact(appName, entities, views, actions),
    },
    {
      name: "schema.sql",
      language: "sql",
      content: generateSQL(entities, access),
    },
    {
      name: "sdk/client.ts",
      language: "typescript",
      content: generateClient(appName, entities, views, actions),
    },
    {
      name: "sdk/react.tsx",
      language: "typescript",
      content: generateReact(appName, views),
    },
  ];
}

function parseFields(fieldStr: string) {
  const fields: { name: string; type: string }[] = [];
  const lines = fieldStr.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  for (const line of lines) {
    const match = line.match(/(\w+):\s*(\w+)/);
    if (match) {
      fields.push({ name: match[1], type: match[2] });
    }
  }
  return fields;
}

function typeToSQL(type: string) {
  const map: Record<string, string> = {
    string: "TEXT",
    int: "INTEGER",
    float: "DOUBLE PRECISION",
    bool: "BOOLEAN",
    time: "TIMESTAMPTZ",
    date: "DATE",
    uuid: "UUID",
    json: "JSONB",
  };
  return map[type] || "TEXT";
}

function typeToTS(type: string) {
  const map: Record<string, string> = {
    string: "string",
    int: "number",
    float: "number",
    bool: "boolean",
    time: "string",
    date: "string",
    uuid: "string",
    json: "Record<string, unknown>",
  };
  return map[type] || "unknown";
}

function generateArtifact(
  appName: string,
  entities: { name: string; fields: { name: string; type: string }[] }[],
  views: { name: string; source: string }[],
  actions: { name: string; input: string }[]
) {
  const artifact = {
    version: "1.0.0",
    app_name: appName,
    entities: Object.fromEntries(
      entities.map((e) => [
        e.name,
        {
          name: e.name,
          table: e.name.toLowerCase() + "s",
          fields: {
            id: { name: "id", type: "uuid", sql_type: "UUID" },
            ...Object.fromEntries(
              e.fields.map((f) => [f.name, { name: f.name, type: f.type, sql_type: typeToSQL(f.type) }])
            ),
          },
        },
      ])
    ),
    views: Object.fromEntries(views.map((v) => [v.name, { name: v.name, source: v.source }])),
    actions: Object.fromEntries(actions.map((a) => [a.name, { name: a.name, input_entity: a.input }])),
    migration: { version: "001", up: [], down: [] },
  };
  return JSON.stringify(artifact, null, 2);
}

function generateSQL(
  entities: { name: string; fields: { name: string; type: string }[] }[],
  access: { entity: string; read: string; write: string }[]
) {
  let sql = `-- Generated by FORGE Compiler
-- Database schema with Row-Level Security

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

`;

  for (const entity of entities) {
    const table = entity.name.toLowerCase() + "s";
    sql += `-- ${entity.name}
CREATE TABLE IF NOT EXISTS ${table} (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
${entity.fields.map((f) => `    ${f.name} ${typeToSQL(f.type)}`).join(",\n")},
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;

`;
  }

  for (const acc of access) {
    const table = acc.entity.toLowerCase() + "s";
    sql += `-- RLS Policies for ${acc.entity}
CREATE POLICY ${table}_select ON ${table}
    FOR SELECT USING (${acc.read === "true" ? "true" : `/* ${acc.read} */ true`});

CREATE POLICY ${table}_modify ON ${table}
    FOR ALL USING (${acc.write === "true" ? "true" : `/* ${acc.write} */ true`});

`;
  }

  return sql;
}

function generateClient(
  appName: string,
  entities: { name: string; fields: { name: string; type: string }[] }[],
  views: { name: string; source: string }[],
  actions: { name: string; input: string }[]
) {
  return `// Generated by FORGE Compiler
// Type-safe client for ${appName}

import { ForgeClient } from '@forge/client';

// Types
${entities
  .map(
    (e) => `export interface ${e.name} {
  id: string;
${e.fields.map((f) => `  ${f.name}: ${typeToTS(f.type)};`).join("\n")}
  created_at: string;
  updated_at: string;
}`
  )
  .join("\n\n")}

// Client
export class ${appName}Client extends ForgeClient {
  // Entity accessors
${entities.map((e) => `  readonly ${e.name.toLowerCase()}s = this.entity<${e.name}>('${e.name}');`).join("\n")}

  // View fetchers
${views.map((v) => `  async ${toCamelCase(v.name)}() {\n    return this.view('${v.name}');\n  }`).join("\n\n")}

  // Action executors
${actions
  .map(
    (a) =>
      `  async ${toCamelCase(a.name)}(${a.input ? `input: { ${a.input.toLowerCase()}: string }` : ""}) {\n    return this.action('${a.name}'${a.input ? ", input" : ""});\n  }`
  )
  .join("\n\n")}
}

export const client = new ${appName}Client({
  baseUrl: process.env.FORGE_API_URL || 'http://localhost:8080',
});
`;
}

function generateReact(appName: string, views: { name: string; source: string }[]) {
  return `// Generated by FORGE Compiler
// React hooks for ${appName}

import { useState, useEffect, useCallback } from 'react';
import { client } from './client';

interface UseViewResult<T> {
  data: T[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

${views
  .map(
    (v) => `export function use${v.name}(): UseViewResult<any> {
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const result = await client.${toCamelCase(v.name)}();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const unsubscribe = client.subscribe('${v.name}', {
      onData: setData,
    });
    return unsubscribe;
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}`
  )
  .join("\n\n")}
`;
}

function toCamelCase(str: string) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase());
}
