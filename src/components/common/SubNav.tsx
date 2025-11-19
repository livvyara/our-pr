// src/components/common/SubNav.tsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
// [⭐ 1. 삭제] kAppMenus 임포트 삭제
// import { kAppMenus } from '../../types/menuData'; 
import { CONTENT_MAX_WIDTH } from '../../constants';
import './SubNav.css';

// [⭐ 2. 추가] useMenu 컨텍스트 임포트
import { useMenu } from '../../contexts/MenuContext'; 

interface SubNavProps {
  selectedMenuKey: string;
}

const SubNav: React.FC<SubNavProps> = ({ selectedMenuKey }) => {
  const navigate = useNavigate();
  
  // [⭐ 3. 추가] 컨텍스트에서 동적 서브메뉴 데이터 가져오기
  const { subMenus: subMenusMap } = useMenu();

  // [⭐ 4. 수정] Map에서 현재 선택된 메인메뉴(key)의 서브메뉴 목록을 가져옴
  const subMenus = subMenusMap.get(selectedMenuKey) || [];

  if (subMenus.length === 0) {
    return null; 
  }

  return (
    <div className="sub-nav-container">
      <div className="sub-nav-content" style={{ maxWidth: CONTENT_MAX_WIDTH }}>
        
        {/* [⭐ 5. 수정] 
            사용자가 제공한 코드가 이미 subMenu.path와 subMenu.title을 사용하고 있으므로,
            데이터 소스만 변경하면 이 부분은 정상 작동합니다.
        */}
        {subMenus.map((subMenu, index) => (
          <button
            key={index}
            className="sub-menu-button"
            onClick={() => navigate(subMenu.path)}
          >
            {subMenu.title}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SubNav;