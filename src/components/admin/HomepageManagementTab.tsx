// src/components/admin/HomepageManagementTab.tsx

import React, { useState, useEffect } from 'react';
// import { getFirestore, ... } from 'firebase/firestore'; 
import './HomepageManagementTab.css';
import MainMenuManager from './MainMenuManager'; 
import SubMenuManager from './SubMenuManager'; // [⭐ 1. 추가]
import GuideManagementTab from './GuideManagementTab';

// Props 정의 (AdminPage로부터 받음 - 현재는 없음)
interface HomepageManagementTabProps {
  // (알림 카운트 등이 필요하면 여기에 추가)
}

const HomepageManagementTab: React.FC<HomepageManagementTabProps> = () => {
  // 1. 2개의 하위 탭 상태 ('main-header' 또는 'sub-header')
  const [activeTab, setActiveTab] = useState('main-header'); 
  
  // (데이터 로드 useEffect는 이제 각 하위 컴포넌트가 담당)
  useEffect(() => {
    //
  }, [activeTab]);


  // 5-A. "메인헤더 메뉴관리" 탭 렌더링
  const renderMainHeaderTab = () => (
    <MainMenuManager />
  );

  // 5-B. "서브헤더 메뉴관리" 탭 렌더링
  const renderSubHeaderTab = () => (
    // [⭐ 2. 수정] 뼈대 대신 실제 컴포넌트 렌더링
    <SubMenuManager />
  );

  return (
    <div>
      <h2>홈페이지 관리</h2>
      
      {/* 1. 내부 메인 탭 (2개) */}
      <div className="homepage-main-tabs">
        <button
          className={`homepage-tab-button ${activeTab === 'main-header' ? 'active' : ''}`}
          onClick={() => setActiveTab('main-header')}
        >
          메인헤더 메뉴관리
        </button>
        <button
          className={`homepage-tab-button ${activeTab === 'sub-header' ? 'active' : ''}`}
          onClick={() => setActiveTab('sub-header')}
        >
          서브헤더 메뉴관리
        </button>
      {/* [⭐ 추가] 이용안내 관리 탭 */}
        <button
          className={`homepage-tab-button ${activeTab === 'guide' ? 'active' : ''}`}
          onClick={() => setActiveTab('guide')}
        >
          이용안내 관리
        </button>
      </div>
      
      {activeTab === 'main-header' ? renderMainHeaderTab() : 
       activeTab === 'sub-header' ? renderSubHeaderTab() : 
       <GuideManagementTab /> // [⭐ 추가]
      }
    </div>
  );
};

export default HomepageManagementTab;