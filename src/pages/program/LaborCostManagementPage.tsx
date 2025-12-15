import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, deleteDoc, updateDoc, getDoc,
  query, where, orderBy, onSnapshot 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import LaborCostModal from '../../components/partner/LaborCostModal';
import './LaborCostManagementPage.css';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- [Icons] ---
const Icons = {
  Download: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Plus: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Edit: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Filter: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
};

const LaborCostManagementPage: React.FC = () => {
  const [laborList, setLaborList] = useState<any[]>([]);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<{uid: string, name: string}>({uid:'', name:''});
   
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7)); 
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if(userDoc.exists()) {
                const d = userDoc.data();
                setCurrentUserInfo({ uid: user.uid, name: d.nickname || d.email || '사용자' });
                let targetUid = user.uid;
                if (d.role === 'sub_partner' && d.partnerInfo && d.partnerInfo.ownerUid) {
                    targetUid = d.partnerInfo.ownerUid;
                }
                setCurrentUid(targetUid);
            }
        } catch (e) { console.error("Error", e); }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      if (currentUid) {
          const unsubscribe = fetchLabors(currentUid, currentMonth);
          return () => unsubscribe && unsubscribe();
      }
  }, [currentUid, currentMonth]); 

  const fetchLabors = (uid: string, month: string) => {
    setLoading(true);
    const q = query(collection(db, 'users', uid, 'labor_costs'), where('paymentMonth', '==', month), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
        setLaborList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
    });
  };

  const filteredList = laborList.filter((item) => {
      if (paymentFilter === 'paid') return item.isPaid === true;
      if (paymentFilter === 'unpaid') return !item.isPaid; 
      return true;
  });

  const handleDelete = async (id: string) => {
      if (!confirm("삭제하시겠습니까?")) return;
      if (!currentUid) return;
      await deleteDoc(doc(db, 'users', currentUid, 'labor_costs', id));
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
      if (!currentUid) return;
      try {
          await updateDoc(doc(db, 'users', currentUid, 'labor_costs', id), { isPaid: newStatus === '지급완료' });
      } catch (e) { console.error(e); alert("오류가 발생했습니다."); }
  };

  // [엑셀 다운로드 핸들러 - 유지]
  const handleExcelDownload = async () => {
      if (filteredList.length === 0) return alert("데이터가 없습니다.");
      if (!currentUid) return;
      
      const workersSnap = await getDocs(collection(db, 'users', currentUid, 'workers'));
      const workerMap: {[key: string]: any} = {};
      workersSnap.forEach(doc => { workerMap[doc.id] = doc.data(); });

      const consolidatedMap: { [key: string]: any } = {};
      filteredList.forEach(item => {
          const wId = item.workerId;
          if (consolidatedMap[wId]) {
              consolidatedMap[wId].preTaxAmount += (item.preTaxAmount || 0);
              const days = new Set([...consolidatedMap[wId].workedDays, ...(item.workedDays || [])]);
              consolidatedMap[wId].workedDays = Array.from(days).sort();
          } else {
              consolidatedMap[wId] = { ...item };
          }
      });

      const excelRows: any[] = [];
      const dayHeaders = Array.from({length: 31}, (_, i) => `${i + 1}일`);
      
      const headers = [
        '보험구분', '이름', '주민등록번호', '국적코드', '체류자격코드', 
        '전화(지역)', '전화(국번)', '전화(뒷번호)', '직종코드', 
        ...dayHeaders, 
        '근로일수', '일평균근로시간', '보수지급기초일수', '보수총액', '임금총액', 
        '이직사유코드', '보험료부과구분부호', '보험료부과구분사유', '국세청신고여부', '지급월', 
        '소득세', '지방소득세', '고용보험료', '3.3%공제', 
        '인력소지급액', '프리랜서지급액', '은행명', '계좌번호'
      ];
      excelRows.push(headers);
      
      Object.values(consolidatedMap).forEach((d: any) => {
          const wData = workerMap[d.workerId] || {};
          const residentNumber = wData.rrn || wData.residentNumber || d.rrn || '';

          const dayCells = Array(31).fill('');
          let totalDays = 0;
          if (Array.isArray(d.workedDays)) {
              totalDays = d.workedDays.length;
              d.workedDays.forEach((dayVal: any) => {
                  let dayNum = -1;
                  if (typeof dayVal === 'string' && dayVal.includes('-')) {
                      dayNum = parseInt(dayVal.split('-')[2], 10);
                  } else {
                      dayNum = Number(dayVal);
                  }
                  if (dayNum >= 1 && dayNum <= 31) {
                      dayCells[dayNum - 1] = '1';
                  }
              });
          }

          let incomeTax = 0;
          let localTax = 0;
          let empInsurance = 0;
          let freelancerTax = 0;
          let finalAgency = 0;
          let finalFreelancer = 0;

          if (d.workerType === 'agency') {
              const dailyWage = totalDays > 0 ? Math.floor(d.preTaxAmount / totalDays) : 0;
              const taxableDaily = Math.max(0, dailyWage - 150000);
              let dailyTax = Math.floor(taxableDaily * 0.027);
              if (dailyTax < 1000) dailyTax = 0;

              incomeTax = dailyTax * totalDays; 
              localTax = Math.floor(incomeTax * 0.1);
              empInsurance = Math.floor(d.preTaxAmount * 0.009);
              finalAgency = d.preTaxAmount - incomeTax - localTax - empInsurance;
          } else {
              freelancerTax = Math.floor(d.preTaxAmount * 0.033);
              finalFreelancer = d.preTaxAmount - freelancerTax;
              
              const dailyWage = totalDays > 0 ? Math.floor(d.preTaxAmount / totalDays) : 0;
              const taxableDaily = Math.max(0, dailyWage - 150000);
              let dailyTax = Math.floor(taxableDaily * 0.027);
              if (dailyTax < 1000) dailyTax = 0;
              incomeTax = dailyTax * totalDays;
              localTax = Math.floor(incomeTax * 0.1);
              empInsurance = Math.floor(d.preTaxAmount * 0.009);
          }

          const payMonthStr = currentMonth.replace('-', '');

          excelRows.push([
              '3', d.workerName, residentNumber, '', '', '', '', '', '706', 
              ...dayCells, 
              totalDays, '8', totalDays, d.preTaxAmount, d.preTaxAmount, 
              '1', '', '', 'Y', payMonthStr, 
              incomeTax > 0 ? incomeTax : '',
              localTax > 0 ? localTax : '',
              empInsurance > 0 ? empInsurance : '',
              d.workerType !== 'agency' ? freelancerTax : '',
              d.workerType === 'agency' ? finalAgency : '',
              d.workerType !== 'agency' ? finalFreelancer : '',
              d.bankName, d.accountNumber
          ]);
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelRows);
      
      ws['!cols'] = [
          {wch: 5}, {wch: 10}, {wch: 15}, {wch: 5}, {wch: 5}, 
          {wch: 5}, {wch: 5}, {wch: 5}, {wch: 8}, 
          ...Array(31).fill({wch: 3}), 
          {wch: 8}, {wch: 8}, {wch: 8}, {wch: 12}, {wch: 12}, 
          {wch: 5}, {wch: 5}, {wch: 5}, {wch: 5}, {wch: 10}, 
          {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, 
          {wch: 12}, {wch: 12}, {wch: 10}, {wch: 15}
      ];

      XLSX.utils.book_append_sheet(wb, ws, "노무비신고");
      const blob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' });
      saveAs(blob, `${currentMonth}_노무비신고용.xlsx`);
  };

  return (
    <div className="labor-page">
      <div className="labor-container">
        <div className="labor-header">
          <div className="title-group">
            <h2>노무 관리</h2>
            <span className="subtitle">현장별 인건비 지급 내역 관리</span>
          </div>
          <div className="control-bar">
             <div className="filter-group">
                 <input type="month" className="input-month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} />
                 <div className="select-wrap">
                     <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as any)}>
                         <option value="all">전체 내역</option>
                         <option value="unpaid">미지급 건</option>
                         <option value="paid">지급완료 건</option>
                     </select>
                     <Icons.Filter />
                 </div>
             </div>
             <div className="action-group">
                 <button className="btn-manual" onClick={handleExcelDownload}><Icons.Download /> 엑셀 다운로드</button>
                 <button className="btn-primary" onClick={() => { setEditTarget(null); setIsModalOpen(true); }}><Icons.Plus /> 노무 등록</button>
             </div>
          </div>
        </div>

        <div className="labor-list-area">
            {loading ? (
                <div className="labor-loading"><div className="spinner"></div></div>
            ) : filteredList.length === 0 ? (
                <div className="labor-empty">등록된 노무 내역이 없습니다.</div>
            ) : (
                <div className="labor-content-wrapper">
                    {/* PC Table 수정: 은행, 계좌번호 열 추가 */}
                    <table className="labor-table">
                        <thead>
                            <tr>
                                <th>성명 (구분)</th>
                                <th>현장명</th>
                                <th className="tac">근무일수</th>
                                <th className="tar">세전금액</th>
                                <th className="tar">공제액</th>
                                <th className="tar">실지급액</th>
                                {/* [추가] 은행 및 계좌번호 헤더 */}
                                <th>은행</th>
                                <th>계좌번호</th>
                                <th>지급일</th>
                                <th className="tac">상태</th>
                                <th className="tac">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredList.map(item => (
                                <tr key={item.id} className={item.isPaid ? 'row-paid' : ''}>
                                    <td>
                                        <div className="worker-info">
                                            <strong>{item.workerName}</strong>
                                            <span className={`type-badge ${item.workerType}`}>{item.workerType === 'agency' ? '인력' : '프리'}</span>
                                        </div>
                                    </td>
                                    <td>{item.siteName}</td>
                                    <td className="tac">{item.totalDays}일</td>
                                    <td className="tar">{item.preTaxAmount.toLocaleString()}</td>
                                    <td className="tar text-red">-{item.deductionAmount.toLocaleString()}</td>
                                    <td className="tar bold highlight">{item.finalAmount.toLocaleString()}</td>
                                    {/* [추가] 은행 및 계좌번호 데이터 표시 */}
                                    <td>{item.bankName}</td>
                                    <td>{item.accountNumber}</td>
                                    <td className="text-sub">{item.paymentCycle?.join(', ')}</td>
                                    <td className="tac">
                                        <select 
                                            className={`status-chip ${item.isPaid ? 'paid' : 'unpaid'}`}
                                            value={item.isPaid ? '지급완료' : '미지급'}
                                            onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                        >
                                            <option value="미지급">미지급</option>
                                            <option value="지급완료">지급완료</option>
                                        </select>
                                    </td>
                                    <td className="tac">
                                        <div className="btn-group">
                                            <button className="btn-icon" onClick={() => { setEditTarget(item); setIsModalOpen(true); }}><Icons.Edit /></button>
                                            <button className="btn-icon del" onClick={() => handleDelete(item.id)}><Icons.Trash /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Mobile Card List 수정: 계좌 정보 추가 */}
                    <div className="labor-mobile-list">
                         {filteredList.map(item => (
                             <div key={item.id} className={`labor-card ${item.isPaid ? 'paid' : ''}`}>
                                 <div className="card-header">
                                     <div className="worker-profile">
                                         <span className="name">{item.workerName}</span>
                                         <span className={`type-badge ${item.workerType}`}>{item.workerType === 'agency' ? '인력' : '프리'}</span>
                                     </div>
                                     <select 
                                         className={`status-chip small ${item.isPaid ? 'paid' : 'unpaid'}`}
                                         value={item.isPaid ? '지급완료' : '미지급'}
                                         onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                     >
                                         <option value="미지급">미지급</option>
                                         <option value="지급완료">완료</option>
                                     </select>
                                 </div>
                                 
                                 <div className="card-body">
                                     <div className="info-row site">
                                         <span className="label">현장</span>
                                         <span className="value">{item.siteName}</span>
                                     </div>
                                     <div className="info-grid">
                                         <div className="grid-item">
                                             <span className="label">근무일수</span>
                                             <span className="value">{item.totalDays}일</span>
                                         </div>
                                         <div className="grid-item">
                                             <span className="label">세전금액</span>
                                             <span className="value">{item.preTaxAmount.toLocaleString()}</span>
                                         </div>
                                         <div className="grid-item">
                                             <span className="label text-red">공제액</span>
                                             <span className="value text-red">-{item.deductionAmount.toLocaleString()}</span>
                                         </div>
                                     </div>
                                     <div className="total-row">
                                         <span className="label">실지급액</span>
                                         <span className="value total">{item.finalAmount.toLocaleString()} 원</span>
                                     </div>
                                     {/* [추가] 모바일 뷰 계좌정보 */}
                                     <div className="bank-info-row" style={{marginTop:'8px', fontSize:'13px', color:'#555', textAlign:'right'}}>
                                         {item.bankName} {item.accountNumber}
                                     </div>
                                     <div className="date-row">
                                         지급일: {item.paymentCycle?.join(', ')}
                                     </div>
                                 </div>

                                 <div className="card-footer">
                                     <button className="card-btn edit" onClick={() => { setEditTarget(item); setIsModalOpen(true); }}>수정</button>
                                     <button className="card-btn del" onClick={() => handleDelete(item.id)}>삭제</button>
                                 </div>
                             </div>
                         ))}
                    </div>
                </div>
            )}
        </div>

        {isModalOpen && currentUid && (
            <LaborCostModal 
                isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
                partnerUid={currentUid} targetLabor={editTarget} currentMonth={currentMonth}
                onRefresh={() => {}} userName={currentUserInfo.name} 
            />
        )}
      </div>
    </div>
  );
};

export default LaborCostManagementPage;