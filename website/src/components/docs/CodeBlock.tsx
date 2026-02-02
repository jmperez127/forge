import { highlightForge, highlightTypeScript, highlightBash, highlightSQL } from "@/lib/syntax-highlight";

interface CodeBlockProps {
  code: string;
  language?: "forge" | "typescript" | "bash" | "sql" | "json";
  filename?: string;
  className?: string;
}

export function CodeBlock({ code, language = "forge", filename, className }: CodeBlockProps) {
  const highlight = (line: string): string => {
    switch (language) {
      case "typescript":
        return highlightTypeScript(line);
      case "bash":
        return highlightBash(line);
      case "sql":
        return highlightSQL(line);
      case "json":
        return highlightTypeScript(line); // JSON highlighting works with TS highlighter
      default:
        return highlightForge(line);
    }
  };

  return (
    <div className={`code-block ${className || ""}`}>
      {filename && (
        <div className="code-header">
          <span className="text-forge-400">{filename}</span>
        </div>
      )}
      <div className="code-content">
        <pre className="text-sm overflow-x-auto">
          <code>
            {code.split("\n").map((line, i) => (
              <span key={i}>
                <span dangerouslySetInnerHTML={{ __html: highlight(line) }} />
                {i < code.split("\n").length - 1 && "\n"}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
