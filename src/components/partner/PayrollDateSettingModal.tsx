import React, { useState } from 'react';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import './PayrollExecutionModal.css'; // 스타일 공유

interface Props {
    partnerUid: string;
    currentBaseDate: number;
    onSave: (val: number) => void;
    onClose: () => void;
}

const PayrollDateSettingModal: React.FC<Props> = ({ partnerUid, currentBaseDate, onSave, onClose }) => {
    const [selectedDate, setSelectedDate] = useState(currentBaseDate);
    const db = getFirestore();

    const handleSave = async () => {
        try {
            await setDoc(doc(db, 'users', partnerUid, 'config', 'payroll'), {
                baseDate: selectedDate
            }, { merge: true });
            onSave(selectedDate);
            alert("저장되었습니다.");
        } catch(e) {
            alert("저장 실패");
        }
    };

    return (
        <div className="payroll-modal-overlay" style={{zIndex:3000}}>
            <div className="payroll-modal-content" style={{width:'400px', height:'auto'}}>
                <div className="payroll-header">
                    <h3>📅 급여 산정 기준일 설정</h3>
                    <button className="btn-close" onClick={onClose}>×</button>
                </div>
                <div style={{padding:'30px', textAlign:'center'}}>
                    <p style={{marginBottom:'20px', color:'#555'}}>
                        급여 계산의 시작일(기준일)을 선택해주세요.<br/>
                        (예: 25일 선택 시 → 전월 25일 ~ 당월 24일)
                    </p>
                    <select 
                        value={selectedDate} 
                        onChange={e => setSelectedDate(Number(e.target.value))}
                        style={{padding:'10px', fontSize:'16px', width:'100px', textAlign:'center'}}
                    >
                        {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>{d}일</option>
                        ))}
                    </select>
                    <span style={{marginLeft:'10px', fontWeight:'bold'}}>부터 ~ 다음달 전일까지</span>
                </div>
                <div className="payroll-footer">
                    <button className="btn-cancel" onClick={onClose}>취소</button>
                    <button className="btn-exec" onClick={handleSave}>저장</button>
                </div>
            </div>
        </div>
    );
};

export default PayrollDateSettingModal;