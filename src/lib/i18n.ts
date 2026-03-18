import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "login_prompt_title": "Login to CoFlux",
      "login_prompt_desc": "Enter your email to receive a magic link.\\nLogin securely without a password.",
      "placeholder_email": "name@example.com",
      "btn_cancel": "Cancel",
      "btn_continue": "Continue",
      "btn_sending": "Sending...",
      "alert_enter_email": "Please enter an email address.",
      "alert_login_failed": "Login request failed:",
      "alert_login_success": "Login link sent to your email. (Please check your inbox)",
      "auth_loading_message": "Verifying authentication info...",
      "settings": "Settings",
      "search": "Search",
      "workflows": "Workflows",
      "scripts": "Scripts",
      "knowledge_map": "Knowledge Map",
      "new_page": "New Page",
      "chat_empty_msg": "How can I help you with your workspace today?",
      "chat_scope_all": "All",
      "chat_scope_ws": "WS",
      "chat_scope_page": "Page",
      "chat_scope_chat": "Chat",
      "chat_include_web": "Web",
      "chat_placeholder_chat": "Ask AI...",
      "chat_placeholder_search": "Search in {{scope}}...",
      "btn_login": "Login",
      "favorites": "Favorites",
      "private": "Private",
      "trash": "Trash",
      "trash_count": "Trash ({{count}})",
      "add_to_favorites": "Add to Favorites",
      "remove_from_favorites": "Remove from Favorites",
      "delete": "Delete",
      "restore": "Restore",
      "delete_permanently": "Delete permanently",
      "new_workspace": "New workspace...",
      "my_workspace": "My Workspace",
      "untitled": "Untitled"
    }
  },
  ko: {
    translation: {
      "login_prompt_title": "CoFlux 로그인",
      "login_prompt_desc": "매직 링크를 받을 이메일 주소를 입력해주세요.\\n비밀번호 없이 안전하게 로그인할 수 있습니다.",
      "placeholder_email": "name@example.com",
      "btn_cancel": "취소",
      "btn_continue": "계속하기",
      "btn_sending": "전송 중...",
      "alert_enter_email": "이메일 주소를 입력해주세요.",
      "alert_login_failed": "로그인 요청 실패:",
      "alert_login_success": "로그인 링크가 이메일로 전송되었습니다. (받은 편지함을 확인해주세요)",
      "auth_loading_message": "인증 정보 확인 중...",
      "settings": "설정",
      "search": "검색",
      "workflows": "워크플로우",
      "scripts": "스크립트",
      "knowledge_map": "지식 맵",
      "new_page": "새 페이지 추가",
      "chat_empty_msg": "작업 공간에 대해 무엇을 도와드릴까요?",
      "chat_scope_all": "전체",
      "chat_scope_ws": "워크스페이스",
      "chat_scope_page": "현재문서",
      "chat_scope_chat": "채팅",
      "chat_include_web": "웹",
      "chat_placeholder_chat": "AI에게 질문하기...",
      "chat_placeholder_search": "{{scope}} 범위에서 검색...",
      "btn_login": "로그인",
      "favorites": "즐겨찾기",
      "private": "개인 문서함",
      "trash": "휴지통",
      "trash_count": "휴지통 ({{count}})",
      "add_to_favorites": "즐겨찾기 추가",
      "remove_from_favorites": "즐겨찾기 제거",
      "delete": "삭제",
      "restore": "복원",
      "delete_permanently": "영구 삭제",
      "new_workspace": "새 워크스페이스...",
      "my_workspace": "내 워크스페이스",
      "untitled": "제목 없음"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;
