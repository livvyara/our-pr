// src/components/partner/SiteActionsWidget.tsx

import React, { useState } from 'react';
import './SiteActionsWidget.css';
import WorkLogModal from './WorkLogModal'; 
import ConstructionScheduleModal from './ConstructionScheduleModal'; 
// [⭐ 추가] 계약 정보 모달 임포트
import ContractInfoModal from './ContractInfoModal';

interface SiteActionsWidgetProps {
  siteId: string;
  partnerUid: string;
  currentSiteName: string;
}

const actionButtons = [
  { key: 'construction-schedule', title: '공사 일정 등록', disabled: false },
  { key: 'work-log', title: '작업 일지 등록', disabled: false },
  { key: 'expense', title: '지출 등록', disabled: false },
  { key: 'labor', title: '노무 등록', disabled: false },
  // [⭐ 수정] 계약 정보 등록 활성화
  { key: 'contract-info', title: '계약 정보 등록', disabled: false }, 
  { key: 'test2', title: '개발예정 2', disabled: true },
  { key: 'test3', title: '개발예정 3', disabled: true },
  { key: 'test4', title: '개발예정 4', disabled: true },
];

const SiteActionsWidget: React.FC<SiteActionsWidgetProps> = ({ siteId, partnerUid }) => {
  const [isWorkLogModalOpen, setIsWorkLogModalOpen] = useState(false);
  const [isConstructionModalOpen, setIsConstructionModalOpen] = useState(false);
  // [⭐ 추가] 계약 정보 모달 상태
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);

  const handleActionClick = (key: string) => {
    if (key === 'work-log') {
      setIsWorkLogModalOpen(true);
    } 
    else if (key === 'construction-schedule') {
      setIsConstructionModalOpen(true);
    }
    // [⭐ 추가] 계약 정보 버튼 클릭 시 모달 열기
    else if (key === 'contract-info') {
      setIsContractModalOpen(true);
    }
    else {
      alert(`(TODO) '${key}' 기능 실행 (Site ID: ${siteId})`);
    }
  };

  return (
    <div className="actions-widget-container">
      <h3>기타 등록</h3>
      
      <div className="actions-grid">
        {actionButtons.map((btn) => (
          <button
            key={btn.key}
            className="action-grid-button"
            onClick={() => handleActionClick(btn.key)}
            disabled={btn.disabled}
            title={btn.disabled ? "제공 예정인 기능입니다." : btn.title}
          >
            {btn.title}
          </button>
        ))}
      </div>

      {isWorkLogModalOpen && (
        <WorkLogModal 
          siteId={siteId} 
          partnerUid={partnerUid} 
          onClose={() => setIsWorkLogModalOpen(false)} 
        />
      )}
      
      {isConstructionModalOpen && (
        <ConstructionScheduleModal 
          siteId={siteId} 
          partnerUid={partnerUid} 
          onClose={() => setIsConstructionModalOpen(false)} 
        />
      )}

      {/* [⭐ 추가] 계약 정보 모달 렌더링 */}
      {isContractModalOpen && (
        <ContractInfoModal
          siteId={siteId}
          partnerUid={partnerUid}
          onClose={() => setIsContractModalOpen(false)}
        />
      )}
    </div>
  );
};

export default SiteActionsWidget;