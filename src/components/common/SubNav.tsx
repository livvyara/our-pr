import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CONTENT_MAX_WIDTH } from '../../constants';
import './SubNav.css';

// useMenu 컨텍스트 임포트
import { useMenu } from '../../contexts/MenuContext'; 

interface SubNavProps {
  selectedMenuKey: string;
}

const SubNav: React.FC<SubNavProps> = ({ selectedMenuKey }) => {
  const navigate = useNavigate();
  
  // 컨텍스트에서 동적 서브메뉴 데이터 가져오기
  const { subMenus: subMenusMap } = useMenu();

  // 현재 선택된 메인메뉴(key)의 서브메뉴 목록 가져오기
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