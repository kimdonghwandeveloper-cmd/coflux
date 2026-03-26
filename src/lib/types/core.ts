export type FieldType = 'text' | 'number' | 'status' | 'date' | 'select';

export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: FieldType;
  options?: string[]; // select 타입일 경우 사용 (예: ["To Do", "In Progress", "Done"])
}

export interface Task {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  customFields: Record<string, any>; // [fieldDefinitionId]: value
}

export interface WhiteboardNodeData {
  label: string;
  taskId?: string; // 태스크로 변환된 경우 해당 태스크의 ID
  isTask: boolean;
  note?: string;
}

export type WidgetType = 'donut' | 'bar' | 'stat';

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  targetFieldId: string; // 집계 대상 필드 ID (예: 'Status' 필드)
  layout: { x: number; y: number; w: number; h: number };
}
