import React, { useState } from 'react';
import './WorkerModal.css'; 

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onConfirm: (newType: 'agency' | 'freelance') => void;
}

const BulkTypeEditModal: React.FC<Props> = ({ isOpen, onClose, selectedCount, onConfirm }) => {
  const [targetType, setTargetType] = useState<'agency' | 'freelance'>('freelance');

  if (!isOpen) return null;

  return (
    <div className="worker-modal-wrapper">
      <div className="wm-overlay" onClick={onClose}>
        <div className="wm-content" onClick={e => e.stopPropagation()} style={{height:'auto', minHeight:'280px'}}>
          <div className="wm-header">
            <h3>유형 일괄 수정</h3>
            <button className="wm-close-btn" onClick={onClose}>×</button>
          </div>
          
          <div className="wm-body">
            <p style={{textAlign:'center', marginBottom:'20px', fontSize:'15px'}}>
              선택된 <strong>{selectedCount}명</strong>의 유형을 일괄 변경하시겠습니까?<br/>
              <span style={{fontSize:'12px', color:'#666'}}>(유형 변경 시 기본 세금요율도 함께 적용됩니다)</span>
            </p>
            
            <div className="wm-form-group wm-radio-group" style={{justifyContent: 'center'}}>
                <label className={`wm-radio-label ${targetType === 'freelance' ? 'selected' : ''}`}>
                    <input type="radio" checked={targetType === 'freelance'} onChange={() => setTargetType('freelance')} /> 프리랜서
                </label>
                <label className={`wm-radio-label ${targetType === 'agency' ? 'selected' : ''}`}>
                    <input type="radio" checked={targetType === 'agency'} onChange={() => setTargetType('agency')} /> 인력소
                </label>
            </div>
          </div>

          <div className="wm-footer">
            <div className="wm-right-btns" style={{width:'100%', justifyContent:'center'}}>
                <button className="wm-btn-cancel" onClick={onClose}>취소</button>
                <button className="wm-btn-save" onClick={() => onConfirm(targetType)}>변경하기</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkTypeEditModal;