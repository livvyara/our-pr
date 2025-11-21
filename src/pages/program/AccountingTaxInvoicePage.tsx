import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth'; // [추가] 인증 모듈
import { firebaseConfig } from '../../firebase-config';
import { K_BRAND_COLOR } from '../../constants';
import './AccountingTaxInvoicePage.css'; 

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Props 제거 (직접 조회하므로 필요 없음)
interface TaxInvoice {
  id: string; 
  writeDate: string; 
  type: string; 
  inOut: '매출' | '매입'; 
  vendorName: string; 
  supplyAmount: number; 
  taxAmount: number; 
  totalAmount: number; 
  remark: string; 
}

const AccountingTaxInvoicePage: React.FC = () => {
  const [dataList, setDataList] = useState<TaxInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(null); // 현재 유저 ID

  const [summary, setSummary] = useState({
    totalCount: 0,
    totalSupply: 0,
    totalTax: 0,
    totalSum: 0
  });

  // 1. 로그인 사용자 확인
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUid(user.uid);
      } else {
        // 로그아웃 상태 처리 (필요 시)
        setCurrentUid(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. 데이터 로드 (UID가 설정되면 실행)
  useEffect(() => {
    if (currentUid) {
        fetchData(currentUid);
    }
  }, [currentUid]);

  const fetchData = async (uid: string) => {
    setLoading(true);
    try {
      const list: TaxInvoice[] = [];

      // (A) 매출 (TAX_SALES)
      const salesRef = collection(db, 'users', uid, 'TAX_SALES');
      const salesSnap = await getDocs(salesRef);
      
      salesSnap.forEach(doc => {
        const data = doc.data();
        list.push({
          id: doc.id,
          writeDate: data.writeDate || '',
          type: data.type || '전자세금계산서',
          inOut: '매출',
          vendorName: data.buyerName || '(정보없음)', 
          supplyAmount: Number(data.supplyAmount || 0),
          taxAmount: Number(data.taxAmount || 0),
          totalAmount: Number(data.totalAmount || 0),
          remark: data.remark || ''
        });
      });

      // (B) 매입 (TAX_PURCHASE)
      const purchaseRef = collection(db, 'users', uid, 'TAX_PURCHASE');
      const purchaseSnap = await getDocs(purchaseRef);
      
      purchaseSnap.forEach(doc => {
        const data = doc.data();
        list.push({
          id: doc.id,
          writeDate: data.writeDate || '',
          type: data.type || '전자세금계산서',
          inOut: '매입',
          vendorName: data.vendorName || '(정보없음)', 
          supplyAmount: Number(data.supplyAmount || 0),
          taxAmount: Number(data.taxAmount || 0),
          totalAmount: Number(data.totalAmount || 0),
          remark: data.remark || ''
        });
      });

      // (C) 정렬 (날짜 내림차순)
      list.sort((a, b) => {
          const dateA = a.writeDate ? new Date(a.writeDate).getTime() : 0;
          const dateB = b.writeDate ? new Date(b.writeDate).getTime() : 0;
          return dateB - dateA;
      });

      setDataList(list);
      
      // 요약 계산
      const sum = list.reduce((acc, cur) => ({
          supply: acc.supply + cur.supplyAmount,
          tax: acc.tax + cur.taxAmount,
          total: acc.total + cur.totalAmount
      }), { supply: 0, tax: 0, total: 0 });

      setSummary({
          totalCount: list.length,
          totalSupply: sum.supply,
          totalTax: sum.tax,
          totalSum: sum.total
      });

    } catch (error) {
      console.error("데이터 로드 실패:", error);
      alert("데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hometax-page-container">
      {/* 헤더 */}
      <div className="hometax-header">
        <div>
            <h2>세금계산서 통합 조회</h2>
            <p>홈택스에서 수집된 매입/매출 전자세금계산서 내역입니다.</p>
        </div>
        <button 
            className="btn-refresh"
            onClick={() => currentUid && fetchData(currentUid)} 
        >
            🔄 새로고침
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="hometax-top-grid">
         <div className="hometax-card summary">
             <span>총 건수</span>
             <strong>{summary.totalCount.toLocaleString()} 건</strong>
         </div>
         <div className="hometax-card summary">
             <span>총 공급가액</span>
             <strong style={{color: K_BRAND_COLOR}}>{summary.totalSupply.toLocaleString()} 원</strong>
         </div>
         <div className="hometax-card summary">
             <span>총 세액</span>
             <strong>{summary.totalTax.toLocaleString()} 원</strong>
         </div>
         <div className="hometax-card summary total">
             <span>총 합계금액</span>
             <strong>{summary.totalSum.toLocaleString()} 원</strong>
         </div>
      </div>

      {/* 리스트 테이블 */}
      <div className="hometax-result-section">
        <div className="result-table-wrapper">
          <table className="hometax-table">
            <thead>
              <tr>
                <th>작성일자</th>
                <th>구분</th>
                <th>종류</th>
                <th>거래처명</th>
                <th style={{textAlign:'right'}}>공급가액</th>
                <th style={{textAlign:'right'}}>세액</th>
                <th style={{textAlign:'right'}}>합계금액</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{textAlign:'center', padding:'50px'}}>데이터를 불러오는 중입니다...</td></tr>
              ) : dataList.length === 0 ? (
                <tr><td colSpan={8} className="no-data">수집된 내역이 없습니다.</td></tr>
              ) : (
                dataList.map((item) => (
                  <tr key={item.id}>
                    <td style={{textAlign:'center'}}>{item.writeDate}</td>
                    <td style={{textAlign:'center'}}>
                        <span className={`type-badge ${item.inOut === '매출' ? 'sales' : 'purchase'}`}>
                            {item.inOut}
                        </span>
                    </td>
                    <td style={{textAlign:'center', color:'#666'}}>{item.type}</td>
                    <td style={{fontWeight:'bold'}}>{item.vendorName}</td>
                    <td style={{textAlign:'right'}}>{item.supplyAmount.toLocaleString()}</td>
                    <td style={{textAlign:'right', color:'#888'}}>{item.taxAmount.toLocaleString()}</td>
                    <td style={{textAlign:'right', fontWeight:'bold'}}>{item.totalAmount.toLocaleString()}</td>
                    <td style={{color:'#999', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                        {item.remark}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AccountingTaxInvoicePage;