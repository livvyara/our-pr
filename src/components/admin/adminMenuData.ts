// src/components/admin/adminMenuData.ts

export interface AdminMenu {
  key: string;
  title: string;
}

/**
 * 관리자 페이지에서 사용될 모든 메뉴의 "원본" 목록입니다.
 */
export const ALL_ADMIN_MENUS: AdminMenu[] = [
  { key: 'user-manage', title: '회원관리' },
  { key: 'partner-manage', title: '파트너 관리' },
  { key: 'seller-manage', title: '셀러 관리' },
  { key: 'supporter-manage', title: '서포터 관리' },
  { key: 'homepage-manage', title: '홈페이지 관리' },
  { key: 'activity-log', title: '활동로그' }, // [⭐ 추가]
  // (권한관리는 admin만 보이도록 Sidebar에서 별도 처리)
];

// 권한관리 메뉴 (admin 전용)
export const ROLE_MANAGE_MENU: AdminMenu = { 
  key: 'role-manage', 
  title: '권한관리' 
};