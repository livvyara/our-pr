import React, { useState, useEffect } from 'react';
import './SiteActionsWidget.css';
import WorkLogModal from './WorkLogModal'; 
import ConstructionScheduleModal from './ConstructionScheduleModal'; 
import ContractInfoModal from './ContractInfoModal';
import LaborCostModal from './LaborCostModal'; 
import ExpenseRegistrationModal from './ExpenseRegistrationModal';
import OrderRequestModal from './OrderRequestModal'; 
import ChangeOrderModal from './ChangeOrderModal';
import EstimateModal from './EstimateModal';

import { auth } from '../../firebase-config'; 
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// --- [NEW] 고급 SVG 아이콘 컴포넌트 ---
const Icons = {
  Schedule: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="action-icon-svg"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
  ),
  WorkLog: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="action-icon-svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
  ),
  Contract: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="action-icon-svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M12 18v-6"></path><path d="M9 15l3 3 3-3"></path></svg>
  ),
  ChangeOrder: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="action-icon-svg"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
  ),
  OrderRequest: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="action-icon-svg"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
  ),
  Expense: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="action-icon-svg"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
  ),
  Labor: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="action-icon-svg"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
  ),
  Estimate: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="action-icon-svg"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
  )
};

interface SiteActionsWidgetProps {
  siteId: string;
  partnerUid: string;
  currentSiteName: string;
  status: string;
}

const SiteActionsWidget: React.FC<SiteActionsWidgetProps> = ({ siteId, partnerUid, currentSiteName, status }) => {
  const [isWorkLogModalOpen, setIsWorkLogModalOpen] = useState(false);
  const [isConstructionModalOpen, setIsConstructionModalOpen] = useState(false);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isLaborModalOpen, setIsLaborModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isOrderRequestModalOpen, setIsOrderRequestModalOpen] = useState(false);
  const [isChangeOrderModalOpen, setIsChangeOrderModalOpen] = useState(false);
  const [isEstimateModalOpen, setIsEstimateModalOpen] = useState(false);

  const [userName, setUserName] = useState('사용자');

  // 아이콘 컴포넌트 매핑
  const actionButtons = [
    { key: 'construction-schedule', title: '공사 일정', icon: <Icons.Schedule />, disabled: false },
    { key: 'work-log', title: '작업 일지', icon: <Icons.WorkLog />, disabled: false },
    { key: 'contract-info', title: '계약 정보', icon: <Icons.Contract />, disabled: false },
    { key: 'change-order', title: '추가 견적', icon: <Icons.ChangeOrder />, disabled: !['공사전', '공사중', '공사완료'].includes(status) },
    { key: 'order-request', title: '발주 요청', icon: <Icons.OrderRequest />, disabled: false }, 
    { key: 'expense', title: '지출 등록', icon: <Icons.Expense />, disabled: false },
    { key: 'labor', title: '노무 등록', icon: <Icons.Labor />, disabled: false },
    { key: 'estimate', title: '견적서', icon: <Icons.Estimate />, disabled: false },
  ];

  useEffect(() => {
      const fetchUserName = async () => {
          if (auth.currentUser) {
              const db = getFirestore();
              const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
              if (userDoc.exists()) {
                  const d = userDoc.data();
                  setUserName(d.name || d.nickname || d.email || '사용자');
              }
          }
      };
      fetchUserName();
  }, []);

  const handleActionClick = (key: string) => {
    if (key === 'work-log') setIsWorkLogModalOpen(true);
    else if (key === 'change-order') setIsChangeOrderModalOpen(true);
    else if (key === 'order-request') setIsOrderRequestModalOpen(true);
    else if (key === 'construction-schedule') setIsConstructionModalOpen(true);
    else if (key === 'contract-info') setIsContractModalOpen(true);
    else if (key === 'labor') setIsLaborModalOpen(true);
    else if (key === 'expense') setIsExpenseModalOpen(true);
    else if (key === 'estimate') setIsEstimateModalOpen(true);
    else alert(`(TODO) '${key}' 기능은 준비 중입니다.`);
  };

  return (
    <div className="actions-widget-container">
      <div className="actions-header-row">
        <h3>기타 등록</h3>
      </div>
      
      <div className="actions-grid">
        {actionButtons.map((btn) => (
          <button
            key={btn.key}
            className={`action-grid-button ${btn.key}`}
            onClick={() => handleActionClick(btn.key)}
            disabled={btn.disabled}
            title={btn.disabled ? "현재 상태에서는 사용할 수 없습니다." : btn.title}
          >
            {btn.icon}
            <span>{btn.title}</span>
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
      
      {isChangeOrderModalOpen && (
        <ChangeOrderModal 
          siteId={siteId}
          siteName={currentSiteName}
          partnerUid={partnerUid}
          userRole="partner"
          onClose={() => setIsChangeOrderModalOpen(false)}
        />
      )}

      {isEstimateModalOpen && (
        <EstimateModal 
          siteId={siteId}
          siteName={currentSiteName}
          partnerUid={partnerUid}
          onClose={() => setIsEstimateModalOpen(false)}
        />
      )}
    </div>
  );
};

export default SiteActionsWidget;