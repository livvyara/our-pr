import React, { useState, useEffect } from 'react';
import './SiteActionsWidget.css';
import WorkLogModal from './WorkLogModal'; 
import ConstructionScheduleModal from './ConstructionScheduleModal'; 
import ContractInfoModal from './ContractInfoModal';
import LaborCostModal from './LaborCostModal'; 
import ExpenseRegistrationModal from './ExpenseRegistrationModal';
import OrderRequestModal from './OrderRequestModal'; // 발주 요청 모달

import { auth } from '../../firebase-config'; 
import { getFirestore, doc, getDoc } from 'firebase/firestore';

interface SiteActionsWidgetProps {
  siteId: string;
  partnerUid: string;
  currentSiteName: string;
}

// [수정] 버튼 목록에 '발주 요청' 추가
const actionButtons = [
  { key: 'construction-schedule', title: '공사 일정 등록', disabled: false },
  { key: 'work-log', title: '작업 일지 등록', disabled: false },
    // [NEW] 발주 요청 버튼 추가
  { key: 'order-request', title: '발주 요청', disabled: false }, 
  { key: 'expense', title: '카드 지출 등록', disabled: false },
  { key: 'labor', title: '노무 등록', disabled: false },
  { key: 'contract-info', title: '계약 정보 등록', disabled: false }, 
  

  
  { key: 'test3', title: '개발예정 3', disabled: true },
  { key: 'test4', title: '개발예정 4', disabled: true },
];

const SiteActionsWidget: React.FC<SiteActionsWidgetProps> = ({ siteId, partnerUid, currentSiteName }) => {
  const [isWorkLogModalOpen, setIsWorkLogModalOpen] = useState(false);
  const [isConstructionModalOpen, setIsConstructionModalOpen] = useState(false);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isLaborModalOpen, setIsLaborModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isOrderRequestModalOpen, setIsOrderRequestModalOpen] = useState(false);

  const [userName, setUserName] = useState('사용자');

  useEffect(() => {
      const fetchUserName = async () => {
          if (auth.currentUser) {
              const db = getFirestore();
              const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
              if (userDoc.exists()) {
                  const d = userDoc.data();
                  // 이름 우선 표시
                  setUserName(d.name || d.nickname || d.email || '사용자');
              }
          }
      };
      fetchUserName();
  }, []);

  const handleActionClick = (key: string) => {
    if (key === 'work-log') setIsWorkLogModalOpen(true);
    else if (key === 'construction-schedule') setIsConstructionModalOpen(true);
    else if (key === 'contract-info') setIsContractModalOpen(true);
    else if (key === 'labor') setIsLaborModalOpen(true);
    else if (key === 'expense') setIsExpenseModalOpen(true);
    
    // [수정] 발주 요청 핸들러 연결
    else if (key === 'order-request') setIsOrderRequestModalOpen(true);
    
    else alert(`(TODO) '${key}' 기능 실행`);
  };

  return (
    <div className="actions-widget-container">
      <h3>기타 등록</h3>
      <div className="actions-grid">
        {actionButtons.map((btn) => (
          <button
            key={btn.key}
            className={`action-grid-button ${btn.key}`}
            onClick={() => handleActionClick(btn.key)}
            disabled={btn.disabled}
            title={btn.disabled ? "제공 예정인 기능입니다." : btn.title}
          >
            {btn.title}
          </button>
        ))}
      </div>

      {isWorkLogModalOpen && <WorkLogModal siteId={siteId} partnerUid={partnerUid} onClose={() => setIsWorkLogModalOpen(false)} />}
      {isConstructionModalOpen && <ConstructionScheduleModal siteId={siteId} partnerUid={partnerUid} onClose={() => setIsConstructionModalOpen(false)} />}
      {isContractModalOpen && <ContractInfoModal siteId={siteId} partnerUid={partnerUid} onClose={() => setIsContractModalOpen(false)} />}
      
      {isLaborModalOpen && (
        <LaborCostModal 
          isOpen={isLaborModalOpen}
          onClose={() => setIsLaborModalOpen(false)}
          partnerUid={partnerUid}
          targetLabor={null}
          currentMonth={new Date().toISOString().slice(0, 7)}
          onRefresh={() => {}}
          defaultSiteId={siteId}
          defaultSiteName={currentSiteName}
          userName={userName}
        />
      )}

      {isExpenseModalOpen && (
          <ExpenseRegistrationModal 
            isOpen={isExpenseModalOpen}
            onClose={() => setIsExpenseModalOpen(false)}
            siteId={siteId}
            siteName={currentSiteName}
            partnerUid={partnerUid}
            userName={userName}
          />
      )}

      {/* [NEW] 발주 요청 모달 */}
      {isOrderRequestModalOpen && (
          <OrderRequestModal 
            isOpen={isOrderRequestModalOpen}
            onClose={() => setIsOrderRequestModalOpen(false)}
            siteId={siteId}
            siteName={currentSiteName}
            partnerUid={partnerUid}
            userName={userName}
          />
      )}
    </div>
  );
};

export default SiteActionsWidget;