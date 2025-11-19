// src/components/admin/UserManagementTab.tsx

import React, { useState } from 'react';
import './UserManagementTab.css'; // [⭐ 1. 수정] 탭 전용 CSS 임포트

// [⭐ 2. 추가] 5개의 하위 탭 컴포넌트 임포트
import UserListSubTab from './UserListSubTab';
import MarketingSmsSubTab from './MarketingSmsSubTab';
import DirectSmsSubTab from './DirectSmsSubTab';
import PushNotificationSubTab from './PushNotificationSubTab';
import DispatchResultsSubTab from './DispatchResultsSubTab';

type UserManagemntTabKey = 'user-list' | 'marketing-sms' | 'direct-sms' | 'push-notification' | 'dispatch-results';

const UserManagementTab: React.FC = () => {
  // [⭐ 3. 수정] 메인 탭 상태 관리
  const [activeTab, setActiveTab] = useState<UserManagemntTabKey>('user-list'); 

  // [⭐ 4. 추가] 탭 콘텐츠 렌더링 함수
  const renderTabContent = () => {
    switch (activeTab) {
      case 'user-list':
        return <UserListSubTab />;
      case 'marketing-sms':
        return <MarketingSmsSubTab />;
      case 'direct-sms':
        return <DirectSmsSubTab />;
      case 'push-notification':
        return <PushNotificationSubTab />;
      case 'dispatch-results':
        return <DispatchResultsSubTab />;
      default:
        return <UserListSubTab />;
    }
  };

  return (
    <div>
      <h2>회원관리</h2>
      
      {/* [⭐ 5. 추가] 하위 탭 네비게이션 */}
      <div className="user-main-tabs">
        <button
          className={`user-tab-button ${activeTab === 'user-list' ? 'active' : ''}`}
          onClick={() => setActiveTab('user-list')}
        >
          회원 목록
        </button>
        <button
          className={`user-tab-button ${activeTab === 'marketing-sms' ? 'active' : ''}`}
          onClick={() => setActiveTab('marketing-sms')}
        >
          마케팅 문자발송
        </button>
        <button
          className={`user-tab-button ${activeTab === 'direct-sms' ? 'active' : ''}`}
          onClick={() => setActiveTab('direct-sms')}
        >
          특정 문자발송
        </button>
        <button
          className={`user-tab-button ${activeTab === 'push-notification' ? 'active' : ''}`}
          onClick={() => setActiveTab('push-notification')}
        >
          앱 푸시발송
        </button>
        <button
          className={`user-tab-button ${activeTab === 'dispatch-results' ? 'active' : ''}`}
          onClick={() => setActiveTab('dispatch-results')}
        >
          발송 결과
        </button>
      </div>
      
      {/* [⭐ 6. 추가] 탭 콘텐츠 렌더링 */}
      <div className="user-tab-content">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default UserManagementTab;