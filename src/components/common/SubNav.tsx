// src/components/common/SubNav.tsx

import React from 'react';
import { kAppMenus } from '../../types/menuData'; 
import { CONTENT_MAX_WIDTH } from '../../constants';
import './SubNav.css';

interface SubNavProps {
  selectedMenuKey: string;
}

const SubNav: React.FC<SubNavProps> = ({ selectedMenuKey }) => {
  const selectedMenu = kAppMenus.find(menu => menu.key === selectedMenuKey);
  const subMenus = selectedMenu?.subMenus || [];

  if (subMenus.length === 0) {
    return null; // SizedBox.shrink() 역할
  }

  return (
    <div className="sub-nav-container">
      <div className="sub-nav-content" style={{ maxWidth: CONTENT_MAX_WIDTH }}>
        {subMenus.map((menuTitle, index) => (
          <button
            key={index}
            className="sub-menu-button"
            onClick={() => { /* 서브 메뉴 클릭 로직 */ }}
          >
            {menuTitle}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SubNav;