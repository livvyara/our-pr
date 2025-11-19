// src/components/partner/PartnerSidebar.tsx

import React, { useState, useEffect, useMemo } from 'react'; // [⭐ 1. useMemo 추가]
import { NavLink, useLocation } from 'react-router-dom'; 
import './PartnerSidebar.css';
// [⭐ 2. 수정] 분리된 메뉴 데이터 임포트
import { PARTNER_MENUS_DATA, type PartnerMenu } from './partnerMenuData';

// [⭐ 3. 추가] 부모(PartnerProgramPage)로부터 받을 Props
interface PartnerSidebarProps {
  userRole: 'partner' | 'sub_partner' | 'admin' | 'subadmin'; // 현재 사용자 역할
  permissions: string[]; // sub_partner일 경우, 허용된 메뉴 키 목록
}

const PartnerSidebar: React.FC<PartnerSidebarProps> = ({ userRole, permissions }) => {
  
  const location = useLocation(); 
  
  // [⭐ 4. 수정] 렌더링할 메뉴 목록을 useMemo로 계산
  const menusToRender = useMemo(() => {
    
    // admin/subadmin은 모든 메뉴를 봅니다.
    if (userRole === 'admin' || userRole === 'subadmin') {
      return PARTNER_MENUS_DATA;
    }
    
    // 'partner' (대표)는 '권한관리'를 포함한 모든 메뉴를 봅니다.
    if (userRole === 'partner') {
      return PARTNER_MENUS_DATA;
    }

    // 'sub_partner' (직원)는 권한에 따라 필터링됩니다.
    if (userRole === 'sub_partner') {
      const allowedMenus: PartnerMenu[] = [];

      PARTNER_MENUS_DATA.forEach(parentMenu => {
        // 부모 메뉴(예: 'sites') 자체가 허용되었는지 확인
        if (permissions.includes(parentMenu.key)) {
          // '직원관리' 메뉴는 '권한관리'를 제외하고 필터링
          if (parentMenu.key === 'employees') {
            const allowedSubMenus = parentMenu.subMenus.filter(
              sub => sub.key !== 'emp-permission' && permissions.includes(sub.key)
            );
            if (allowedSubMenus.length > 0) {
              allowedMenus.push({ ...parentMenu, subMenus: allowedSubMenus });
            }
          } else {
            // 다른 메뉴들은 하위 메뉴 권한을 확인
            const allowedSubMenus = parentMenu.subMenus.filter(
              sub => permissions.includes(sub.key)
            );
            if (allowedSubMenus.length > 0) {
              allowedMenus.push({ ...parentMenu, subMenus: allowedSubMenus });
            }
          }
        }
      });
      return allowedMenus;
    }
    
    return []; // customer 등 그 외 역할은 아무것도 보지 못함
    
  }, [userRole, permissions]);


  // [⭐ 5. 수정] 아코디언 상태 로직 (menusToRender 기반으로 변경)
  const [activeParentKey, setActiveParentKey] = useState<string | null>(() => {
    const activeParent = menusToRender.find(menu => 
      menu.subMenus.some(sub => sub.path === location.pathname)
    );
    if (location.pathname.startsWith('/program/site-detail')) {
      return 'sites';
    }
    return activeParent ? activeParent.key : (location.pathname.startsWith('/program/dashboard') ? 'dashboard' : 'sites');
  });
  
  useEffect(() => {
    const activeParent = menusToRender.find(menu => 
      menu.subMenus.some(sub => sub.path === location.pathname)
    );
    if (location.pathname.startsWith('/program/site-detail')) {
      setActiveParentKey('sites');
    } else if (activeParent) {
      setActiveParentKey(activeParent.key);
    } else if (location.pathname.startsWith('/program/dashboard')) {
      setActiveParentKey('dashboard');
    }
  }, [location.pathname, menusToRender]); // [수정] menusToRender 의존성 추가


  const handleParentClick = (key: string) => {
    setActiveParentKey(prevKey => (prevKey === key ? null : key)); // 토글
  };

  return (
    <nav className="partner-sidebar">
      <ul className="partner-menu-list">
        
        {/* '대시보드'는 sub_partner도 권한(permissions)이 있어야 보이도록 수정 */}
        {permissions.includes('dashboard') && (
          <li>
            <NavLink
              to="/program/dashboard"
              className="partner-menu-parent"
            >
              <span>대시보드</span>
            </NavLink>
          </li>
        )}
        
        {/* [⭐ 6. 수정] menusToRender (필터링된 메뉴)를 기준으로 렌더링 */}
        {menusToRender.map((menu) => {
          const isExpanded = activeParentKey === menu.key;
          const isParentActive = activeParentKey === menu.key;

          return (
            <li key={menu.key}>
              <button
                className={`partner-menu-parent ${isParentActive ? 'active' : ''}`}
                onClick={() => handleParentClick(menu.key)}
              >
                <span>{menu.title}</span>
                <span className={`accordion-icon ${isExpanded ? 'open' : ''}`}></span>
              </button>
              
              <ul className={`partner-submenu-list ${isExpanded ? 'open' : ''}`}>
                {menu.subMenus.map(subMenu => (
                  <li key={subMenu.key}>
                    
                    <NavLink
                      to={subMenu.path!}
                      className={({ isActive }) =>
                        `partner-submenu-item ${
                          (isActive || (subMenu.key === 'site-list' && location.pathname.startsWith('/program/site-detail'))) 
                          ? 'active' 
                          : ''
                        }`
                      }
                    >
                      {subMenu.title}
                    </NavLink>

                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default PartnerSidebar;