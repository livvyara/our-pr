import React, { useState } from 'react';
import './WorkerModal.css'; // 스타일 재사용 (wm- 클래스)

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  tradeOptions: string[];
  onConfirm: (newTrade: string) => void;
}

const BulkTradeEditModal: React.FC<Props> = ({ isOpen, onClose, selectedCount, tradeOptions, onConfirm }) => {
  const [targetTrade, setTargetTrade] = useState(tradeOptions[0] || '미지정');

  if (!isOpen) return null;

  return (
    <div className="worker-modal-wrapper">
      <div className="wm-overlay" onClick={onClose}>
        <div className="wm-content" onClick={e => e.stopPropagation()} style={{height:'auto', minHeight:'250px'}}>
          <div className="wm-header">
            <h3>공종 일괄 수정</h3>
            <button className="wm-close-btn" onClick={onClose}>×</button>
          </div>
          
          <div className="wm-body">
            <p style={{textAlign:'center', marginBottom:'20px', fontSize:'15px'}}>
              선택된 <strong>{selectedCount}명</strong>의 공종을 변경하시겠습니까?
            </p>
            
            <div className="wm-form-group">
                <label>변경할 공종 선택</label>
                <select value={targetTrade} onChange={e => setTargetTrade(e.target.value)} style={{width:'100%'}}>
                    {tradeOptions.filter(t => t !== '전체').map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
            </div>
          </div>

          <div className="wm-footer">
            <div className="wm-right-btns" style={{width:'100%', justifyContent:'center'}}>
                <button className="wm-btn-cancel" onClick={onClose}>취소</button>
                <button className="wm-btn-save" onClick={() => onConfirm(targetTrade)}>변경하기</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkTradeEditModal;