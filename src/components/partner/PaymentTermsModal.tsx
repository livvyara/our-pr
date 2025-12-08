import React, { useState, useEffect } from 'react';
import './PaymentTermsModal.css';

export interface PaymentItem {
    id: string;
    label: string;
    checked: boolean;
    rate: number; // 퍼센트
    amount: number; // 금액 (자동계산)
    date: string; // 결제일
}

export interface PaymentTermData {
    items: { [key: string]: PaymentItem };
}

interface Props {
    totalSupply: number; // 총 공급가액 (기준금액)
    initialData: PaymentTermData | null;
    onSave: (data: PaymentTermData) => void;
    onClose: () => void;
}

const DEFAULT_ITEMS = [
    { id: 'contract', label: '계약금', checked: true, rate: 10 },
    { id: 'start1', label: '착수금', checked: true, rate: 30 },
    { id: 'start2', label: '2차 착수금', checked: false, rate: 0 },
    { id: 'middle1', label: '중도금', checked: true, rate: 30 },
    { id: 'middle2', label: '2차 중도금', checked: false, rate: 0 },
    { id: 'balance', label: '잔금', checked: true, rate: 30 },
];

const PaymentTermsModal: React.FC<Props> = ({ totalSupply, initialData, onSave, onClose }) => {
    
    const [items, setItems] = useState<PaymentItem[]>([]);
    const [totalRate, setTotalRate] = useState(0);

    useEffect(() => {
        if (initialData) {
            const loaded = DEFAULT_ITEMS.map(def => {
                const saved = initialData.items[def.id];
                return saved ? { ...saved, amount: Math.floor(totalSupply * (saved.rate / 100)) } : { ...def, amount: Math.floor(totalSupply * (def.rate / 100)), date: '' };
            });
            setItems(loaded);
        } else {
            const init = DEFAULT_ITEMS.map(def => ({
                ...def,
                amount: Math.floor(totalSupply * (def.rate / 100)),
                date: ''
            }));
            setItems(init);
        }
    }, [initialData, totalSupply]);

    useEffect(() => {
        const sum = items.reduce((acc, item) => item.checked ? acc + item.rate : acc, 0);
        setTotalRate(sum);
    }, [items]);

    const handleCheck = (index: number, checked: boolean) => {
        const newItems = [...items];
        newItems[index].checked = checked;
        if (!checked) {
            newItems[index].rate = 0;
            newItems[index].amount = 0;
            newItems[index].date = '';
        }
        setItems(newItems);
    };

    const handleRateChange = (index: number, val: string) => {
        const rate = Number(val);
        const newItems = [...items];
        newItems[index].rate = rate;
        newItems[index].amount = Math.floor(totalSupply * (rate / 100));
        setItems(newItems);
    };

    const handleDateChange = (index: number, val: string) => {
        const newItems = [...items];
        newItems[index].date = val;
        setItems(newItems);
    };

    const handleConfirm = () => {
        if (totalRate !== 100) {
            alert(`비율의 합계는 100%여야 합니다.\n(현재 합계: ${totalRate}%)`);
            return;
        }
        
        for (const item of items) {
            if (item.checked && !item.date) {
                alert(`'${item.label}'의 결제 날짜를 입력해주세요.`);
                return;
            }
        }

        const dataToSave: PaymentTermData = {
            items: items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {})
        };
        onSave(dataToSave);
    };

    return (
        <div className="pt-modal-overlay">
            <div className="pt-modal-content">
                <div className="pt-header">
                    <h3>공사대금 결제 방식 설정</h3>
                    <button className="pt-close" onClick={onClose}>×</button>
                </div>
                
                <div className="pt-body">
                    <p className="pt-info">총 공사비(공급가액): <strong>{totalSupply.toLocaleString()} 원</strong></p>
                    
                    <table className="pt-table">
                        <thead>
                            <tr>
                                {/* [수정] width 속성을 style 객체로 변경 */}
                                <th style={{ width: '100px' }}>구분</th>
                                <th style={{ width: '100px' }}>비율(%)</th>
                                <th>금액 (원)</th>
                                <th style={{ width: '150px' }}>결제 예정일</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={item.id} className={!item.checked ? 'disabled-row' : ''}>
                                    <td>
                                        <label className="pt-checkbox">
                                            <input 
                                                type="checkbox" 
                                                checked={item.checked} 
                                                onChange={(e) => handleCheck(idx, e.target.checked)} 
                                            />
                                            {item.label}
                                        </label>
                                    </td>
                                    <td>
                                        <input 
                                            type="number" 
                                            value={item.rate} 
                                            onChange={(e) => handleRateChange(idx, e.target.value)}
                                            disabled={!item.checked}
                                            className="pt-input-rate"
                                        /> %
                                    </td>
                                    <td>
                                        <input 
                                            type="text" 
                                            value={item.amount.toLocaleString()} 
                                            disabled 
                                            className="pt-input-amount"
                                        />
                                    </td>
                                    <td>
                                        <input 
                                            type="date" 
                                            value={item.date} 
                                            onChange={(e) => handleDateChange(idx, e.target.value)}
                                            disabled={!item.checked}
                                            className="pt-input-date"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="pt-total-box">
                        <span>합계 비율: </span>
                        <span className={totalRate === 100 ? 'valid' : 'invalid'}>{totalRate}%</span>
                        {totalRate !== 100 && <span className="warning-msg">(100%를 맞춰주세요)</span>}
                    </div>
                </div>

                <div className="pt-footer">
                    <button className="btn-cancel" onClick={onClose}>취소</button>
                    <button className="btn-save" onClick={handleConfirm}>적용하기</button>
                </div>
            </div>
        </div>
    );
};

export default PaymentTermsModal;