// src/components/admin/AdminSidebar.tsx

import React, { useMemo } from 'react';
import './AdminSidebar.css';
// [⭐ 1. 수정] 공통 메뉴 파일 임포트
import { ALL_ADMIN_MENUS, ROLE_MANAGE_MENU, type AdminMenu } from '../admin/adminMenuData'

interface AdminSidebarProps {
  onMenuClick: (menu: string) => void; 
  activeMenu: string; 
  
  // [⭐ 2. 추가] 현재 사용자의 role과 허용된 메뉴 목록
  userRole: 'admin' | 'subadmin';
  allowedMenus: string[]; // (admin의 경우 모든 메뉴, subadmin의 경우 DB에 저장된 메뉴)
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ 
  onMenuClick, 
  activeMenu,
  userRole,
  allowedMenus 
}) => {
  
  // [⭐ 3. 수정] useMemo를 사용해 role과 권한에 따라 메뉴 목록을 필터링
  const menusToRender = useMemo(() => {
    let menus: AdminMenu[] = [];

    if (userRole === 'admin') {
      // 1. admin: 모든 메뉴 + 권한관리 메뉴 추가
      menus = [...ALL_ADMIN_MENUS, ROLE_MANAGE_MENU];

    } else if (userRole === 'subadmin') {
      // 2. subadmin: 허용된(allowedMenus) 메뉴만 필터링
      menus = ALL_ADMIN_MENUS.filter(menu => 
        allowedMenus.includes(menu.key)
      );
    }
    
    return menus;
  }, [userRole, allowedMenus]);


  return (
    <nav className="admin-sidebar">
      <ul className="admin-menu-list">
        
        {/* [⭐ 4. 수정] 필터링된 menusToRender를 사용 */}
        {menusToRender.map((menu) => (
          <li key={menu.key}>
            <button
              className={`admin-menu-item ${activeMenu === menu.key ? 'active' : ''}`}
              onClick={() => onMenuClick(menu.key)}
            >
              {menu.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default AdminSidebar;