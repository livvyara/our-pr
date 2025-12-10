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

  // 아이콘 추가하여 시각적 효과 개선
  const actionButtons = [
    { key: 'construction-schedule', title: '공사 일정', icon: '📅', disabled: false },
    { key: 'work-log', title: '작업 일지', icon: '📝', disabled: false },
    { key: 'contract-info', title: '계약 정보', icon: '📄', disabled: false },
    { key: 'change-order', title: '추가 견적', icon: '🔄', disabled: !['공사전', '공사중', '공사완료'].includes(status) },
    { key: 'order-request', title: '발주 요청', icon: '🛒', disabled: false }, 
    { key: 'expense', title: '지출 등록', icon: '💳', disabled: false },
    { key: 'labor', title: '노무 등록', icon: '👷', disabled: false },
    { key: 'estimate', title: '견적서', icon: '📊', disabled: false },
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
            <span className="action-icon">{btn.icon}</span>
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