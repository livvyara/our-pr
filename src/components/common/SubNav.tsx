/* src/components/common/SubNav.tsx */
import React, { useEffect, useRef } from 'react'; // useEffect, useRef 추가
import { useNavigate } from 'react-router-dom';
import { CONTENT_MAX_WIDTH } from '../../constants';
import './SubNav.css';

// useMenu 컨텍스트 임포트
import { useMenu } from '../../contexts/MenuContext'; 

interface SubNavProps {
  selectedMenuKey: string;
  onClose: () => void; // [추가] 닫기 요청을 위한 콜백 함수
}

const SubNav: React.FC<SubNavProps> = ({ selectedMenuKey, onClose }) => {
  const navigate = useNavigate();
  const navRef = useRef<HTMLDivElement>(null); // [추가] 서브메뉴 영역을 감지할 Ref
  
  // 컨텍스트에서 동적 서브메뉴 데이터 가져오기
  const { subMenus: subMenusMap } = useMenu();

  // 현재 선택된 메인메뉴(key)의 서브메뉴 목록 가져오기
  const subMenus = subMenusMap.get(selectedMenuKey) || [];

  // [추가] 외부 클릭 감지 로직
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // SubNav가 렌더링된 상태이고, 클릭된 요소가 SubNav 영역(navRef) 바깥이라면 닫기
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // 마우스 다운 이벤트 리스너 등록
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      // 컴포넌트 언마운트 시 리스너 제거
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (subMenus.length === 0) {
    return null; 
  }

  return (
    /* [수정] ref={navRef} 연결 */
    <div className="sn-container" ref={navRef}>
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