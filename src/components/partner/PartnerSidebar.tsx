// src/components/partner/PartnerSidebar.tsx

import React, { useState, useEffect, useMemo } from 'react'; 
import { NavLink, useLocation } from 'react-router-dom'; 
import './PartnerSidebar.css';
import { PARTNER_MENUS_DATA, type PartnerMenu } from './partnerMenuData';

// 아이콘 컴포넌트 (변경 없음)
const MenuIcon = ({ menuKey }: { menuKey: string }) => {
  switch (menuKey) {
    case 'dashboard': return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;
    case 'sites': return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4 8 4v14H5z"></path></svg>;
    case 'hr': return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;
    case 'accounting': return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>;
    case 'employees': return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>;
    case 'profile': return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
    case 'portfolio': return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>;
    default: return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>;
  }
};

interface PartnerSidebarProps {
  userRole: 'partner' | 'sub_partner' | 'admin' | 'subadmin'; 
  permissions: string[];
  // [NEW] 모바일에서 메뉴 클릭 시 사이드바를 닫기 위한 콜백
  onMenuClick?: () => void; 
}

const PartnerSidebar: React.FC<PartnerSidebarProps> = ({ userRole, permissions, onMenuClick }) => {
  
  const location = useLocation(); 
  
  const menusToRender = useMemo(() => {
    if (userRole === 'admin' || userRole === 'subadmin') {
      return PARTNER_MENUS_DATA;
    }
    if (userRole === 'partner') {
      return PARTNER_MENUS_DATA;
    }
    if (userRole === 'sub_partner') {
      const allowedMenus: PartnerMenu[] = [];

      PARTNER_MENUS_DATA.forEach(parentMenu => {
        if (permissions.includes(parentMenu.key)) {
          if (parentMenu.key === 'employees') {
            const allowedSubMenus = parentMenu.subMenus.filter(
              sub => sub.key !== 'emp-permission' && permissions.includes(sub.key)
            );
            if (allowedSubMenus.length > 0) {
              allowedMenus.push({ ...parentMenu, subMenus: allowedSubMenus });
            }
          } else {
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
    return []; 
  }, [userRole, permissions]);


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
  }, [location.pathname, menusToRender]);


  const handleParentClick = (key: string) => {
    setActiveParentKey(prevKey => (prevKey === key ? null : key)); 
  };

  return (
    <nav className="partner-sidebar">
      <ul className="partner-menu-list">
        
        {permissions.includes('dashboard') && (
          <li>
            <NavLink
              to="/program/dashboard"
              className="partner-menu-parent"
              onClick={onMenuClick} // [NEW] 클릭 시 닫기
            >
              <div className="menu-label">
                <span className="menu-icon"><MenuIcon menuKey="dashboard" /></span>
                <span>대시보드</span>
              </div>
            </NavLink>
          </li>
        )}
        
        {menusToRender.map((menu) => {
          const isExpanded = activeParentKey === menu.key;
          const isParentActive = activeParentKey === menu.key;

          return (
            <li key={menu.key}>
              <button
                className={`partner-menu-parent ${isParentActive ? 'active' : ''}`}
                onClick={() => handleParentClick(menu.key)}
              >
                <div className="menu-label">
                  <span className="menu-icon"><MenuIcon menuKey={menu.key} /></span>
                  <span>{menu.title}</span>
                </div>
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
                      onClick={onMenuClick} // [NEW] 클릭 시 닫기
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