import React, { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import './PayrollExecutionModal.css';

// 상위에서 넘어오는 직원 데이터 (DB 최신)
interface StaffData {
    uid: string;
    name: string;
    baseSalary?: number;
    foodAllowance?: number;
    qualAllowance?: number;
    longServiceAllowance?: number;
    dependentCount?: number;
    childCount?: number;
    bankName?: string;
    accountNum?: string;
    accountHolder?: string;
}

// 급여 대장 아이템 (계산 결과)
interface PayrollItem {
    uid: string;
    name: string;
    isProbation: boolean; 
    isMidJoin: boolean;   
    workDays: number;     
    
    payDetails: {
        base: number;      
        food: number;      
        qual: number;      
        long: number;      
    };

    totalPay: number;     
    taxablePay: number;   
    
    deductions: {
        np: number; hi: number; ltc: number; ei: number; it: number; lit: number; total: number;
    };
    netPay: number;       
    bankInfo: string;     
}

// DB에 저장될 문서 구조
interface PayrollExecutionDoc {
    id: string;
    targetMonth: string; // YYYY-MM
    baseDate: number;
    totalAmount: number; // 총 지급액
    totalCount: number;  // 인원 수
    createdAt: any;      // 저장 일시
    items: PayrollItem[]; // 급여 리스트 스냅샷
}

interface Props {
    partnerUid: string;
    staffList: StaffData[];
    baseDate: number; 
    onClose: () => void;
}

const PayrollExecutionModal: React.FC<Props> = ({ partnerUid, staffList, baseDate, onClose }) => {
    const db = getFirestore();

    const [targetMonth, setTargetMonth] = useState(new Date().toISOString().slice(0, 7)); 
    const [payrollList, setPayrollList] = useState<PayrollItem[]>([]);
    
    // [NEW] 과거 내역 관련 상태
    const [historyList, setHistoryList] = useState<PayrollExecutionDoc[]>([]);
    const [viewMode, setViewMode] = useState<'create' | 'view'>('create'); // 작성모드 vs 조회모드
    const [selectedHistory, setSelectedHistory] = useState<PayrollExecutionDoc | null>(null);

    // [1] 과거 내역 불러오기
    const fetchHistory = async () => {
        try {
            const q = query(
                collection(db, 'users', partnerUid, 'payroll_executions'),
                orderBy('createdAt', 'desc')
            );
            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollExecutionDoc));
            setHistoryList(list);
        } catch (e) { console.error("히스토리 로딩 실패", e); }
    };

    useEffect(() => {
        fetchHistory();
    }, [partnerUid]);

    // [2] 급여 계산 로직 (작성 모드일 때만 자동 계산)
    useEffect(() => {
        if (viewMode === 'create') {
            const initialList = staffList.map(s => calculatePayroll(s, false, false, getDaysInMonth()));
            setPayrollList(initialList);
        }
    }, [staffList, targetMonth, viewMode]);

    const getPeriodText = (monthStr: string) => {
        const [y, m] = monthStr.split('-').map(Number);
        if (baseDate === 1) {
            const lastDay = new Date(y, m, 0).getDate();
            return `${y}년 ${m}월 1일 ~ ${m}월 ${lastDay}일`;
        } else {
            const prevM = m === 1 ? 12 : m - 1;
            const prevY = m === 1 ? y - 1 : y;
            const endDate = baseDate - 1;
            return `${prevY}년 ${prevM}월 ${baseDate}일 ~ ${y}년 ${m}월 ${endDate}일`;
        }
    };

    const getDaysInMonth = () => {
        const [y, m] = targetMonth.split('-').map(Number);
        return new Date(y, m, 0).getDate();
    };

    // 급여 계산 함수
    const calculatePayroll = (staff: StaffData, isProbation: boolean, isMidJoin: boolean, workDays: number): PayrollItem => {
        const daysInMonth = getDaysInMonth();
        const dayRatio = isMidJoin ? (workDays / daysInMonth) : 1;
        const probRatio = isProbation ? 0.9 : 1;

        const rawBase = Number(staff.baseSalary || 0);
        const rawFood = Number(staff.foodAllowance || 0);
        const rawQual = Number(staff.qualAllowance || 0);
        const rawLong = Number(staff.longServiceAllowance || 0);

        const calcBase = Math.floor(rawBase * probRatio * dayRatio);
        const calcFood = Math.floor(rawFood * dayRatio);
        const calcQual = Math.floor(rawQual * probRatio * dayRatio);
        const calcLong = Math.floor(rawLong * dayRatio);

        const totalPay = calcBase + calcFood + calcQual + calcLong;
        const taxablePay = calcBase + calcQual + calcLong;

        const np = Math.floor(taxablePay * 0.045);
        const hi = Math.floor(taxablePay * 0.03545);
        const ltc = Math.floor(hi * 0.1295);
        const ei = Math.floor(taxablePay * 0.009);
        
        // 소득세 (간이세액표 약식 적용)
        const dependents = Math.max(1, staff.dependentCount || 1);
        const children = dependents >= 2 ? (staff.childCount || 0) : 0;
        
        let it = 0;
        // (간단 근사치 로직 - 실제로는 StaffDetailModal 로직 공유 권장)
        if (taxablePay > 1060000) { 
             const annual = taxablePay * 12;
             // 공제 대략 적용 (근로소득공제 + 인적공제)
             const taxBase = annual - (annual * 0.3) - (dependents * 1500000); 
             if(taxBase > 0) it = Math.floor(taxBase * 0.06 / 12 / 10) * 10; 
        }
        if(children > 0) it -= (children * 12500);
        if(it < 0) it = 0;

        const lit = Math.floor(it * 0.1);
        const totalDed = np + hi + ltc + ei + it + lit;

        return {
            uid: staff.uid,
            name: staff.name,
            isProbation,
            isMidJoin,
            workDays: isMidJoin ? workDays : daysInMonth,
            payDetails: { base: calcBase, food: calcFood, qual: calcQual, long: calcLong },
            totalPay,
            taxablePay,
            deductions: { np, hi, ltc, ei, it, lit, total: totalDed },
            netPay: totalPay - totalDed,
            bankInfo: `${staff.bankName || ''} ${staff.accountNum || ''} ${staff.accountHolder || ''}`
        };
    };

    const handleOptionChange = (uid: string, field: 'isProbation' | 'isMidJoin' | 'workDays', value: any) => {
        if (viewMode === 'view') return; // 조회 모드에선 수정 불가

        setPayrollList(prev => prev.map(item => {
            if (item.uid !== uid) return item;
            const staff = staffList.find(s => s.uid === uid)!;
            const newProbation = field === 'isProbation' ? value : item.isProbation;
            const newMidJoin = field === 'isMidJoin' ? value : item.isMidJoin;
            const newWorkDays = field === 'workDays' ? Number(value) : item.workDays;
            return calculatePayroll(staff, newProbation, newMidJoin, newWorkDays);
        }));
    };

    // [NEW] 집행 확정 (DB 저장)
    const handleExecute = async () => {
        if (payrollList.length === 0) return;
        if (!confirm(`${targetMonth} 급여를 확정하시겠습니까?\n확정 후에는 수정할 수 없으며 기록으로 남습니다.`)) return;

        const totalAmount = payrollList.reduce((sum, item) => sum + item.netPay, 0);

        try {
            await addDoc(collection(db, 'users', partnerUid, 'payroll_executions'), {
                targetMonth,
                baseDate,
                totalAmount,
                totalCount: payrollList.length,
                createdAt: serverTimestamp(),
                items: payrollList // 현재 계산된 리스트 스냅샷 저장
            });

            alert("급여 집행이 완료되었습니다.");
            fetchHistory(); // 목록 갱신
        } catch (e) {
            console.error(e);
            alert("저장 중 오류가 발생했습니다.");
        }
    };

    // [NEW] 과거 내역 조회
    const handleHistoryClick = (doc: PayrollExecutionDoc) => {
        setSelectedHistory(doc);
        setPayrollList(doc.items); // 당시 스냅샷 데이터로 교체
        setTargetMonth(doc.targetMonth);
        setViewMode('view');
    };

    // [NEW] 새 급여 작성 모드로 복귀
    const handleNewMode = () => {
        setTargetMonth(new Date().toISOString().slice(0, 7));
        setViewMode('create');
        setSelectedHistory(null);
    };

    // 엑셀 다운로드
    const handleExportExcel = () => {
        const wsData = payrollList.map(item => ({
            '이름': item.name,
            '기본급': item.payDetails.base,
            '식대': item.payDetails.food,
            '자격수당': item.payDetails.qual,
            '근속수당': item.payDetails.long,
            '지급총액': item.totalPay,
            '국민연금': item.deductions.np,
            '건강보험': item.deductions.hi,
            '장기요양': item.deductions.ltc,
            '고용보험': item.deductions.ei,
            '소득세': item.deductions.it,
            '지방세': item.deductions.lit,
            '공제합계': item.deductions.total,
            '실수령액': item.netPay,
            '입금계좌': item.bankInfo,
            '비고': item.isProbation ? '수습' : (item.isMidJoin ? `중도(${item.workDays}일)` : '')
        }));

        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `${targetMonth}_급여대장`);
        XLSX.writeFile(wb, `급여대장_${targetMonth}.xlsx`);
    };

    return (
        <div className="payroll-modal-overlay">
            <div className="payroll-modal-content">
                <div className="payroll-header">
                    <h3>
                        {viewMode === 'create' ? '💰 급여 집행 (작성)' : `📄 급여 상세 내역 (${targetMonth})`}
                    </h3>
                    <div className="header-actions">
                        {viewMode === 'view' && (
                            <button className="btn-new-mode" onClick={handleNewMode}>↺ 새 급여 작성하기</button>
                        )}
                        <button className="btn-close" onClick={onClose}>×</button>
                    </div>
                </div>
                
                <div className="payroll-controls">
                    <div className="control-group">
                        <label>귀속 연월</label>
                        {viewMode === 'create' ? (
                            <input type="month" value={targetMonth} onChange={e => setTargetMonth(e.target.value)} />
                        ) : (
                            <span className="readonly-val">{targetMonth}</span>
                        )}
                    </div>
                    <div className="period-info">
                        산정 기간: <strong>{getPeriodText(targetMonth)}</strong>
                    </div>
                    <button className="btn-excel" onClick={handleExportExcel}>📥 엑셀 다운로드</button>
                </div>

                {/* 메인 테이블 */}
                <div className="payroll-table-wrapper">
                    <table className="payroll-table">
                        <thead>
                            <tr>
                                <th rowSpan={2} style={{width:'80px'}}>이름</th>
                                <th rowSpan={2} style={{width:'60px'}}>수습</th>
                                <th rowSpan={2} style={{width:'60px'}}>중도</th>
                                <th rowSpan={2} style={{width:'50px'}}>일수</th>
                                
                                <th colSpan={4} style={{background:'#e3f2fd'}}>지급 내역</th>
                                <th rowSpan={2} style={{background:'#bbdefb'}}>지급계</th>
                                
                                <th colSpan={4}>4대보험</th>
                                <th colSpan={2}>세금</th>
                                <th rowSpan={2} style={{background:'#fff3e0'}}>공제계</th>
                                
                                <th rowSpan={2} style={{background:'#ffebee', color:'#d32f2f'}}>실수령액</th>
                                <th rowSpan={2}>입금계좌</th>
                            </tr>
                            <tr className="sub-head">
                                <th style={{background:'#e3f2fd'}}>기본급</th>
                                <th style={{background:'#e3f2fd'}}>식대</th>
                                <th style={{background:'#e3f2fd'}}>자격</th>
                                <th style={{background:'#e3f2fd'}}>근속</th>
                                
                                <th>국민</th><th>건강</th><th>장기</th><th>고용</th>
                                <th>소득</th><th>지방</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payrollList.map(item => (
                                <tr key={item.uid}>
                                    <td>{item.name}</td>
                                    <td className="center">
                                        <input 
                                            type="checkbox" 
                                            checked={item.isProbation} 
                                            onChange={e => handleOptionChange(item.uid, 'isProbation', e.target.checked)} 
                                            disabled={viewMode === 'view'}
                                        />
                                    </td>
                                    <td className="center">
                                        <input 
                                            type="checkbox" 
                                            checked={item.isMidJoin} 
                                            onChange={e => handleOptionChange(item.uid, 'isMidJoin', e.target.checked)} 
                                            disabled={viewMode === 'view'}
                                        />
                                    </td>
                                    <td className="center">
                                        {item.isMidJoin && viewMode === 'create' ? (
                                            <input 
                                                type="number" 
                                                value={item.workDays} 
                                                onChange={e => handleOptionChange(item.uid, 'workDays', e.target.value)} 
                                                style={{width:'40px', textAlign:'center'}}
                                                max={31} min={1}
                                            />
                                        ) : <span>{item.isMidJoin ? `${item.workDays}일` : '만근'}</span>}
                                    </td>
                                    
                                    <td className="right">{item.payDetails.base.toLocaleString()}</td>
                                    <td className="right">{item.payDetails.food.toLocaleString()}</td>
                                    <td className="right">{item.payDetails.qual.toLocaleString()}</td>
                                    <td className="right">{item.payDetails.long.toLocaleString()}</td>
                                    <td className="right bold" style={{background:'#bbdefb'}}>{item.totalPay.toLocaleString()}</td>
                                    
                                    <td className="right">{item.deductions.np.toLocaleString()}</td>
                                    <td className="right">{item.deductions.hi.toLocaleString()}</td>
                                    <td className="right">{item.deductions.ltc.toLocaleString()}</td>
                                    <td className="right">{item.deductions.ei.toLocaleString()}</td>
                                    <td className="right">{item.deductions.it.toLocaleString()}</td>
                                    <td className="right">{item.deductions.lit.toLocaleString()}</td>
                                    
                                    <td className="right bold" style={{background:'#fff3e0', color:'#e65100'}}>{item.deductions.total.toLocaleString()}</td>
                                    <td className="right bold" style={{background:'#ffebee', color:'#d32f2f', fontSize:'15px'}}>{item.netPay.toLocaleString()}</td>
                                    
                                    <td style={{fontSize:'11px', color:'#666', maxWidth:'150px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={item.bankInfo}>{item.bankInfo}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 하단 영역: 작성 모드면 저장버튼, 공통으로 히스토리 리스트 */}
                <div className="payroll-bottom-section">
                    {viewMode === 'create' && (
                        <div className="action-row">
                            <span className="info-txt">※ 집행 확정 시 수정할 수 없습니다.</span>
                            <button className="btn-exec" onClick={handleExecute}>집행 확정 (저장)</button>
                        </div>
                    )}
                    
                    <div className="history-list-area">
                        <h4>📜 과거 급여 집행 내역</h4>
                        {historyList.length === 0 ? <p className="no-history">저장된 내역이 없습니다.</p> : (
                            <ul className="history-list">
                                {historyList.map(doc => (
                                    <li key={doc.id} onClick={() => handleHistoryClick(doc)} className={selectedHistory?.id === doc.id ? 'active' : ''}>
                                        <span className="h-month">{doc.targetMonth}</span>
                                        <span className="h-amount">총 {doc.totalAmount.toLocaleString()}원</span>
                                        <span className="h-count">({doc.totalCount}명)</span>
                                        <span className="h-date">{doc.createdAt?.toDate().toLocaleDateString()} 저장</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PayrollExecutionModal;