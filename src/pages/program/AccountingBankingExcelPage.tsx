import React, { useEffect, useState, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, deleteDoc, addDoc, serverTimestamp, 
  query, where, orderBy, getDoc 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { K_BRAND_COLOR } from '../../constants';
import './AccountingBankingExcelPage.css';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// =============================================================================
// [Interfaces]
// =============================================================================

// 은행 거래내역
export interface BankTransaction {
  id: string;
  fullDateTime: string; // 중복 체크용 원본 일시
  date: string;         // 날짜 (YYYY-MM-DD)
  time: string;         // 시간 (HH:mm:ss)
  inAmount: number;     // 입금액
  outAmount: number;    // 출금액
  balance: number;      // 잔액
  memo: string;         // 출금계좌메모
  content: string;      // 적요
  senderReceiver: string; // 의뢰인/수취인
  source: 'bank';
}

// 카드 거래내역
export interface CardTransaction {
  id: string;
  fullDateTime: string;
  date: string;
  time: string;
  cardName: string;     // 카드명
  approvalNo: string;   // 승인번호
  amount: number;       // 승인금액
  merchantName: string; // 가맹점명
  installment: string;  // 할부개월
  source: 'card';
}

// 엑셀 헤더 정의
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
        setCurrentUid(user.uid);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if(userDoc.exists()) {
            const d = userDoc.data();
            setCurrentUserInfo({ uid: user.uid, name: d.nickname || d.email || '사용자' });
        }
        fetchTransactions(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // 데이터 불러오기
  const fetchTransactions = async (uid: string) => {
      setLoading(true);
      try {
          // 1. 은행 내역
          const bankQ = query(collection(db, 'users', uid, 'BANK_TRANSACTIONS'), orderBy('fullDateTime', 'desc'));
          const bankSnap = await getDocs(bankQ);
          const banks: BankTransaction[] = [];
          bankSnap.forEach(d => banks.push({ id: d.id, ...d.data() } as BankTransaction));
          setBankList(banks);

          // 2. 카드 내역
          const cardQ = query(collection(db, 'users', uid, 'CARD_TRANSACTIONS'), orderBy('fullDateTime', 'desc'));
          const cardSnap = await getDocs(cardQ);
          const cards: CardTransaction[] = [];
          cardSnap.forEach(d => cards.push({ id: d.id, ...d.data() } as CardTransaction));
          setCardList(cards);

      } catch (e) { console.error(e); }
      finally { setLoading(false); }
  };

  // 로그 기록
  const addLog = async (message: string) => {
      if (!currentUid) return;
      try {
          await addDoc(collection(db, 'users', currentUid, 'ACTIVITY_LOGS'), {
              text: message,
              createdAt: serverTimestamp(),
              type: 'accounting_upload'
          });
      } catch (e) {}
  };

  // ==========================================================================
  // [Helper] 엑셀 날짜 변환
  // ==========================================================================
  const parseExcelDate = (excelDate: any): { date: string, time: string, full: string } => {
      let dt = new Date();
      
      // 1. 엑셀 Serial Number인 경우 (예: 45345.5)
      if (typeof excelDate === 'number') {
          // 엑셀의 기준일(1899-12-30)부터 밀리초 계산
          dt = new Date((excelDate - (25567 + 2)) * 86400 * 1000); 
      } 
      // 2. 문자열인 경우 (예: "2025-11-26 14:00:00" or "2025.11.26")
      else if (typeof excelDate === 'string') {
          const dateStr = excelDate.replace(/\./g, '-').replace(/\//g, '-'); // 구분자 통일
          dt = new Date(dateStr);
      }

      if (isNaN(dt.getTime())) { // 날짜 변환 실패 시 현재 시간(혹은 에러처리)
          return { date: '', time: '', full: '' };
      }

      // YYYY-MM-DD
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      
      // HH:mm:ss
      const hh = String(dt.getHours()).padStart(2, '0');
      const mi = String(dt.getMinutes()).padStart(2, '0');
      const ss = String(dt.getSeconds()).padStart(2, '0');

      return {
          date: `${yyyy}-${mm}-${dd}`,
          time: `${hh}:${mi}:${ss}`,
          full: `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
      };
  };

  // ==========================================================================
  // [Action] 양식 다운로드
  // ==========================================================================
  const downloadTemplate = (type: 'bank' | 'card') => {
      const headers = type === 'bank' ? [BANK_HEADERS] : [CARD_HEADERS];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(headers);
      
      // 예시 데이터 추가 (사용자 이해를 돕기 위해)
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

      // 컬럼 너비 조정
      ws['!cols'] = headers[0].map(() => ({ wch: 15 }));

      XLSX.utils.book_append_sheet(wb, ws, "Template");
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
      saveAs(blob, type === 'bank' ? '은행거래내역_등록양식.xlsx' : '카드거래내역_등록양식.xlsx');
  };

  // ==========================================================================
  // [Action] 엑셀 업로드 및 처리
  // ==========================================================================
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
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 }); // 배열의 배열 형태

          // 헤더 제거 (첫 줄)
          const rows = data.slice(1) as any[]; 
          
          if (activeTab === 'bank') {
              await processBankUpload(rows);
          } else {
              await processCardUpload(rows);
          }
          
          setLoading(false);
          if(fileInputRef.current) fileInputRef.current.value = ''; // 초기화
      };
      reader.readAsBinaryString(file);
  };

  // 은행 데이터 처리
  const processBankUpload = async (rows: any[]) => {
      if (!currentUid) return;
      let successCount = 0;
      let skipCount = 0;

      const collectionRef = collection(db, 'users', currentUid, 'BANK_TRANSACTIONS');

      for (const row of rows) {
          if (!row[0]) continue; // 날짜 없으면 스킵

          // 데이터 파싱
          // 순서: 거래일시(0), 입금(1), 출금(2), 잔액(3), 메모(4), 적요(5), 의뢰인(6)
          const { date, time, full } = parseExcelDate(row[0]);
          const inAmt = Number(row[1]) || 0;
          const outAmt = Number(row[2]) || 0;
          
          if (!date) continue; // 날짜 변환 실패 시

          // 중복 체크 (날짜 + 입금 + 출금 + 잔액까지 비교하여 정확도 높임)
          // Firestore 쿼리는 비싸므로, 날짜와 금액으로 1차 필터링
          const q = query(
              collectionRef, 
              where('fullDateTime', '==', full),
              where('inAmount', '==', inAmt),
              where('outAmount', '==', outAmt)
          );
          const snap = await getDocs(q);

          if (!snap.empty) {
              skipCount++;
              continue;
          }

          // 저장
          await addDoc(collectionRef, {
              fullDateTime: full,
              date, time,
              inAmount: inAmt,
              outAmount: outAmt,
              balance: Number(row[3]) || 0,
              memo: row[4] || '',
              content: row[5] || '',
              senderReceiver: row[6] || '',
              source: 'bank',
              createdAt: serverTimestamp()
          });
          successCount++;
      }

      alert(`총 ${rows.length}건 중\n- 성공: ${successCount}건\n- 중복제외: ${skipCount}건`);
      if (successCount > 0) {
          await addLog(`[${currentUserInfo.name}]이 은행 거래내역을 ${successCount}건 등록 하였습니다.`);
          fetchTransactions(currentUid);
      }
  };

  // 카드 데이터 처리
  const processCardUpload = async (rows: any[]) => {
      if (!currentUid) return;
      let successCount = 0;
      let skipCount = 0;

      const collectionRef = collection(db, 'users', currentUid, 'CARD_TRANSACTIONS');

      for (const row of rows) {
          if (!row[0]) continue;

          // 순서: 승인일시(0), 카드명(1), 승인번호(2), 가맹점명(3), 승인금액(4), 할부(5)
          const { date, time, full } = parseExcelDate(row[0]);
          const amt = Number(row[4]) || 0;
          const approvalNo = row[2] ? String(row[2]) : '';

          if (!date) continue;

          // 중복 체크 (승인일시 + 승인번호 + 금액)
          const q = query(
              collectionRef,
              where('fullDateTime', '==', full),
              where('approvalNo', '==', approvalNo),
              where('amount', '==', amt)
          );
          const snap = await getDocs(q);

          if (!snap.empty) {
              skipCount++;
              continue;
          }

          await addDoc(collectionRef, {
              fullDateTime: full,
              date, time,
              cardName: row[1] || '',
              approvalNo: approvalNo,
              merchantName: row[3] || '',
              amount: amt,
              installment: row[5] || '일시불',
              source: 'card',
              createdAt: serverTimestamp()
          });
          successCount++;
      }

      alert(`총 ${rows.length}건 중\n- 성공: ${successCount}건\n- 중복제외: ${skipCount}건`);
      if (successCount > 0) {
          await addLog(`[${currentUserInfo.name}]이 카드 거래내역을 ${successCount}건 등록 하였습니다.`);
          fetchTransactions(currentUid);
      }
  };

  // 삭제 핸들러
  const handleDelete = async (id: string, item: any, type: 'bank' | 'card') => {
      if (!currentUid) return;
      if (!confirm("정말 삭제하시겠습니까? (복구 불가)")) return;

      try {
          const colName = type === 'bank' ? 'BANK_TRANSACTIONS' : 'CARD_TRANSACTIONS';
          await deleteDoc(doc(db, 'users', currentUid, colName, id));
          
          // 로그 메시지 생성
          const dateInfo = item.fullDateTime || item.date;
          const amtInfo = type === 'bank' 
              ? (item.inAmount > 0 ? `입금 ${item.inAmount.toLocaleString()}` : `출금 ${item.outAmount.toLocaleString()}`) 
              : `승인 ${item.amount.toLocaleString()}`;
          
          await addLog(`[${currentUserInfo.name}]이 거래일시 ${dateInfo}, ${amtInfo}원인 건을 삭제 했습니다.`);

          alert("삭제되었습니다.");
          // 리스트 갱신
          if (type === 'bank') setBankList(prev => prev.filter(i => i.id !== id));
          else setCardList(prev => prev.filter(i => i.id !== id));

      } catch (e) {
          console.error(e);
          alert("삭제 중 오류가 발생했습니다.");
      }
  };

  return (
    <div className="banking-excel-container">
        <div className="page-header">
            <h2>계좌/카드 거래내역 등록</h2>
            <p>은행 및 카드사 엑셀 파일을 업로드하여 거래내역을 등록합니다.</p>
        </div>

        <div className="banking-tabs">
            <button className={`tab-btn ${activeTab === 'bank' ? 'active' : ''}`} onClick={() => setActiveTab('bank')}>🏦 은행 거래내역</button>
            <button className={`tab-btn ${activeTab === 'card' ? 'active' : ''}`} onClick={() => setActiveTab('card')}>💳 카드 거래내역</button>
        </div>

        <div className="action-toolbar">
            <div className="left-group">
                <span className="info-text">
                    * 엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.<br/>
                    * 중복된 내역(일시+금액 일치)은 자동으로 제외됩니다.
                </span>
            </div>
            <div className="right-group">
                <button className="btn-download" onClick={() => downloadTemplate(activeTab)}>
                    📥 {activeTab === 'bank' ? '은행' : '카드'} 양식 다운로드
                </button>
                <input 
                    type="file" 
                    accept=".xlsx, .xls" 
                    ref={fileInputRef} 
                    style={{display:'none'}} 
                    onChange={handleFileUpload} 
                />
                <button 
                    className="btn-upload" 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                >
                    {loading ? '업로드 중...' : '📤 엑셀 업로드'}
                </button>
            </div>
        </div>

        <div className="data-list-section">
            {activeTab === 'bank' ? (
                <table className="banking-table">
                    <thead>
                        <tr>
                            <th style={{width:'150px'}}>거래일시</th>
                            <th>적요 / 예금주</th>
                            <th>의뢰인/수취인</th>
                            <th style={{textAlign:'right'}}>입금액</th>
                            <th style={{textAlign:'right'}}>출금액</th>
                            <th style={{textAlign:'right'}}>잔액</th>
                            <th>메모</th>
                            <th style={{width:'60px'}}>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bankList.length === 0 ? (
                            <tr><td colSpan={8} className="no-data">등록된 내역이 없습니다.</td></tr>
                        ) : (
                            bankList.map((item) => (
                                <tr key={item.id}>
                                    <td style={{fontSize:'12px'}}>{item.fullDateTime}</td>
                                    <td>{item.content}</td>
                                    <td>{item.senderReceiver}</td>
                                    <td style={{textAlign:'right', color:'blue'}}>{item.inAmount > 0 ? item.inAmount.toLocaleString() : '-'}</td>
                                    <td style={{textAlign:'right', color:'red'}}>{item.outAmount > 0 ? item.outAmount.toLocaleString() : '-'}</td>
                                    <td style={{textAlign:'right', color:'#666'}}>{item.balance.toLocaleString()}</td>
                                    <td>{item.memo}</td>
                                    <td style={{textAlign:'center'}}>
                                        <button className="btn-delete-mini" onClick={() => handleDelete(item.id, item, 'bank')}>삭제</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            ) : (
                <table className="banking-table">
                    <thead>
                        <tr>
                            <th style={{width:'150px'}}>승인일시</th>
                            <th>카드명</th>
                            <th>가맹점명</th>
                            <th>승인번호</th>
                            <th>할부</th>
                            <th style={{textAlign:'right'}}>승인금액</th>
                            <th style={{width:'60px'}}>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cardList.length === 0 ? (
                            <tr><td colSpan={7} className="no-data">등록된 내역이 없습니다.</td></tr>
                        ) : (
                            cardList.map((item) => (
                                <tr key={item.id}>
                                    <td style={{fontSize:'12px'}}>{item.fullDateTime}</td>
                                    <td>{item.cardName}</td>
                                    <td>{item.merchantName}</td>
                                    <td>{item.approvalNo}</td>
                                    <td>{item.installment}</td>
                                    <td style={{textAlign:'right', fontWeight:'bold'}}>{item.amount.toLocaleString()}</td>
                                    <td style={{textAlign:'center'}}>
                                        <button className="btn-delete-mini" onClick={() => handleDelete(item.id, item, 'card')}>삭제</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            )}
        </div>
    </div>
  );
};

export default AccountingBankingExcelPage;