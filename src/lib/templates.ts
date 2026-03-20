export interface Template {
  id: string;
  name: string;
  icon: string;
  description: string;
  prompt: string;
}

export const SMART_TEMPLATES: Template[] = [
  {
    id: 'meeting_minutes',
    name: 'Meeting Minutes',
    icon: '👥',
    description: '구조화된 회의 데이터 및 결정 사항을 기록합니다.',
    prompt: '다음은 회의록 템플릿입니다. 이 구조에 맞춰서 초안을 작성해주세요. 회의 주제, 참석자, 안건, 결정 사항, 다음 행동 지침을 포함하세요. 마크다운 형식으로 작성해주되, 코드 블록(```)으로 감싸지 마세요.'
  },
  {
    id: 'project_brief',
    name: 'Project Brief',
    icon: '🏗️',
    description: '새로운 프로젝트의 목표와 범위를 정의합니다.',
    prompt: '새로운 프로젝트 브리프를 마크다운으로 작성해주세요. 프로젝트 목표, 주요 마일스톤, 리스크 분석, 팀 구성 섹션을 포함하세요. 코드 블록(```)으로 감싸지 말고 순수 마크다운으로만 응답하세요.'
  },
  {
    id: 'learning_note',
    name: 'Learning Note',
    icon: '📚',
    description: '학습한 내용을 핵심 요약하고 통찰을 정리합니다.',
    prompt: '학습 노트를 마크다운으로 작성해주세요. 학습 주제, 주요 개념 3가지 요약, 개인적인 통찰, 추가 학습이 필요한 질문들 섹션을 포함하세요. 코드 블록(```)으로 감싸지 말고 순수 마크다운으로만 응답하세요.'
  },
  {
    id: 'daily_journal',
    name: 'Daily Journal',
    icon: '✍️',
    description: '오늘의 감사한 일과 성찰을 기록하는 감성적인 일기.',
    prompt: '오늘의 성찰 일기 템플릿을 마크다운으로 작성해주세요. 오늘의 감사한 일 3가지, 오늘 배운 점, 내일의 다짐 섹션을 포함하세요. 코드 블록(```)으로 감싸지 말고 순수 마크다운으로만 응답하세요.'
  }
];
