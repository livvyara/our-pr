import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc, updateDoc, 
  query, orderBy, writeBatch, getDoc 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import { K_BRAND_COLOR } from '../../constants';
import './AccountingExpenseCategoryPage.css';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// [Data] 기본 초기화 데이터
const DEFAULT_SITE_L2_COMMON = [
    "자재비", "인건비", "식대", "경비", 
    "장비사용료", "운반비", "폐기물처리비", "소모품비", "외주용역비"
];

const DEFAULT_SITE_L1 = [
    "목공사", "전기공사", "설비공사", "필름공사", "도장(페인트)공사", 
    "바닥재공사", "도배공사", "금속/잡철공사", "간판/사인공사",
    "철거공사", "미장/조적/방수", "타일/석재공사", "창호/유리공사", 
    "가구/주방공사", "소방/공조/에어컨", "준공청소", "가설공사", "기타공사"
];

const DEFAULT_GENERAL_DATA = [
    { name: "급여/임금", subs: ["임원급여", "직원급여", "상여금", "제수당", "퇴직급여", "일용직임금"] },
    { name: "복리후생비", subs: ["식대", "회식비", "4대보험료", "경조사비", "피복비", "건강검진비"] },
    { name: "여비교통비", subs: ["주유/유류대", "주차/통행료", "교통비", "숙박비", "차량유지비", "차량보험료"] },
    { name: "통신/수도광열", subs: ["전기요금", "수도요금", "가스요금", "통신비(인터넷/전화)", "우편료"] },
    { name: "사무/전산관리", subs: ["소모품비", "사무용품비", "도서인쇄비", "전산유지비", "소프트웨어구입"] },
    { name: "임차료", subs: ["사무실임차료", "기숙사임차료", "창고임차료", "장비리스료", "복사기렌탈료"] },
    { name: "접대비", subs: ["거래처식대", "선물대", "경조사비(거래처)"] },
    { name: "세금과공과", subs: ["재산세", "자동차세", "면허세", "협회비", "과태료/범칙금"] },
    { name: "지급수수료", subs: ["세무기장료", "법률수수료", "이체수수료", "용역비", "안전관리대행료"] },
    { name: "광고선전비", subs: ["온라인광고비", "홍보물제작", "간판제작(본사)"] },
    { name: "금융비용", subs: ["이자비용", "대출수수료"] },
    { name: "잡이익/잡손실", subs: ["잡이익", "잡손실"] }
];

export interface ExpenseCategory {
  id: string;
  name: string;
  subCategories: string[]; 
  order: number; 
}

type CategoryType = 'site' | 'general';

