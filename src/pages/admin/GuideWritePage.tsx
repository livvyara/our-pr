// src/pages/admin/GuideWritePage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getFirestore, collection, query, orderBy, getDocs, addDoc, updateDoc, doc, serverTimestamp, where } from 'firebase/firestore';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { K_BRAND_COLOR } from '../../constants';
import './GuideWritePage.css'; 

interface Category { id: string; title: string; }

const GuideWritePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const db = getFirestore();

  const editData = location.state?.postData || null;

  const [title, setTitle] = useState(editData?.title || '');
  const [content, setContent] = useState(editData?.content || '');
  
  // [⭐ 추가] 정렬 순서 (기본값 1)
  const [order, setOrder] = useState<number>(editData?.order || 1);

  const [mainCats, setMainCats] = useState<Category[]>([]);
  const [subCats, setSubCats] = useState<Category[]>([]);

  const [selectedMain, setSelectedMain] = useState(editData?.mainCategoryId || '');
  const [selectedSub, setSelectedSub] = useState(editData?.subCategoryId || '');
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. 메인 카테고리 로드
  useEffect(() => {
    const fetchMain = async () => {
      const q = query(collection(db, 'guideMainCategories'), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      setMainCats(snap.docs.map(d => ({ id: d.id, title: d.data().title })));
    };
    fetchMain();
  }, [db]);

  // 2. 서브 카테고리 로드
  useEffect(() => {
    if (!selectedMain) {
      setSubCats([]); return;
    }
    const fetchSub = async () => {
      const q = query(
        collection(db, 'guideSubCategories'), 
        where('parentId', '==', selectedMain),
        orderBy('order', 'asc')
      );
      const snap = await getDocs(q);
      setSubCats(snap.docs.map(d => ({ id: d.id, title: d.data().title })));
    };
    fetchSub();
  }, [selectedMain, db]);

  const handleSave = async () => {
    if (!selectedMain || !selectedSub) return alert('상단 탭과 사이드바 그룹을 선택해주세요.');
    if (!title.trim() || !content.trim()) return alert('제목과 내용을 입력해주세요.');
    if (!confirm('저장하시겠습니까?')) return;

    setIsSubmitting(true);
    try {
      const postData = {
        title, 
        content, 
        mainCategoryId: selectedMain, 
        subCategoryId: selectedSub,
        order: Number(order), // [⭐ 추가] 순서 저장
        updatedAt: serverTimestamp()
      };

      if (editData?.id) {
        await updateDoc(doc(db, 'guidePosts', editData.id), postData);
        alert('수정되었습니다.');
      } else {
        await addDoc(collection(db, 'guidePosts'), postData);
        alert('등록되었습니다.');
      }
      navigate(-1); 
    } catch (e) {
      console.error(e);
      alert('저장 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      ['image', 'link'],
      ['clean']
    ],
  };

  return (
    <div className="guide-write-container">
      <h2>이용안내 글 작성</h2>
      
      <div className="write-form-row">
        <select value={selectedMain} onChange={e => { setSelectedMain(e.target.value); setSelectedSub(''); }}>
          <option value="">상단 탭 선택</option>
          {mainCats.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>

        <select value={selectedSub} onChange={e => setSelectedSub(e.target.value)} disabled={!selectedMain}>
          <option value="">사이드바 그룹 선택</option>
          {subCats.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>

        {/* [⭐ 추가] 순서 입력 필드 */}
        <div style={{display:'flex', alignItems:'center', gap:'5px'}}>
            <label style={{fontWeight:'bold', fontSize:'14px'}}>순서:</label>
            <input 
                type="number" 
                value={order} 
                onChange={e => setOrder(Number(e.target.value))}
                style={{width:'60px', padding:'10px', borderRadius:'5px', border:'1px solid #ccc'}}
                min="1"
            />
        </div>
      </div>

      <input 
        type="text" 
        className="guide-title-input"
        value={title} 
        onChange={e => setTitle(e.target.value)} 
        placeholder="글 제목을 입력하세요 (사이드바에 표시됩니다)" 
      />

      <div className="editor-wrapper">
        <ReactQuill 
          theme="snow"
          value={content}
          onChange={setContent}
          modules={modules}
          style={{ height: '500px' }}
        />
      </div>

      <div className="write-actions">
        <button className="btn-cancel" onClick={() => navigate(-1)}>취소</button>
        <button className="btn-save" style={{backgroundColor: K_BRAND_COLOR}} onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
};

export default GuideWritePage;