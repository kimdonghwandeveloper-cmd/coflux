import { createReactBlockSpec } from "@blocknote/react";
import { defaultProps } from "@blocknote/core";
import { Database } from "./Database";
import { Whiteboard } from "./Whiteboard";
import { ChartBlock as ChartComponent } from "./Chart";

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
    },
    content: "none",
  },
  {
    render: (props: any) => {
      const { block } = props;
      const scopeId = block.props.scopeId;
      return (
        <div className="w-full min-h-[400px] my-6 overflow-hidden border border-border rounded-2xl shadow-2xl bg-bg-primary group/block relative">
          <ChartComponent scopeId={scopeId} />
           {/* Block Badge */}
           <div className="absolute top-4 right-4 bg-black/5 backdrop-blur-md px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest text-secondary pointer-events-none opacity-0 group-hover/block:opacity-100 transition-opacity">
            Visual Insights : {scopeId}
          </div>
        </div>
      );
    },
  }
);