const AccountingExpenseCategoryPage: React.FC = () => {
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentTab, setCurrentTab] = useState<CategoryType>('site');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add1' | 'edit1' | 'add2' | 'edit2'>('add1');
  const [inputValue, setInputValue] = useState('');
  const [editTargetIndex, setEditTargetIndex] = useState<number>(-1);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if(userDoc.exists()) {
                const d = userDoc.data();
                let targetUid = user.uid;
                if (d.role === 'sub_partner' && d.partnerInfo && d.partnerInfo.ownerUid) {
                    targetUid = d.partnerInfo.ownerUid;
                }
                setCurrentUid(targetUid);
            }
        } catch (e) { console.error("사용자 정보 로드 실패", e); }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUid) {
        fetchCategories(currentUid);
        setSelectedCategory(null);
    }
  }, [currentUid, currentTab]);

  const getCollectionName = () => {
      return currentTab === 'site' ? 'EXPENSE_CATEGORIES_SITE' : 'EXPENSE_CATEGORIES_GENERAL';
  };

  const fetchCategories = async (uid: string) => {
    setLoading(true);
    try {
      const colName = getCollectionName();
      const q = query(collection(db, 'users', uid, colName), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      
      let list: ExpenseCategory[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({ 
            id: doc.id, 
            name: d.name, 
            subCategories: d.subCategories || [],
            order: d.order ?? 9999 
        });
      });
      setCategories(list);
    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  };

  const handleMoveLevel1 = async (index: number, direction: 'up' | 'down') => {
      if (!currentUid) return;
      
      const newCategories = [...categories];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= newCategories.length) return;

      [newCategories[index], newCategories[targetIndex]] = [newCategories[targetIndex], newCategories[index]];
      setCategories(newCategories);

      try {
          const batch = writeBatch(db);
          const colName = getCollectionName();
          newCategories.forEach((cat, idx) => {
              const docRef = doc(db, 'users', currentUid, colName, cat.id);
              batch.update(docRef, { order: idx });
          });
          await batch.commit();
      } catch (e) {
          console.error("순서 저장 실패:", e);
          fetchCategories(currentUid); 
      }
  };

  const handleMoveLevel2 = async (index: number, direction: 'up' | 'down') => {
      if (!currentUid || !selectedCategory) return;

      const newSubs = [...selectedCategory.subCategories];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= newSubs.length) return;

      [newSubs[index], newSubs[targetIndex]] = [newSubs[targetIndex], newSubs[index]];

      try {
          const colName = getCollectionName();
          const docRef = doc(db, 'users', currentUid, colName, selectedCategory.id);
          await updateDoc(docRef, { subCategories: newSubs });

          const updatedCat = { ...selectedCategory, subCategories: newSubs };
          setSelectedCategory(updatedCat);
          setCategories(prev => prev.map(c => c.id === updatedCat.id ? updatedCat : c));
      } catch (e) { console.error("순서 저장 실패:", e); }
  };

  const handleInitializeDefaults = async () => {
      if (!currentUid) return;
      if (categories.length > 0) {
          if (!confirm("이미 등록된 분류가 있습니다. 기본값을 추가로 등록하시겠습니까?\n(기존 데이터 아래에 추가됩니다)")) return;
      } else {
          if (!confirm(`${currentTab === 'site' ? '현장' : '기타/관리'} 지출 분류 기본값을 생성하시겠습니까?`)) return;
      }

      setLoading(true);
      try {
          const colName = getCollectionName();
          const batch = writeBatch(db);
          let startOrder = categories.length; 

          if (currentTab === 'site') {
              DEFAULT_SITE_L1.forEach((name, idx) => {
                  const docRef = doc(collection(db, 'users', currentUid, colName));
                  batch.set(docRef, {
                      name: name, subCategories: DEFAULT_SITE_L2_COMMON, order: startOrder + idx
                  });
              });
          } else {
              DEFAULT_GENERAL_DATA.forEach((item, idx) => {
                  const docRef = doc(collection(db, 'users', currentUid, colName));
                  batch.set(docRef, {
                      name: item.name, subCategories: item.subs, order: startOrder + idx
                  });
              });
          }
          await batch.commit();
          alert("기본 분류가 생성되었습니다.");
          fetchCategories(currentUid);
      } catch (e) {
          console.error("초기화 실패:", e);
          alert("초기화 중 오류가 발생했습니다.");
      } finally { setLoading(false); }
  };

  const handleDeleteLevel1 = async (cat: ExpenseCategory) => {
    if (!currentUid) return;
    if (!confirm(`'${cat.name}' 분류를 삭제하시겠습니까?`)) return;

    try {
      const colName = getCollectionName();
      await deleteDoc(doc(db, 'users', currentUid, colName, cat.id));
      setCategories(prev => prev.filter(c => c.id !== cat.id));
      if (selectedCategory?.id === cat.id) setSelectedCategory(null);
    } catch (e) { alert("삭제 실패"); }
  };

  const handleDeleteLevel2 = async (subName: string, index: number) => {
    if (!currentUid || !selectedCategory) return;
    if (!confirm(`'${subName}' 항목을 삭제하시겠습니까?`)) return;

    try {
      const newSubs = [...selectedCategory.subCategories];
      newSubs.splice(index, 1);
      const colName = getCollectionName();
      const docRef = doc(db, 'users', currentUid, colName, selectedCategory.id);
      await updateDoc(docRef, { subCategories: newSubs });

      const updatedCat = { ...selectedCategory, subCategories: newSubs };
      setSelectedCategory(updatedCat);
      setCategories(prev => prev.map(c => c.id === updatedCat.id ? updatedCat : c));
    } catch (e) { alert("삭제 실패"); }
  };

  const handleSave = async () => {
    if (!currentUid || !inputValue.trim()) return alert("내용을 입력해주세요.");

    try {
      const colName = getCollectionName();

      if (modalMode === 'add1') {
        const newDocRef = doc(collection(db, 'users', currentUid, colName));
        const newOrder = categories.length; 
        const newCat: ExpenseCategory = { 
            id: newDocRef.id, name: inputValue.trim(), subCategories: [], order: newOrder
        };
        await setDoc(newDocRef, newCat);
        setCategories(prev => [...prev, newCat]);
      }
      else if (modalMode === 'edit1' && selectedCategory) {
        const docRef = doc(db, 'users', currentUid, colName, selectedCategory.id);
        await updateDoc(docRef, { name: inputValue.trim() });
        const updatedCat = { ...selectedCategory, name: inputValue.trim() };
        setCategories(prev => prev.map(c => c.id === updatedCat.id ? updatedCat : c));
        setSelectedCategory(updatedCat);
      }
      else if (modalMode === 'add2' && selectedCategory) {
        const newSubs = [...selectedCategory.subCategories, inputValue.trim()];
        const docRef = doc(db, 'users', currentUid, colName, selectedCategory.id);
        await updateDoc(docRef, { subCategories: newSubs });
        const updatedCat = { ...selectedCategory, subCategories: newSubs };
        setCategories(prev => prev.map(c => c.id === updatedCat.id ? updatedCat : c));
        setSelectedCategory(updatedCat);
      }
      else if (modalMode === 'edit2' && selectedCategory && editTargetIndex >= 0) {
        const newSubs = [...selectedCategory.subCategories];
        newSubs[editTargetIndex] = inputValue.trim();
        const docRef = doc(db, 'users', currentUid, colName, selectedCategory.id);
        await updateDoc(docRef, { subCategories: newSubs });
        const updatedCat = { ...selectedCategory, subCategories: newSubs };
        setCategories(prev => prev.map(c => c.id === updatedCat.id ? updatedCat : c));
        setSelectedCategory(updatedCat);
      }

      setIsModalOpen(false);
      setInputValue('');
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  const openModal = (mode: 'add1' | 'edit1' | 'add2' | 'edit2', initialValue = '', index = -1) => {
    setModalMode(mode);
    setInputValue(initialValue);
    setEditTargetIndex(index);
    setIsModalOpen(true);
  };

  return (
    <div className="expense-category-page-container">
      {/* 1. 헤더 (통합 페이지 스타일) */}
      <div className="expense-category-header-wrapper">
          <div className="expense-category-title">
            <h2>지출품목 설정</h2>
            <p>매입/지출 결의 및 세금계산서/현금영수증 조회 시 사용할 분류를 설정합니다.</p>
          </div>
          
          {/* 2. 컨트롤 패널 (회색 박스) */}
          <div className="expense-category-control-panel">
               <div className="expense-category-filter-row">
                    {/* 모드 버튼 (탭) */}
                    <div className="expense-category-mode-buttons">
                        <button 
                            className={`expense-category-mode-btn ${currentTab === 'site' ? 'active' : ''}`} 
                            onClick={() => setCurrentTab('site')}
                        >
                            🏗️ 현장 지출품목
                        </button>
                        <button 
                            className={`expense-category-mode-btn ${currentTab === 'general' ? 'active' : ''}`} 
                            onClick={() => setCurrentTab('general')}
                        >
                            🏢 기타/관리 지출품목
                        </button>
                    </div>
                    <span className="expense-category-info-text">
                        ℹ️ 분류를 선택하고 하위 항목을 관리하세요.
                    </span>
               </div>

               {/* 우측 액션 버튼 */}
               <button className="expense-category-btn-manual" onClick={handleInitializeDefaults}>
                   🔄 기본값 셋팅하기
               </button>
          </div>
      </div>

      {/* 3. 메인 콘텐츠 (2단 컬럼 - 통합 페이지 테이블 스타일 적용) */}
      <div className="expense-category-content-wrapper">
        
        {/* [좌측] 1차 분류 */}
        <div className="expense-category-column">
            <div className="expense-category-column-header">
                <h3>1차 분류 ({currentTab === 'site' ? '대공종' : '대분류'})</h3>
                <button className="expense-category-btn-add" onClick={() => openModal('add1')}>+ 추가</button>
            </div>
            <div className="expense-category-list">
                {loading ? <p className="expense-category-empty">로딩 중...</p> : categories.map((cat, idx) => (
                    <div 
                        key={cat.id} 
                        className={`expense-category-item ${selectedCategory?.id === cat.id ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(cat)}
                    >
                        <span>{cat.name}</span>
                        
                        <div className="expense-category-item-actions">
                            <button onClick={(e) => { e.stopPropagation(); handleMoveLevel1(idx, 'up'); }} disabled={idx === 0} className="expense-category-btn-icon" title="위로">▲</button>
                            <button onClick={(e) => { e.stopPropagation(); handleMoveLevel1(idx, 'down'); }} disabled={idx === categories.length - 1} className="expense-category-btn-icon" title="아래로">▼</button>
                            <button onClick={(e) => { e.stopPropagation(); openModal('edit1', cat.name); }} className="expense-category-btn-icon">✎</button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteLevel1(cat); }} className="expense-category-btn-icon del">×</button>
                        </div>
                    </div>
                ))}
                {!loading && categories.length === 0 && <div className="expense-category-empty">등록된 분류가 없습니다.</div>}
            </div>
        </div>

        <div className="expense-category-arrow">▶</div>

        {/* [우측] 2차 분류 */}
        <div className="expense-category-column">
            <div className="expense-category-column-header">
                <h3>2차 분류 ({currentTab === 'site' ? '상세공종' : '상세분류'})</h3>
                <button 
                    className="expense-category-btn-add" 
                    onClick={() => openModal('add2')} 
                    disabled={!selectedCategory}
                >
                    + 추가
                </button>
            </div>
            <div className="expense-category-list">
                {!selectedCategory ? (
                    <div className="expense-category-empty">좌측에서 1차 분류를 먼저 선택해주세요.</div>
                ) : (
                    <>
                        {selectedCategory.subCategories.map((sub, idx) => (
                            <div key={idx} className="expense-category-item">
                                <span>└ {sub}</span>
                                <div className="expense-category-item-actions">
                                    <button onClick={() => handleMoveLevel2(idx, 'up')} disabled={idx === 0} className="expense-category-btn-icon" title="위로">▲</button>
                                    <button onClick={() => handleMoveLevel2(idx, 'down')} disabled={idx === selectedCategory.subCategories.length - 1} className="expense-category-btn-icon" title="아래로">▼</button>
                                    <button onClick={() => openModal('edit2', sub, idx)} className="expense-category-btn-icon">✎</button>
                                    <button onClick={() => handleDeleteLevel2(sub, idx)} className="expense-category-btn-icon del">×</button>
                                </div>
                            </div>
                        ))}
                        {selectedCategory.subCategories.length === 0 && (
                            <div className="expense-category-empty">등록된 2차 분류가 없습니다.</div>
                        )}
                    </>
                )}
            </div>
        </div>
      </div>

      {/* 입력/수정 모달 */}
      {isModalOpen && (
        <div className="expense-category-modal-backdrop" onClick={() => setIsModalOpen(false)}>
            <div className="expense-category-modal-paper" onClick={e => e.stopPropagation()}>
                <h3 className="expense-category-modal-title">
                    {modalMode === 'add1' ? '1차 분류 추가' : 
                     modalMode === 'edit1' ? '1차 분류 수정' :
                     modalMode === 'add2' ? '2차 분류 추가' : '2차 분류 수정'}
                </h3>
                <input 
                    type="text" 
                    className="expense-category-modal-input"
                    value={inputValue} 
                    onChange={e => setInputValue(e.target.value)}
                    placeholder={currentTab === 'site' ? "예: 목공사, 전기공사..." : "예: 식대, 교통비..."}
                    onKeyPress={e => e.key === 'Enter' && handleSave()}
                    autoFocus
                />
                <div className="expense-category-modal-btns">
                    <button onClick={() => setIsModalOpen(false)} className="expense-category-btn-cancel">취소</button>
                    <button onClick={handleSave} className="expense-category-btn-save" style={{background: K_BRAND_COLOR}}>저장</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AccountingExpenseCategoryPage;