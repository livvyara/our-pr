import React, { useEffect, useState, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, deleteDoc, addDoc, serverTimestamp, 
  query, orderBy, getDoc 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import './AccountingBankingExcelPage.css';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// =============================================================================
// [Interfaces]
// =============================================================================

export interface BankTransaction {
  id: string;
  fullDateTime: string; 
  date: string;         
  time: string;         
  inAmount: number;     
  outAmount: number;    
  balance: number;      
  memo: string;         
  content: string;      
  senderReceiver: string; 
  source: 'bank';
}

export interface CardTransaction {
  id: string;
  fullDateTime: string;
  date: string;
  time: string;
  cardName: string;     
  approvalNo: string;   
  amount: number;       
  merchantName: string; 
  installment: string;  
  source: 'card';
}

const BANK_HEADERS = ["거래일시", "입금액", "출금액", "잔액", "출금계좌메모", "적요", "의뢰인/수취인"];
const CARD_HEADERS = ["승인일시", "카드명", "승인번호", "가맹점명", "승인금액", "할부개월"];

const AccountingBankingExcelPage: React.FC = () => {
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<{uid: string, name: string}>({uid:'', name:''});
  
  const [activeTab, setActiveTab] = useState<'bank' | 'card'>('bank');
  const [bankList, setBankList] = useState<BankTransaction[]>([]);
  const [cardList, setCardList] = useState<CardTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
                fetchTransactions(targetUid);
            }
        } catch (e) { console.error("사용자 정보 로드 실패", e); }
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchTransactions = async (uid: string) => {
      setLoading(true);
      try {
          const bankQ = query(collection(db, 'users', uid, 'BANK_TRANSACTIONS'), orderBy('fullDateTime', 'desc'));
          const bankSnap = await getDocs(bankQ);
          const banks: BankTransaction[] = [];
          bankSnap.forEach(d => banks.push({ id: d.id, ...d.data() } as BankTransaction));
          setBankList(banks);

          const cardQ = query(collection(db, 'users', uid, 'CARD_TRANSACTIONS'), orderBy('fullDateTime', 'desc'));
          const cardSnap = await getDocs(cardQ);
          const cards: CardTransaction[] = [];
          cardSnap.forEach(d => cards.push({ id: d.id, ...d.data() } as CardTransaction));
          setCardList(cards);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
  };

  const addLog = async (message: string) => {
      if (!currentUid) return;
      try {
          await addDoc(collection(db, 'users', currentUid, 'ACTIVITY_LOGS'), {
              text: message, createdAt: serverTimestamp(), type: 'accounting_upload'
          });
      } catch (e) {}
  };

  const parseExcelDate = (excelDate: any): { date: string, time: string, full: string } => {
      let dt = new Date();
      if (typeof excelDate === 'number') {
          dt = new Date((excelDate - (25567 + 2)) * 86400 * 1000); 
      } else if (typeof excelDate === 'string') {
          const dateStr = excelDate.replace(/\./g, '-').replace(/\//g, '-'); 
          dt = new Date(dateStr);
      }
      if (isNaN(dt.getTime())) return { date: '', time: '', full: '' };

      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const hh = String(dt.getHours()).padStart(2, '0');
      const mi = String(dt.getMinutes()).padStart(2, '0');
      const ss = String(dt.getSeconds()).padStart(2, '0');

      return {
          date: `${yyyy}-${mm}-${dd}`,
          time: `${hh}:${mi}:${ss}`,
          full: `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
      };
  };

  const downloadTemplate = (type: 'bank' | 'card') => {
      const headers = type === 'bank' ? [BANK_HEADERS] : [CARD_HEADERS];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(headers);
      
      if (type === 'bank') {
          XLSX.utils.sheet_add_aoa(ws, [
              ["2025-01-01 10:00:00", 100000, 0, 500000, "이자", "예금이자", "은행"],
              ["2025-01-02 14:30:00", 0, 50000, 450000, "출금", "자재비", "홍길동"]
          ], { origin: "A2" });
      } else {
          XLSX.utils.sheet_add_aoa(ws, [
              ["2025-01-01 12:00:00", "국민카드", "12345678", "식당A", 15000, "일시불"],
          ], { origin: "A2" });
      }
      ws['!cols'] = headers[0].map(() => ({ wch: 15 }));
      XLSX.utils.book_append_sheet(wb, ws, "Template");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
      saveAs(blob, type === 'bank' ? '은행거래내역_등록양식.xlsx' : '카드거래내역_등록양식.xlsx');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentUid) return;

      setLoading(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 }); 
          const rows = data.slice(1) as any[]; 
          
          if (activeTab === 'bank') await processBankUpload(rows);
          else await processCardUpload(rows);
          
          setLoading(false);
          if(fileInputRef.current) fileInputRef.current.value = ''; 
      };
      reader.readAsBinaryString(file);
  };

  const processBankUpload = async (rows: any[]) => {
      if (!currentUid) return;
      let successCount = 0;
      // [수정] 중복 체크 로직 제거 -> 무조건 등록
      const collectionRef = collection(db, 'users', currentUid, 'BANK_TRANSACTIONS');

      for (const row of rows) {
          if (!row[0]) continue; 
          const { date, time, full } = parseExcelDate(row[0]);
          const inAmt = Number(row[1]) || 0;
          const outAmt = Number(row[2]) || 0;
          if (!date) continue; 

          // [수정] 기존 query 및 중복 체크 부분 삭제
          
          await addDoc(collectionRef, {
              fullDateTime: full, date, time, inAmount: inAmt, outAmount: outAmt,
              balance: Number(row[3]) || 0, memo: row[4] || '', content: row[5] || '',
              senderReceiver: row[6] || '', source: 'bank', createdAt: serverTimestamp()
          });
          successCount++;
      }
      // [수정] 안내 메시지 변경
      alert(`총 ${rows.length}건 중 ${successCount}건이 등록되었습니다.`);
      if (successCount > 0) {
          await addLog(`[${currentUserInfo.name}]이 은행 거래내역을 ${successCount}건 등록 하였습니다.`);
          fetchTransactions(currentUid);
      }
  };

  const processCardUpload = async (rows: any[]) => {
      if (!currentUid) return;
      let successCount = 0;
      // [수정] 중복 체크 로직 제거 -> 무조건 등록
      const collectionRef = collection(db, 'users', currentUid, 'CARD_TRANSACTIONS');

      for (const row of rows) {
          if (!row[0]) continue;
          const { date, time, full } = parseExcelDate(row[0]);
          const amt = Number(row[4]) || 0;
          const approvalNo = row[2] ? String(row[2]) : '';
          if (!date) continue;

          // [수정] 기존 query 및 중복 체크 부분 삭제

          await addDoc(collectionRef, {
              fullDateTime: full, date, time, cardName: row[1] || '', approvalNo: approvalNo,
              merchantName: row[3] || '', amount: amt, installment: row[5] || '일시불',
              source: 'card', createdAt: serverTimestamp()
          });
          successCount++;
      }
      // [수정] 안내 메시지 변경
      alert(`총 ${rows.length}건 중 ${successCount}건이 등록되었습니다.`);
      if (successCount > 0) {
          await addLog(`[${currentUserInfo.name}]이 카드 거래내역을 ${successCount}건 등록 하였습니다.`);
          fetchTransactions(currentUid);
      }
  };

  const handleDelete = async (id: string, item: any, type: 'bank' | 'card') => {
      if (!currentUid) return;
      if (!confirm("정말 삭제하시겠습니까? (복구 불가)")) return;
      try {
          const colName = type === 'bank' ? 'BANK_TRANSACTIONS' : 'CARD_TRANSACTIONS';
          await deleteDoc(doc(db, 'users', currentUid, colName, id));
          const dateInfo = item.fullDateTime || item.date;
          const amtInfo = type === 'bank' ? (item.inAmount > 0 ? `입금 ${item.inAmount}` : `출금 ${item.outAmount}`) : `승인 ${item.amount}`;
          await addLog(`[${currentUserInfo.name}]이 거래일시 ${dateInfo}, ${amtInfo}원 건을 삭제 했습니다.`);
          alert("삭제되었습니다.");
          if (type === 'bank') setBankList(prev => prev.filter(i => i.id !== id));
          else setCardList(prev => prev.filter(i => i.id !== id));
      } catch (e) { console.error(e); alert("오류 발생"); }
  };

  return (
    <div className="banking-excel-page-container">
        {/* 헤더 */}
        <div className="banking-excel-header-wrapper">
            <div className="banking-excel-title">
                <h2>계좌/카드 거래내역 등록</h2>
                <p>은행 및 카드사 엑셀 파일을 업로드하여 거래내역을 등록합니다.</p>
            </div>

            {/* 컨트롤 패널 (회색 박스) */}
            <div className="banking-excel-control-panel">
                <div className="banking-excel-filter-row">
                    {/* 모드 버튼 (탭 역할) */}
                    <div className="banking-excel-mode-buttons">
                        <button className={`banking-excel-mode-btn ${activeTab === 'bank' ? 'active' : ''}`} onClick={() => setActiveTab('bank')}>
                            🏦 은행 거래내역
                        </button>
                        <button className={`banking-excel-mode-btn ${activeTab === 'card' ? 'active' : ''}`} onClick={() => setActiveTab('card')}>
                            💳 카드 거래내역
                        </button>
                    </div>

                    {/* [수정] 안내 문구 변경 (중복 제외 내용 삭제) */}
                    <span className="banking-excel-info-text">
                        ℹ️ 엑셀 파일(.xlsx)을 업로드하면 그대로 등록됩니다.
                    </span>

                    {/* 액션 버튼들 */}
                    <button className="banking-excel-btn-manual" onClick={() => downloadTemplate(activeTab)}>
                        📥 양식 다운로드
                    </button>
                    
                    <input type="file" accept=".xlsx, .xls" ref={fileInputRef} style={{display:'none'}} onChange={handleFileUpload} />
                    
                    <button className="banking-excel-btn-primary" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                        {loading ? '업로드 중...' : '📤 엑셀 업로드'}
                    </button>
                </div>
            </div>
        </div>

        {/* 테이블 영역 */}
        <div className="banking-excel-result-section">
            <div className="banking-excel-table-wrapper">
                {activeTab === 'bank' ? (
                    <table className="banking-excel-table">
                        <thead>
                            <tr>
                                <th style={{width:'150px'}}>거래일시</th>
                                <th>적요 / 예금주</th>
                                <th>의뢰인/수취인</th>
                                <th style={{textAlign:'right', width:'100px'}}>입금액</th>
                                <th style={{textAlign:'right', width:'100px'}}>출금액</th>
                                <th style={{textAlign:'right', width:'120px'}}>잔액</th>
                                <th>메모</th>
                                <th style={{width:'60px'}}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bankList.length === 0 ? (
                                <tr><td colSpan={8} className="banking-excel-no-data">등록된 내역이 없습니다.</td></tr>
                            ) : (
                                bankList.map((item) => (
                                    <tr key={item.id}>
                                        <td style={{fontSize:'12px', textAlign:'center'}}>{item.fullDateTime}</td>
                                        <td>{item.content}</td>
                                        <td style={{textAlign:'center'}}>{item.senderReceiver}</td>
                                        <td style={{textAlign:'right'}} className="banking-excel-amt-in">{item.inAmount > 0 ? item.inAmount.toLocaleString() : '-'}</td>
                                        <td style={{textAlign:'right'}} className="banking-excel-amt-out">{item.outAmount > 0 ? item.outAmount.toLocaleString() : '-'}</td>
                                        <td style={{textAlign:'right'}} className="banking-excel-amt-neutral">{item.balance.toLocaleString()}</td>
                                        <td>{item.memo}</td>
                                        <td style={{textAlign:'center'}}>
                                            <button className="banking-excel-btn-mini" onClick={() => handleDelete(item.id, item, 'bank')}>삭제</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                ) : (
                    <table className="banking-excel-table">
                        <thead>
                            <tr>
                                <th style={{width:'150px'}}>승인일시</th>
                                <th>카드명</th>
                                <th>가맹점명</th>
                                <th>승인번호</th>
                                <th>할부</th>
                                <th style={{textAlign:'right', width:'120px'}}>승인금액</th>
                                <th style={{width:'60px'}}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cardList.length === 0 ? (
                                <tr><td colSpan={7} className="banking-excel-no-data">등록된 내역이 없습니다.</td></tr>
                            ) : (
                                cardList.map((item) => (
                                    <tr key={item.id}>
                                        <td style={{fontSize:'12px', textAlign:'center'}}>{item.fullDateTime}</td>
                                        <td style={{textAlign:'center'}}>{item.cardName}</td>
                                        <td>{item.merchantName}</td>
                                        <td style={{textAlign:'center'}}>{item.approvalNo}</td>
                                        <td style={{textAlign:'center'}}>{item.installment}</td>
                                        <td style={{textAlign:'right'}} className="banking-excel-amt-neutral">{item.amount.toLocaleString()}</td>
                                        <td style={{textAlign:'center'}}>
                                            <button className="banking-excel-btn-mini" onClick={() => handleDelete(item.id, item, 'card')}>삭제</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    </div>
  );
};

export default AccountingBankingExcelPage;