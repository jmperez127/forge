import { cn } from "@/lib/utils";
import { highlightForge } from "@/lib/syntax-highlight";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
}

export function CodeBlock({
  code,
  language = "forge",
  filename,
  className,
  showLineNumbers = false,
  highlightLines = [],
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split("\n");

  return (
    <div className={cn("code-block group relative", className)}>
      {filename && (
        <div className="code-header flex items-center justify-between">
          <span>{filename}</span>
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent rounded"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      )}
      <div className="code-content">
        <pre className="overflow-x-auto">
          <code>
            {showLineNumbers ? (
              <table className="w-full">
                <tbody>
                  {lines.map((line, i) => (
                    <tr
                      key={i}
                      className={cn(
                        highlightLines.includes(i + 1) && "bg-forge-500/10"
                      )}
                    >
                      <td className="select-none pr-4 text-right text-zinc-600 w-8 align-top">
                        {i + 1}
                      </td>
                      <td>
                        {language === "forge" ? (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: highlightForge(line),
                            }}
                          />
                        ) : (
                          line
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : language === "forge" ? (
              lines.map((line, i) => (
                <span key={i}>
                  <span dangerouslySetInnerHTML={{ __html: highlightForge(line) }} />
                  {i < lines.length - 1 && "\n"}
                </span>
              ))
            ) : (
              code
            )}
          </code>
        </pre>
      </div>
    </div>
  );
}
