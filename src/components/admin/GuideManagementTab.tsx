// src/components/admin/GuideManagementTab.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, query, orderBy, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import './PartnerManagementTab.css'; 

const GuideManagementTab: React.FC = () => {
  const navigate = useNavigate();
  const db = getFirestore();
  
  // 데이터 상태
  const [mainCats, setMainCats] = useState<any[]>([]);
  const [subCats, setSubCats] = useState<any[]>([]);
  
  // 입력 상태
  const [newMainTitle, setNewMainTitle] = useState('');
  const [newSubTitle, setNewSubTitle] = useState('');
  const [newSubOrder, setNewSubOrder] = useState<number>(1);
  
  const [selectedMainId, setSelectedMainId] = useState('');

  // 데이터 로드
  const fetchMain = async () => {
    const q = query(collection(db, 'guideMainCategories'), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    setMainCats(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const fetchSub = async () => {
    const q = query(collection(db, 'guideSubCategories'), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    setSubCats(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { fetchMain(); fetchSub(); }, []);

  // 메인 카테고리 추가
  const addMain = async () => {
    if(!newMainTitle) return;
    await addDoc(collection(db, 'guideMainCategories'), { 
        title: newMainTitle, 
        order: mainCats.length + 1 
    });
    setNewMainTitle(''); 
    fetchMain();
  };

  // 서브 카테고리 추가
  const addSub = async () => {
    if(!newSubTitle || !selectedMainId) return alert('메인 메뉴를 선택하고 이름을 입력하세요');
    
    await addDoc(collection(db, 'guideSubCategories'), { 
        title: newSubTitle, 
        parentId: selectedMainId, 
        order: Number(newSubOrder) 
    });
    
    setNewSubTitle(''); 
    setNewSubOrder(prev => prev + 1); 
    fetchSub();
  };

  // [⭐ 추가] 서브 카테고리 이름 수정 핸들러
  const updateSubTitle = async (id: string, currentTitle: string) => {
    const newTitle = prompt("수정할 메뉴명을 입력하세요:", currentTitle);
    if (newTitle === null) return; // 취소
    if (newTitle.trim() === "") return alert("메뉴명을 입력해주세요.");

    try {
        await updateDoc(doc(db, 'guideSubCategories', id), { title: newTitle });
        fetchSub(); // 목록 갱신
    } catch (e) {
        console.error(e);
        alert("수정 실패");
    }
  };

  // 서브 카테고리 순서 변경 핸들러
  const updateSubOrder = async (id: string, currentOrder: number) => {
      const newOrderStr = prompt("변경할 순서 번호를 입력하세요:", String(currentOrder));
      if (newOrderStr === null) return; 
      
      const newOrder = Number(newOrderStr);
      if (isNaN(newOrder)) return alert("숫자만 입력해주세요.");

      try {
          await updateDoc(doc(db, 'guideSubCategories', id), { order: newOrder });
          fetchSub(); 
      } catch (e) {
          console.error(e);
          alert("수정 실패");
      }
  };

  // 삭제 핸들러
  const deleteDocItem = async (col: string, id: string) => {
    if(!confirm('삭제하시겠습니까? (하위 글이 있다면 연결이 끊길 수 있습니다)')) return;
    await deleteDoc(doc(db, col, id));
    if(col === 'guideMainCategories') fetchMain(); else fetchSub();
  };

  return (
    <div className="partner-tab-content">
      <h3>이용안내 관리</h3>
      <div style={{marginBottom: '20px'}}>
        <button 
          className="detail-button" 
          style={{background:'#28a745', fontSize:'14px', padding:'10px 20px'}}
          onClick={() => navigate('/admin/guide/write')}
        >
          + 이용안내 글 작성하러 가기
        </button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
        
        {/* 1. 상단 탭 관리 */}
        <div style={{border:'1px solid #ddd', padding:'15px', borderRadius:'8px'}}>
          <h4>1. 상단 탭 (메인 카테고리)</h4>
          <div style={{display:'flex', gap:'5px', marginBottom:'10px'}}>
            <input type="text" value={newMainTitle} onChange={e=>setNewMainTitle(e.target.value)} placeholder="예: 고객" className="admin-search-bar" />
            <button onClick={addMain} className="detail-button">추가</button>
          </div>
          <ul>
            {mainCats.map(m => (
              <li key={m.id} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #eee'}}>
                <span>{m.order}. {m.title}</span>
                <button onClick={()=>deleteDocItem('guideMainCategories', m.id)} style={{color:'red', border:'none', background:'none', cursor:'pointer'}}>삭제</button>
              </li>
            ))}
          </ul>
        </div>

        {/* 2. 사이드바 메뉴 관리 */}
        <div style={{border:'1px solid #ddd', padding:'15px', borderRadius:'8px'}}>
          <h4>2. 사이드바 메뉴 (서브 카테고리)</h4>
          
          <div style={{marginBottom:'10px'}}>
             <select className="admin-search-bar" style={{width:'100%'}} value={selectedMainId} onChange={e=>setSelectedMainId(e.target.value)}>
                <option value="">-- 상단 탭 선택 --</option>
                {mainCats.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
             </select>
          </div>
          
          <div style={{display:'flex', gap:'5px', marginBottom:'10px'}}>
            <input 
                type="number" 
                value={newSubOrder} 
                onChange={e=>setNewSubOrder(Number(e.target.value))} 
                placeholder="순서" 
                className="admin-search-bar" 
                style={{width:'60px', textAlign:'center'}} 
            />
            <input 
                type="text" 
                value={newSubTitle} 
                onChange={e=>setNewSubTitle(e.target.value)} 
                placeholder="예: 회원가입 안내" 
                className="admin-search-bar" 
                style={{flex:1}}
            />
            <button onClick={addSub} className="detail-button">추가</button>
          </div>

          <ul style={{maxHeight:'400px', overflowY:'auto'}}>
            {subCats.filter(s => s.parentId === selectedMainId).map(s => (
              <li key={s.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #eee'}}>
                <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                    <span style={{fontWeight:'bold', color:'#007bff', minWidth:'20px'}}>{s.order}</span>
                    <span>{s.title}</span>
                </div>
                <div style={{display:'flex', gap:'5px'}}>
                    {/* [⭐ 추가] 이름 수정 버튼 */}
                    <button 
                        onClick={()=>updateSubTitle(s.id, s.title)} 
                        style={{fontSize:'12px', padding:'2px 6px', border:'1px solid #ddd', background:'#fff', cursor:'pointer', borderRadius:'4px'}}
                    >
                        이름수정
                    </button>

                    {/* 순서 변경 버튼 */}
                    <button 
                        onClick={()=>updateSubOrder(s.id, s.order)} 
                        style={{fontSize:'12px', padding:'2px 6px', border:'1px solid #ddd', background:'#fff', cursor:'pointer', borderRadius:'4px'}}
                    >
                        순서변경
                    </button>
                    <button onClick={()=>deleteDocItem('guideSubCategories', s.id)} style={{color:'red', border:'none', background:'none', cursor:'pointer'}}>X</button>
                </div>
              </li>
            ))}
            {!selectedMainId && <li style={{color:'#999', textAlign:'center', padding:'20px'}}>상단 탭을 먼저 선택해주세요.</li>}
          </ul>
        </div>

      </div>
    </div>
  );
};

export default GuideManagementTab;