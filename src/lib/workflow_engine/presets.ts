import type { WorkflowDefinition } from "./types";

// 5 built-in preset workflow definitions.
// IDs must be valid UUIDs to pass WorkflowDefinitionSchema validation.

export const PRESETS: WorkflowDefinition[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "코드 수신 → 알림 + 저장",
    enabled: true,
    trigger: {
      type: "peer_data_received",
      filter: { content_type: "" },
    },
    conditions: [{ type: "content_length_gt", value: 50 }],
    actions: [
      {
        type: "notify_desktop",
        params: { title: "새 코드 수신", body: "피어로부터 코드가 도착했습니다." },
      },
      {
        type: "save_to_db",
        params: { collection: "code_reviews" },
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Away 전환 → 이벤트 로그",
    enabled: true,
    trigger: {
      type: "user_status_changed",
      filter: { to_status: "Away" },
    },
    conditions: [],
    actions: [
      {
        type: "log_event",
        params: { message: "user_away" },
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "Active 복귀 → 피어에게 알림",
    enabled: false,
    trigger: {
      type: "user_status_changed",
      filter: { to_status: "Active" },
    },
    conditions: [],
    actions: [
      {
        type: "send_peer_message",
        params: { message: "호스트가 돌아왔습니다." },
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    name: "피어 데이터 수신 → 즉시 로그",
    enabled: true,
    trigger: {
      type: "peer_data_received",
    },
    conditions: [],
    actions: [
      {
        type: "log_event",
        params: { message: "peer_data_received" },
      },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000005",
    name: "긴 메시지 수신 → 데스크탑 알림",
    enabled: true,
    trigger: {
      type: "peer_data_received",
    },
    conditions: [{ type: "content_length_gt", value: 200 }],
    actions: [
      {
        type: "notify_desktop",
        params: {
          title: "긴 메시지 수신",
          body: "200자 이상의 메시지가 피어로부터 도착했습니다.",
        },
      },
    ],
  },
];
