import React, { useState, useEffect } from 'react';
// import { getFirestore, ... } from 'firebase/firestore'; 
import './HomepageManagementTab.css';
import MainMenuManager from './MainMenuManager'; 
import SubMenuManager from './SubMenuManager'; 
import GuideManagementTab from './GuideManagementTab';
// [⭐ 추가] 방금 만든 대화형 메인 관리 페이지 Import
// (경로는 실제 파일 위치에 맞춰 조정해주세요. 예: ../../pages/admin/HomeAdminPage)
import HomeAdminPage from '../../pages/admin/HomeAdminPage'; 

interface HomepageManagementTabProps {
  // props...
}

const HomepageManagementTab: React.FC<HomepageManagementTabProps> = () => {
  // 탭 상태 관리 ('main-header', 'sub-header', 'main-survey', 'guide')
  const [activeTab, setActiveTab] = useState('main-header'); 
  
  useEffect(() => {
    // 탭 변경 시 필요한 로직
  }, [activeTab]);

  return (
    <div className="homepage-management-container">
      <h2>홈페이지 관리</h2>
      
      {/* 1. 내부 메인 탭 */}
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
        {/* [⭐ 추가] 메인 설문(대화형) 관리 탭 */}

      </div>
      
      {/* 2. 탭 컨텐츠 렌더링 */}
      <div className="homepage-tab-content">
        {activeTab === 'main-header' && <MainMenuManager />}
        {activeTab === 'sub-header' && <SubMenuManager />}
        {/* [⭐ 추가] HomeAdminPage 컴포넌트 렌더링 */}
        {activeTab === 'main-survey' && <HomeAdminPage />}
        {activeTab === 'guide' && <GuideManagementTab />}
      </div>
    </div>
  );
};

export default HomepageManagementTab;