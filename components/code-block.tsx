import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { xonokai } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { CopyToClipboard } from 'react-copy-to-clipboard';

interface CodeBlockProps {
  node: {
    language?: string;
    value?: string;
  };
  inline?: boolean;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ node, inline }) => {
  const language = node.language || 'text';
  const value = node.value || '';

  if (inline) {
    return <code>{value}</code>;
  }

  return (
    <div style={{ position: 'relative' }}>
      <CopyToClipboard text={value}>
        <button
          style={{
            position: 'absolute',
            right: '10px',
            top: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '5px',
            padding: '5px',
            zIndex: '50',
            fontSize: '14px',
            fontWeight: 'bold',
            fontFamily: 'sans-serif',
          }}
        >
          Copy
        </button>
      </CopyToClipboard>
      <SyntaxHighlighter language={language} style={xonokai}>
        {value}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodeBlock;
