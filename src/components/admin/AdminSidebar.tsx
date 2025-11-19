// src/components/admin/AdminSidebar.tsx

import React, { useMemo } from 'react';
import './AdminSidebar.css';
import { ALL_ADMIN_MENUS, ROLE_MANAGE_MENU, type AdminMenu } from './adminMenuData';

interface AdminSidebarProps {
  onMenuClick: (menu: string) => void; 
  activeMenu: string; 
  userRole: 'admin' | 'subadmin';
  allowedMenus: string[]; 
  partnerPendingCount: number; 
  partnerInfoChangeCount: number; 
  sellerPendingCount: number; // [⭐ 1. 추가]
  sellerInfoChangeCount: number; // [⭐ 1. 추가]
  supporterPendingCount: number; // [⭐ 1. 추가]
  supporterInfoChangeCount: number; // [⭐ 1. 추가]
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ 
  onMenuClick, 
  activeMenu,
  userRole,
  allowedMenus,
  partnerPendingCount,
  partnerInfoChangeCount,
  sellerPendingCount,
  sellerInfoChangeCount,
  supporterPendingCount,
  supporterInfoChangeCount
}) => {
  
  // (menusToRender 로직은 변경 없음)
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

  // [⭐ 2. 수정] 3종류의 알림 개수 계산
  const totalPartnerNotifications = partnerPendingCount + partnerInfoChangeCount;
  const totalSellerNotifications = sellerPendingCount + sellerInfoChangeCount; 
  const totalSupporterNotifications = supporterPendingCount + supporterInfoChangeCount; // [추가]

  return (
    <nav className="admin-sidebar">
      <ul className="admin-menu-list">
        
        {menusToRender.map((menu) => (
          <li key={menu.key}>
            <button
              className={`admin-menu-item ${activeMenu === menu.key ? 'active' : ''}`}
              onClick={() => onMenuClick(menu.key)}
            >
              <span>{menu.title}</span>
              
              {/* [⭐ 3. 수정] 알림 배지 분기 */}
              {menu.key === 'partner-manage' && totalPartnerNotifications > 0 && (
                <span className="new-notification">N</span>
              )}
              
              {menu.key === 'seller-manage' && totalSellerNotifications > 0 && (
                <span className="new-notification">N</span>
              )}

              {menu.key === 'supporter-manage' && totalSupporterNotifications > 0 && (
                <span className="new-notification">N</span>
              )}

            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default AdminSidebar;