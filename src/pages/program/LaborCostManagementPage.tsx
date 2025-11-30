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
import { K_BRAND_COLOR } from '../../constants';
import LaborCostModal from '../../components/partner/LaborCostModal';
import './LaborCostManagementPage.css';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const LaborCostManagementPage: React.FC = () => {
  const [laborList, setLaborList] = useState<any[]>([]);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  
  // [수정] 사용자 정보 상태
  const [currentUserInfo, setCurrentUserInfo] = useState<{uid: string, name: string}>({uid:'', name:''});
  
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUid(user.uid);
        
        // [수정] 사용자 정보 로드 (getDoc 사용)
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if(userDoc.exists()) {
                const d = userDoc.data();
                setCurrentUserInfo({ uid: user.uid, name: d.nickname || d.email || '사용자' });
            }
        } catch(e) { console.error("사용자 정보 로드 실패", e); }
        
        fetchLabors(user.uid, currentMonth);
      }
    });
    return () => unsubscribe();
  }, [currentMonth]); 

  // ... (fetchLabors, filteredList, handleDelete, handleStatusChange, handleExcelDownload 로직은 기존과 동일)
  // ... 코드 생략 ...

  const fetchLabors = (uid: string, month: string) => {
    const q = query(
        collection(db, 'users', uid, 'labor_costs'),
        where('paymentMonth', '==', month),
        orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLaborList(docs);
    });
    return unsubscribe;
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
      const isPaid = newStatus === '지급완료';
      await updateDoc(doc(db, 'users', currentUid, 'labor_costs', id), { isPaid });
  };

  const handleExcelDownload = async () => {
      if (filteredList.length === 0) return alert("데이터가 없습니다.");
      if (!currentUid) return;

      const workersSnap = await getDocs(collection(db, 'users', currentUid, 'workers'));
      const workerMap: {[key: string]: any} = {};
      workersSnap.forEach(doc => { workerMap[doc.id] = doc.data(); });

      const consolidatedMap: { [key: string]: any } = {};
      filteredList.forEach(item => {
          const workerId = item.workerId;
          if (consolidatedMap[workerId]) {
              consolidatedMap[workerId].preTaxAmount += (item.preTaxAmount || 0);
              const existingDays = new Set<number>(consolidatedMap[workerId].workedDays);
              (item.workedDays || []).forEach((d: number) => existingDays.add(d));
              consolidatedMap[workerId].workedDays = Array.from(existingDays).sort((a, b) => a - b);
          } else {
              consolidatedMap[workerId] = { ...item };
          }
      });

      const consolidatedList = Object.values(consolidatedMap);
      const excelRows: any[] = [];
      
      const dayHeaders = Array.from({length: 31}, (_, i) => (i + 1).toString());
      const headers = [
          '보험구분', '성명', '주민(외국인)등록번호', '국적코드', '체류자격코드', '전화(지역번호)', '전화(국번)', '전화(뒷번호)', '직종코드',
          ...dayHeaders,
          '근로일수', '일평균근로시간', '보수지급기초일수', '보수총액(과세소득)', '임금총액', '이직사유코드', '보험료부과구분부호', '보험료부과구분사유', '국세청일용근로소득신고여부',
          '지급월', '총지급액(과세소득)', '비과세소득', '소득세', '지방소득세', '고용보험료', '3.3%공제', '인력사무소지급액', '프리랜서지급액', '은행명', '계좌번호'
      ];
      excelRows.push(headers);

      consolidatedList.forEach((data) => {
          const workedDaysList: number[] = data.workedDays || [];
          const workedDaysCount = workedDaysList.length;
          const preTaxAmount = data.preTaxAmount || 0;
          const isAgency = data.workerType === 'agency';

          let incomeTax = 0;
          let localIncomeTax = 0;
          let employmentInsurance = 0;
          let freelancerDeduction = 0;
          let agencyPayment = 0;
          let freelancerPayment = 0;

          if (isAgency) {
              const taxBase = preTaxAmount - (workedDaysCount * 150000);
              incomeTax = (taxBase > 0) ? Math.floor(taxBase * 0.027) : 0;
              if (incomeTax < 1000) incomeTax = 0;
              localIncomeTax = Math.floor(incomeTax * 0.1);
              employmentInsurance = Math.floor(preTaxAmount * 0.009);
              agencyPayment = preTaxAmount - incomeTax - localIncomeTax - employmentInsurance;
          } else {
              freelancerDeduction = Math.floor(preTaxAmount * 0.033);
              freelancerPayment = preTaxAmount - freelancerDeduction;
          }

          let rrn = data.residentNumber || data.rrn || '';
          if (!rrn && workerMap[data.workerId]) {
              const wData = workerMap[data.workerId];
              rrn = wData.residentNumber || wData.rrn || wData.residentNo || '';
          }
          rrn = rrn.replace(/-/g, '');

          const phoneParts = (data.phoneNumber || '').split('-');
          const dailyWorkStatus = Array(31).fill(0);
          workedDaysList.forEach(d => { if (d >= 1 && d <= 31) dailyWorkStatus[d - 1] = 1; });

          const row = [
              3, data.workerName || '', rrn, '', '', phoneParts[0]||'', phoneParts[1]||'', phoneParts[2]||'', 706,
              ...dailyWorkStatus,
              workedDaysCount, 8, workedDaysCount, preTaxAmount, preTaxAmount, '', '', '', 'Y',
              data.paymentMonth.replace('-', ''), preTaxAmount, '',
              incomeTax, localIncomeTax, employmentInsurance, freelancerDeduction, agencyPayment, freelancerPayment,
              data.bankName || '', data.accountNumber || ''
          ];
          excelRows.push(row);
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(excelRows);
      XLSX.utils.book_append_sheet(wb, ws, "노무비내역");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
      saveAs(blob, `${currentMonth}_노무비내역.xlsx`);
  };

  return (
    <div className="labor-page-container">
        <div className="labor-header">
            <h2>노무 관리</h2>
            <div className="header-controls">
                <select className="status-filter" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as any)}>
                    <option value="all">전체 보기</option>
                    <option value="unpaid">미지급 건만</option>
                    <option value="paid">지급완료 건만</option>
                </select>
                <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} />
                <button className="btn-excel" onClick={handleExcelDownload}>엑셀 다운로드</button>
                <button className="btn-add" onClick={() => { setEditTarget(null); setIsModalOpen(true); }} style={{backgroundColor: K_BRAND_COLOR}}>+ 노무 등록</button>
            </div>
        </div>

        <div className="labor-list-wrapper">
            <table className="labor-table">
                <thead>
                    <tr>
                        <th>성명 (구분)</th>
                        <th>현장</th>
                        <th>근무일수</th>
                        <th>세전금액</th>
                        <th>공제액</th>
                        <th>실지급액</th>
                        <th>지급일</th>
                        <th>지급상태</th>
                        <th>관리</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredList.length === 0 ? <tr><td colSpan={9} className="no-data">등록된 노무 내역이 없습니다.</td></tr> :
                    filteredList.map(item => (
                        <tr key={item.id}>
                            <td>
                                {item.workerName} 
                                <span className="type-badge">
                                    {item.workerType === 'agency' ? '인력' : '프리'}
                                </span>
                            </td>
                            <td>{item.siteName}</td>
                            <td>{item.totalDays}일</td>
                            <td className="tar">{item.preTaxAmount.toLocaleString()}</td>
                            <td className="tar text-red">{item.deductionAmount.toLocaleString()}</td>
                            <td className="tar bold">{item.finalAmount.toLocaleString()}</td>
                            <td>{item.paymentCycle?.join(', ')}</td>
                            <td className="tac">
                                <select 
                                    className={`status-select ${item.isPaid ? 'paid' : 'unpaid'}`}
                                    value={item.isPaid ? '지급완료' : '미지급'}
                                    onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                >
                                    <option value="미지급">미지급</option>
                                    <option value="지급완료">지급완료</option>
                                </select>
                            </td>
                            <td className="tac">
                                <button className="btn-mini-edit" onClick={() => { setEditTarget(item); setIsModalOpen(true); }}>수정</button>
                                <button className="btn-mini-del" onClick={() => handleDelete(item.id)}>삭제</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {isModalOpen && currentUid && (
            <LaborCostModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                partnerUid={currentUid}
                targetLabor={editTarget}
                currentMonth={currentMonth}
                onRefresh={() => {}} 
                userName={currentUserInfo.name} // [수정] 사용자 이름 전달
            />
        )}
    </div>
  );
};

export default LaborCostManagementPage;