// src/components/admin/adminMenuData.ts

export interface AdminMenu {
  key: string;
  title: string;
}

export const ALL_ADMIN_MENUS: AdminMenu[] = [
  { key: 'user-manage', title: '회원관리' },
  { key: 'partner-manage', title: '파트너 관리' },
  { key: 'seller-manage', title: '셀러 관리' },
  { key: 'supporter-manage', title: '서포터 관리' },
];

// 권한관리 메뉴 (admin 전용)
export const ROLE_MANAGE_MENU: AdminMenu = { 
  key: 'role-manage', 
  title: '권한관리' 
};