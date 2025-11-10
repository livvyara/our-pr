import React from 'react';
// [1. 추가] useNavigate 임포트
import { useNavigate } from 'react-router-dom';
import { kAppMenus } from '../../types/menuData'; 
import { CONTENT_MAX_WIDTH } from '../../constants';
import './SubNav.css';

interface SubNavProps {
  selectedMenuKey: string;
}

const SubNav: React.FC<SubNavProps> = ({ selectedMenuKey }) => {
  // [2. 추가] navigate 함수 초기화
  const navigate = useNavigate();

  const selectedMenu = kAppMenus.find(menu => menu.key === selectedMenuKey);
  const subMenus = selectedMenu?.subMenus || [];

  if (subMenus.length === 0) {
    return null; 
  }

  return (
    <div className="sub-nav-container">
      <div className="sub-nav-content" style={{ maxWidth: CONTENT_MAX_WIDTH }}>
        
        {/* [3. 수정] menuTitle -> subMenu 객체로 변경 */}
        {subMenus.map((subMenu, index) => (
          <button
            key={index}
            className="sub-menu-button"
            // [4. 수정] onClick 시 지정된 path로 이동
            onClick={() => navigate(subMenu.path)}
          >
            {/* [5. 수정] subMenu.title로 텍스트 표시 */}
            {subMenu.title}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SubNav;