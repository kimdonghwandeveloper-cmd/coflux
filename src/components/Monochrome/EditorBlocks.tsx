import { createReactBlockSpec } from "@blocknote/react";
import { defaultProps } from "@blocknote/core";
import { Database } from "./Database";
import { Whiteboard } from "./Whiteboard";

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
