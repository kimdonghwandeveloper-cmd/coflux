import { createReactBlockSpec } from "@blocknote/react";
import { defaultProps } from "@blocknote/core";
import { Database } from "./Database";
import { Whiteboard } from "./Whiteboard";
import { ChartBlock as ChartComponent } from "./Chart";
import { Mermaid } from "./Mermaid";

// Database Block Specification Using createReactBlockSpec (v0.47+ factory style)
export const DatabaseBlock = createReactBlockSpec(
  {
    type: "database",
    propSchema: {
      ...defaultProps,
      scopeId: {
        default: "db_default",
      },
    },
    content: "none",
  },
  {
    render: (props: any) => {
      const { block } = props;
      const scopeId = block.props.scopeId;
      return (
        <div className="w-full h-[600px] my-6 overflow-hidden border border-border rounded-2xl shadow-2xl bg-bg-primary group/block relative">
          <Database scopeId={scopeId} />
           {/* Block Badge */}
           <div className="absolute top-4 right-4 bg-black/5 backdrop-blur-md px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest text-secondary pointer-events-none opacity-0 group-hover/block:opacity-100 transition-opacity">
            Monochrome Database : {scopeId}
          </div>
        </div>
      );
    },
  }
);

// Whiteboard Block Specification Using createReactBlockSpec (v0.47+ factory style)
export const WhiteboardBlock = createReactBlockSpec(
  {
    type: "whiteboard",
    propSchema: {
      ...defaultProps,
      scopeId: {
        default: "wb_default",
      },
    },
    content: "none",
  },
  {
    render: (props: any) => {
      const { block } = props;
      const scopeId = block.props.scopeId;
      return (
        <div className="w-full h-[600px] my-6 overflow-hidden border border-border rounded-2xl shadow-2xl bg-bg-primary group/block relative">
          <Whiteboard scopeId={scopeId} />
          {/* Block Badge */}
          <div className="absolute top-4 right-4 bg-black/5 backdrop-blur-md px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest text-secondary pointer-events-none opacity-0 group-hover/block:opacity-100 transition-opacity">
            Infinite Whiteboard : {scopeId}
          </div>
        </div>
      );
    },
  }
);

// Chart Block Specification
export const ChartBlock = createReactBlockSpec(
  {
    type: "chart",
    propSchema: {
      ...defaultProps,
      scopeId: {
        default: "ch_default",
      },
      type: {
        default: "bar",
      },
    },
    content: "none",
  },
  {
    render: (props: any) => {
      const { block, editor } = props;
      const scopeId = block.props.scopeId;
      const type = block.props.type || "bar";
      return (
        <div 
          className="w-full min-h-[400px] my-4 overflow-hidden bg-transparent group/block relative"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <ChartComponent scopeId={scopeId} initialType={type} />
        </div>
      );
    },
  }
);

// Mermaid Block Specification
export const MermaidBlock = createReactBlockSpec(
  {
    type: "mermaid",
    propSchema: {
      ...defaultProps,
      code: {
        default: 'graph TD\n  A[Start] --> B(Concept)\n  B --> C{Strategy}\n  C -->|Fast| D[Execution]\n  C -->|Slow| E[Planning]\n  D --> F((Launch))\n  E --> B',
      },
    },
    content: "none",
  },
  {
    render: (props: any) => {
      const { block, editor } = props;
      const code = block.props.code;
      return (
        <div 
          className="w-full my-4 bg-transparent group/block relative"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Mermaid 
            code={code} 
            onCodeChange={(newCode) => {
              editor.updateBlock(block, { props: { ...block.props, code: newCode } });
            }} 
          />
        </div>
      );
    },
  }
);
