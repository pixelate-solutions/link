import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "@/styles.css";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  let cleaned = content.trim();

  // Remove surrounding quotes if present.
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  // Convert literal "\n" sequences to actual newlines.
  cleaned = cleaned.replace(/\\n/g, "\n");

  // Replace double backslashes with a single backslash.
  cleaned = cleaned.replace(/\\\\/g, "\\");

  // Escape inline dollar signs so they don't become math (e.g. "$12" -> "\$12").
  cleaned = cleaned.replace(/\$(\d)/g, '\\$$1');

  // Remove any leading spaces before math block delimiters so they are flush left.
  cleaned = cleaned.replace(/^\s*\\\[/gm, "\\[");
  cleaned = cleaned.replace(/^\s*\\\]/gm, "\\]");

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
