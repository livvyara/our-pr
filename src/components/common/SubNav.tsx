// src/components/common/SubNav.tsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CONTENT_MAX_WIDTH } from '../../constants';
import './SubNav.css';
import { useMenu } from '../../contexts/MenuContext'; 

interface SubNavProps {
  selectedMenuKey: string;
}

const SubNav: React.FC<SubNavProps> = ({ selectedMenuKey }) => {
  const navigate = useNavigate();
  const { subMenus: subMenusMap } = useMenu();

  const subMenus = subMenusMap.get(selectedMenuKey) || [];

  if (subMenus.length === 0) {
    return null; 
  }

  return (
    <div className="sn-container">
      <div className="sn-content" style={{ maxWidth: CONTENT_MAX_WIDTH }}>
        <div className="sn-scroll-track">
          {subMenus.map((subMenu, index) => (
            <button
              key={index}
              className="sn-menu-btn"
              onClick={() => navigate(subMenu.path)}
            >
              {subMenu.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SubNav;